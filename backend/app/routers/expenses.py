from bson import ObjectId
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.models.expense import (
    ExpenseCreate,
    ExpenseListResponse,
    ExpenseOut,
    expense_out_from_doc,
)
from app.routers.deps import CurrentUser, DBDep
from app.routers.deps import OwnerUser as OwnerDep
from app.models.purchase import PaymentStatus
from app.services.expense_service import (
    build_expense_query,
    create_expense,
    create_expense_category,
    delete_expense_category,
    list_expense_categories,
    set_expense_payment_status,
    update_expense_category,
)
from app.utils.audit import log_audit
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/expenses", tags=["expenses"])


class ExpenseCategoryOut(BaseModel):
    slug: str
    name: str
    built_in: bool = False
    active: bool = True


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class ExpenseCategoryUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@router.get("/categories", response_model=list[ExpenseCategoryOut])
async def get_expense_categories(db: DBDep, user: CurrentUser) -> list[ExpenseCategoryOut]:
    """Selectable expense categories: built-ins (incl. Staff Salary) + custom."""
    cats = await list_expense_categories(db)
    return [ExpenseCategoryOut(**c) for c in cats]


@router.post("/categories", response_model=ExpenseCategoryOut, status_code=201)
async def add_expense_category(
    payload: ExpenseCategoryCreate, db: DBDep, user: OwnerDep
) -> ExpenseCategoryOut:
    cat = await create_expense_category(db, payload.name)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="create",
        entity_type="expense_category",
        entity_id=cat["slug"],
        after={"name": cat["name"]},
    )
    return ExpenseCategoryOut(**cat)


@router.patch("/categories/{slug}", response_model=ExpenseCategoryOut)
async def rename_expense_category(
    slug: str, payload: ExpenseCategoryUpdate, db: DBDep, user: OwnerDep
) -> ExpenseCategoryOut:
    cat = await update_expense_category(db, slug, payload.name)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="update",
        entity_type="expense_category",
        entity_id=slug,
        after={"name": cat["name"]},
    )
    return ExpenseCategoryOut(**cat)


@router.delete("/categories/{slug}", status_code=204)
async def remove_expense_category(slug: str, db: DBDep, user: OwnerDep) -> None:
    """Delete a custom category; in-use ones are deactivated, history preserved."""
    await delete_expense_category(db, slug)
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="delete",
        entity_type="expense_category",
        entity_id=slug,
    )
    return None


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
    payment_status: str | None = Query(default=None, pattern=r"^(paid|pending)$"),
    date_from: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str | None = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> ExpenseListResponse:
    query = build_expense_query(
        business_unit_id=business_unit_id,
        category=category,
        payment_method=payment_method,
        payment_status=payment_status,
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


class ExpensePaymentStatusUpdate(BaseModel):
    payment_status: PaymentStatus


@router.patch("/{expense_id}/payment-status", response_model=ExpenseOut)
async def update_expense_payment_status(
    expense_id: str, payload: ExpensePaymentStatusUpdate, db: DBDep, user: CurrentUser
) -> ExpenseOut:
    """Settle a pending expense (Clear Due) or reopen it. Persists to DB."""
    doc = await set_expense_payment_status(
        db,
        expense_id,
        payload.payment_status.value,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
    )
    return expense_out_from_doc(doc)


@router.get("/{expense_id}", response_model=ExpenseOut)
async def get_expense_detail(expense_id: str, db: DBDep, user: CurrentUser) -> ExpenseOut:
    if not ObjectId.is_valid(expense_id):
        raise NotFoundError("Expense not found.")
    doc = await db.expenses.find_one({"_id": ObjectId(expense_id)})
    if doc is None:
        raise NotFoundError("Expense not found.")
    return expense_out_from_doc(doc)
