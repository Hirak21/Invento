import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import DESCENDING

from app.utils.errors import BusinessRuleError

VALID_PERIODS = {"today", "7d", "month", "custom"}


def resolve_period(
    period: str,
    date_from: str | None = None,
    date_to: str | None = None,
    tz_offset_minutes: int = 0,
) -> tuple[datetime, datetime]:
    """Half-open [start, end) UTC instants for the requested period.

    Day boundaries are computed in the client's timezone (offset from JS
    `new Date().getTimezoneOffset()`, negated minutes) so "today" means the
    owner's today — critical for IST (+5:30) users.
    """
    if period not in VALID_PERIODS:
        raise BusinessRuleError("Invalid period.")
    shift = timedelta(minutes=tz_offset_minutes)
    local_now = datetime.now(UTC) + shift
    day_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)

    if period == "today":
        start_local, end_local = day_start, day_start + timedelta(days=1)
    elif period == "7d":
        start_local = day_start - timedelta(days=6)
        end_local = day_start + timedelta(days=1)
    elif period == "month":
        start_local = day_start.replace(day=1)
        next_month = (start_local + timedelta(days=32)).replace(day=1)
        end_local = next_month
    else:  # custom
        try:
            start_local = datetime.strptime(date_from or "", "%Y-%m-%d")
            end_exclusive = datetime.strptime(date_to or "", "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise BusinessRuleError("Provide valid from/to dates for a custom period.") from None
        if end_exclusive <= start_local:
            raise BusinessRuleError("'to' date must be on or after 'from' date.")
        return start_local - shift, end_exclusive - shift

    return start_local - shift, end_local - shift


def _dec128_sum_pipeline(field: str) -> list[dict[str, Any]]:
    return [{"$group": {"_id": None, "total": {"$sum": {"$toDecimal": f"${field}"}}}}]


def _decimal128_to_str(value: Any) -> str:
    if value is None:
        return "0.00"
    if hasattr(value, "to_decimal"):
        value = value.to_decimal()
    return str(Decimal(value).quantize(Decimal("0.01")))


async def build_summary(
    db: AsyncIOMotorDatabase,
    *,
    period: str,
    date_from: str | None = None,
    date_to: str | None = None,
    business_unit_id: str | None = None,
    tz_offset_minutes: int = 0,
) -> dict[str, Any]:
    range_start, range_end = resolve_period(period, date_from, date_to, tz_offset_minutes)

    def scoped(match: dict[str, Any]) -> dict[str, Any]:
        base: dict[str, Any] = {**match}
        if business_unit_id:
            base["business_unit_id"] = business_unit_id
        return base

    sales_match = scoped({"sold_at": {"$gte": range_start, "$lt": range_end}})
    purchase_match = scoped({"purchased_at": {"$gte": range_start, "$lt": range_end}})
    expense_match = scoped({"spent_at": {"$gte": range_start, "$lt": range_end}})

    async def sum_field(collection: str, match: dict[str, Any], field: str) -> str:
        pipeline = [{"$match": match}, *_dec128_sum_pipeline(field)]
        result = await db[collection].aggregate(pipeline).to_list(1)
        return _decimal128_to_str(result[0]["total"]) if result else "0.00"

    total_sales, total_purchases, total_expenses = await asyncio.gather(
        sum_field("sales", sales_match, "total_amount"),
        sum_field("purchases", purchase_match, "total_amount"),
        sum_field("expenses", expense_match, "amount"),
    )

    sale_count = await db.sales.count_documents(sales_match)

    # Inventory value at cost over scope.
    item_scope = {"active": True}
    if business_unit_id:
        item_scope["business_unit_id"] = business_unit_id
    value_result = await db.inventory_items.aggregate(
        [
            {"$match": item_scope},
            {"$project": {"value": {"$multiply": [{"$toDecimal": "$purchase_price"}, "$current_stock"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$value"}}},
        ]
    ).to_list(1)
    inventory_value = _decimal128_to_str(value_result[0]["total"]) if value_result else "0.00"

    # Low stock within scope.
    low_query = {**item_scope, "current_stock": {"$lte": "$min_stock_level"}}
    low_cursor = db.inventory_items.aggregate(
        [
            {"$match": {**item_scope, "$expr": {"$lte": ["$current_stock", "$min_stock_level"]}}},
            {"$sort": {"current_stock": 1}},
            {"$limit": 10},
            {"$project": {
                "item_name": "$name",
                "current_stock": 1,
                "min_stock_level": 1,
                "base_unit": 1,
            }},
        ]
    )
    low_stock = [
        {
            "item_id": str(doc["_id"]),
            "item_name": doc["item_name"],
            "current_stock": doc["current_stock"],
            "min_stock_level": doc["min_stock_level"],
            "base_unit": doc["base_unit"],
        }
        async for doc in low_cursor
    ]

    # Per-business-unit split (ignores the BU filter — shows both sides).
    split: list[dict[str, Any]] = []
    units = await db.business_units.find({"active": True}).sort("name", 1).to_list(None)
    for unit_doc in units:
        bu_id = str(unit_doc["_id"])
        bu_sales = await sum_field(
            "sales",
            {"sold_at": {"$gte": range_start, "$lt": range_end}, "business_unit_id": bu_id},
            "total_amount",
        )
        bu_purchases = await sum_field(
            "purchases",
            {"purchased_at": {"$gte": range_start, "$lt": range_end}, "business_unit_id": bu_id},
            "total_amount",
        )
        bu_expenses = await sum_field(
            "expenses",
            {"spent_at": {"$gte": range_start, "$lt": range_end}, "business_unit_id": bu_id},
            "amount",
        )
        split.append(
            {
                "business_unit_id": bu_id,
                "name": unit_doc["name"],
                "sales": bu_sales,
                "purchases": bu_purchases,
                "expenses": bu_expenses,
            }
        )

    # Recent activity across the three transaction types.
    recent_sales = (
        await db.sales.find({}, {"sale_number": 1, "total_amount": 1, "sold_at": 1})
        .sort("sold_at", DESCENDING).limit(5).to_list(5)
    )
    recent_purchases = (
        await db.purchases.find({}, {"purchase_number": 1, "total_amount": 1, "purchased_at": 1})
        .sort("purchased_at", DESCENDING).limit(5).to_list(5)
    )
    recent_expenses = (
        await db.expenses.find({}, {"expense_number": 1, "amount": 1, "description": 1, "spent_at": 1})
        .sort("spent_at", DESCENDING).limit(5).to_list(5)
    )
    activity: list[dict[str, Any]] = []
    for doc in recent_sales:
        activity.append({"type": "sale", "number": doc["sale_number"], "label": "Sale", "amount": doc["total_amount"], "at": doc["sold_at"]})
    for doc in recent_purchases:
        activity.append({"type": "purchase", "number": doc["purchase_number"], "label": "Purchase", "amount": doc["total_amount"], "at": doc["purchased_at"]})
    for doc in recent_expenses:
        activity.append({"type": "expense", "number": doc["expense_number"], "label": doc.get("description") or "Expense", "amount": doc["amount"], "at": doc["spent_at"]})
    activity.sort(key=lambda entry: entry["at"], reverse=True)
    activity = activity[:8]

    # Top selling items in period.
    top_pipeline: list[dict[str, Any]] = [
        {"$match": sales_match},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.item_id",
            "item_name": {"$first": "$items.item_name"},
            "quantity_sold": {"$sum": "$items.quantity"},
            "revenue": {"$sum": {"$toDecimal": "$items.line_total"}},
        }},
        {"$sort": {"quantity_sold": DESCENDING}},
        {"$limit": 5},
    ]
    top_docs = await db.sales.aggregate(top_pipeline).to_list(5)
    top_selling = [
        {
            "item_id": doc["_id"],
            "item_name": doc["item_name"],
            "quantity_sold": doc["quantity_sold"],
            "revenue": _decimal128_to_str(doc["revenue"]),
        }
        for doc in top_docs
    ]

    # Daily sales trend for the selected period.
    trend_docs = await db.sales.aggregate(
        [
            {"$match": sales_match},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$sold_at"}},
                "total": {"$sum": {"$toDecimal": "$total_amount"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]
    ).to_list(None)
    trend = [
        {"date": doc["_id"], "total": _decimal128_to_str(doc["total"]), "count": doc["count"]}
        for doc in trend_docs
    ]

    return {
        "period": {
            "from": range_start.isoformat(),
            "to": range_end.isoformat(),
        },
        "totals": {
            "sales": total_sales,
            "purchases": total_purchases,
            "expenses": total_expenses,
            "sale_count": sale_count,
            "inventory_value": inventory_value,
        },
        "business_split": split,
        "low_stock": low_stock,
        "recent_activity": activity,
        "top_selling": top_selling,
        "sales_trend": trend,
    }


