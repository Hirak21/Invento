from bson import ObjectId
from fastapi import APIRouter, Query

from app.models.expense import (
    ExpenseCreate,
    ExpenseListResponse,
    ExpenseOut,
    expense_out_from_doc,
)
from app.routers.deps import CurrentUser, DBDep
from app.services.expense_service import build_expense_query, create_expense
from app.utils.audit import log_audit
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.post("", response_model=ExpenseOut, status_code=201)
async def record_expense(payload: ExpenseCreate, db: DBDep, user: CurrentUser) -> ExpenseOut:
    doc, duplicate = await create_expense(
        db,
        payload,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    if not duplicate:
        await log_audit(
            db,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            action="create",
            entity_type="expense",
            entity_id=str(doc["_id"]),
            after={"expense_number": doc["expense_number"], "amount": doc["amount"], "category": doc["category"]},
            business_unit_id=doc["business_unit_id"],
        )
    return expense_out_from_doc(doc)


@router.get("", response_model=ExpenseListResponse)
async def list_expenses(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str | None = None,
    category: str | None = None,
    payment_method: str | None = None,
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ExpenseListResponse:
    query = build_expense_query(
        business_unit_id=business_unit_id,
        category=category,
        payment_method=payment_method,
        date_from=date_from,
        date_to=date_to,
    )
    total = await db.expenses.count_documents(query)
    cursor = db.expenses.find(query).sort("spent_at", -1).skip(skip).limit(limit)

    from decimal import Decimal

    records: list[ExpenseOut] = []
    total_amount = Decimal("0.00")
    async for doc in cursor:
        records.append(expense_out_from_doc(doc))
        total_amount += Decimal(doc["amount"])

    return ExpenseListResponse(
        records=records, total=total, total_amount=str(total_amount.quantize(Decimal("0.01")))
    )


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense_detail(expense_id: str, db: DBDep, user: CurrentUser) -> ExpenseOut:
    if not ObjectId.is_valid(expense_id):
        raise NotFoundError("Expense not found.")
    doc = await db.expenses.find_one({"_id": ObjectId(expense_id)})
    if doc is None:
        raise NotFoundError("Expense not found.")
    return expense_out_from_doc(doc)
