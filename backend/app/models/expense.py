from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.models.purchase import PaymentMethod, PaymentStatus  # noqa: F401 (re-use)
from app.utils.money import MoneyAmount


class ExpenseCategory(str, Enum):
    UTILITIES = "utilities"
    TRANSPORT = "transport"
    MAINTENANCE = "maintenance"
    CLEANING = "cleaning"
    PACKAGING = "packaging"
    SUPPLIES = "supplies"
    STAFF_SALARY = "staff_salary"
    RENT = "rent"
    OTHER = "other"


BUILT_IN_EXPENSE_CATEGORIES = {c.value for c in ExpenseCategory}


def normalize_expense_category(raw: str) -> str:
    """Slug for custom categories: lowercase, spaces→underscores, [a-z0-9_]."""
    import re as _re

    slug = _re.sub(r"[^a-z0-9]+", "_", (raw or "").strip().lower()).strip("_")
    return slug


EXPENSE_CATEGORY_LABELS = {
    ExpenseCategory.UTILITIES: "Utilities",
    ExpenseCategory.TRANSPORT: "Transport",
    ExpenseCategory.MAINTENANCE: "Maintenance",
    ExpenseCategory.CLEANING: "Cleaning",
    ExpenseCategory.PACKAGING: "Packaging",
    ExpenseCategory.SUPPLIES: "Supplies",
    ExpenseCategory.STAFF_SALARY: "Staff Salary",
    ExpenseCategory.RENT: "Rent",
    ExpenseCategory.OTHER: "Other",
}


def expense_category_label(value: str) -> str:
    if value in EXPENSE_CATEGORY_LABELS:
        return EXPENSE_CATEGORY_LABELS[ExpenseCategory(value)]
    return value.replace("_", " ").title() if value else value


class ExpenseCreate(BaseModel):
    business_unit_id: str
    # Built-in enum value or a custom slug registered via /expenses/categories.
    # Validated in the service layer (DB-backed) so custom categories work.
    category: str = Field(min_length=1, max_length=60)
    amount: MoneyAmount
    payment_method: PaymentMethod = PaymentMethod.CASH
    payment_status: PaymentStatus = PaymentStatus.PAID
    description: str = Field(min_length=1, max_length=300)
    payee: str | None = Field(default=None, max_length=120)
    reference_number: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=500)
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    idempotency_key: str = Field(min_length=8, max_length=64)


class ExpenseOut(BaseModel):
    id: str
    expense_number: str
    business_unit_id: str
    category: str
    amount: str
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    description: str
    payee: str | None
    reference_number: str | None
    notes: str | None
    spent_at: datetime
    created_by_username: str | None


class ExpenseListResponse(BaseModel):
    records: list[ExpenseOut]
    total: int
    total_amount: str


def expense_out_from_doc(doc: dict) -> ExpenseOut:
    return ExpenseOut(
        id=str(doc["_id"]),
        expense_number=doc["expense_number"],
        business_unit_id=doc["business_unit_id"],
        category=str(doc["category"]),
        amount=doc["amount"],
        payment_method=PaymentMethod(doc["payment_method"]),
        payment_status=PaymentStatus(doc.get("payment_status", "paid")),
        description=doc["description"],
        payee=doc.get("payee"),
        reference_number=doc.get("reference_number"),
        notes=doc.get("notes"),
        spent_at=doc["spent_at"],
        created_by_username=doc.get("created_by_username"),
    )
