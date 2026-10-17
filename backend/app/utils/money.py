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


def format_inr(amount: Decimal | int | float | str) -> str:
    """Format an amount in Indian numbering with paise, e.g. 1,23,456.00.

    Always two decimals; negatives keep the minus sign; never scientific
    notation. This is the single formatter for report exports (PDF text and
    on-screen samples) — do not hand-roll grouping elsewhere.
    """
    try:
        dec = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        return "0.00"
    dec = dec.quantize(Decimal("0.01"))
    sign = "-" if dec < 0 else ""
    whole, _, frac = format(abs(dec), "f").partition(".")
    if len(whole) > 3:
        head, last3 = whole[:-3], whole[-3:]
        parts: list[str] = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        parts.insert(0, head)
        whole = ",".join(parts) + "," + last3
    return f"{sign}{whole}.{frac}"
