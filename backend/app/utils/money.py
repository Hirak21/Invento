from decimal import Decimal, InvalidOperation
import re
from typing import Annotated

from pydantic import AfterValidator

MONEY_PATTERN = re.compile(r"^\d{1,12}(\.\d{1,2})?$")


def _validate_money(v: str) -> str:
    """Validate and normalize a money amount string (API + DB boundary).

    Money crosses the API as strings and is stored as strings in Mongo.
    All arithmetic happens server-side with Decimal — never floats.
    """
    if not isinstance(v, str):
        raise ValueError("Money amounts must be passed as strings, e.g. \"125.50\".")
    if not MONEY_PATTERN.match(v):
        raise ValueError("Must be a non-negative amount with up to 2 decimal places, e.g. \"125.50\".")
    try:
        return str(Decimal(v).quantize(Decimal("0.01")))
    except InvalidOperation:
        raise ValueError("Invalid amount.") from None


MoneyAmount = Annotated[str, AfterValidator(_validate_money)]


def parse_money(raw: str) -> Decimal:
    """Parse a stored money string into a quantized Decimal."""
    if not MONEY_PATTERN.match(raw):
        raise ValueError(f"Invalid money value: {raw!r}")
    return Decimal(raw).quantize(Decimal("0.01"))


def money_to_str(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


def add_money(*amounts: str) -> str:
    total = sum((parse_money(a) for a in amounts), start=Decimal("0.00"))
    return money_to_str(total)
