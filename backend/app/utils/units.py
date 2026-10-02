"""Unit conversion layer for recipe ingredients (Bug 1).

Stock items keep a canonical base unit (e.g. ``kg``, ``litre``, ``pcs``).
Recipe ingredients may be entered in a *compatible sub-unit* (``g`` for ``kg``,
``ml`` for ``litre``). Pieces (and box/packet) have no sub-units.

Precision / rounding rule (documented, drift-free):
  - All arithmetic uses :class:`~decimal.Decimal` — never floats.
  - Entered quantities are parsed via ``Decimal(str(value))`` and quantized to
    ``0.001`` (gram / millilitre precision) with ``ROUND_HALF_UP``.
  - The canonical quantity stored alongside is therefore exact to 3 decimals;
    recipe cost (canonical × purchase price per base unit) is computed with the
    same quantized Decimals, so repeated conversions never accumulate binary
    float error (the classic 0.1 + 0.2 problem cannot occur).
  - Mongo ``$inc`` writes use BSON Decimal128 (exact decimal) rather than
    doubles; legacy integer stocks keep working because ``Decimal(str(v))``
    parses ints, floats and Decimal128 uniformly.

Backwards compatibility:
  - Ingredient docs written before this layer have ``quantity`` (a number, in
    the item's base unit) and no ``entered_*`` fields. Readers treat those as
    ``entered_quantity == quantity`` in the base unit, so existing recipes keep
    working with no data change.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Final

QTY_QUANTUM: Final[Decimal] = Decimal("0.001")

# family -> {unit: factor-to-base}. Base unit has factor 1.
_FAMILIES: Final[dict[str, dict[str, Decimal]]] = {
    "mass": {"kg": Decimal("1"), "g": Decimal("0.001")},
    "volume": {"litre": Decimal("1"), "l": Decimal("1"), "ml": Decimal("0.001")},
    # Count-type units have no sub-units: only self-compatible.
    "count_pcs": {"pcs": Decimal("1")},
    "count_box": {"box": Decimal("1")},
    "count_packet": {"packet": Decimal("1")},
}

#: Short aliases accepted on input and normalized to the canonical spelling
#: (the POS/BOM dropdowns and API accept ``l`` for ``litre``).
_ALIASES: Final[dict[str, str]] = {"l": "litre"}


def _normalize(unit: str) -> str:
    cleaned = unit.strip() if isinstance(unit, str) else unit
    return _ALIASES.get(cleaned, cleaned)

_UNIT_TO_FAMILY: Final[dict[str, str]] = {
    unit: family for family, units in _FAMILIES.items() for unit in units
}

#: Units the API accepts in an ingredient's ``unit`` field.
KNOWN_UNITS: Final[tuple[str, ...]] = tuple(sorted(_UNIT_TO_FAMILY))


class IncompatibleUnitError(ValueError):
    """Raised when an entered unit cannot convert to the item's base unit."""


def quantize_qty(value: Decimal | int | float | str) -> Decimal:
    """Parse *value* and quantize to gram/ml precision (0.001, HALF_UP)."""
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid quantity: {value!r}.") from exc
    if not dec.is_finite() or dec <= 0:
        raise ValueError(f"Quantity must be a positive number, got {value!r}.")
    return dec.quantize(QTY_QUANTUM, rounding=ROUND_HALF_UP)


def family_of(unit: str) -> str | None:
    return _UNIT_TO_FAMILY.get(_normalize(unit))


def compatible_units(base_unit: str) -> list[str]:
    """Units convertible to *base_unit* (includes the base unit itself)."""
    family = _UNIT_TO_FAMILY.get(_normalize(base_unit))
    if family is None:
        return [base_unit]
    return sorted(_FAMILIES[family])


def to_base_quantity(entered_qty: Decimal | int | float | str, entered_unit: str, base_unit: str) -> Decimal:
    """Convert an entered quantity to the item's base unit (quantized).

    Raises:
        IncompatibleUnitError: e.g. ``g`` for a ``litre``-based item.
        ValueError: non-positive / unparsable quantity.
    """
    entered = _normalize(entered_unit) if isinstance(entered_unit, str) else entered_unit
    base = _normalize(base_unit) if isinstance(base_unit, str) else base_unit
    fam_entered = _UNIT_TO_FAMILY.get(entered)
    fam_base = _UNIT_TO_FAMILY.get(base)
    if fam_entered is None:
        raise IncompatibleUnitError(
            f"Unknown unit '{entered}'. Compatible units for this item: {', '.join(compatible_units(base))}."
        )
    if fam_entered != fam_base:
        raise IncompatibleUnitError(
            f"Unit '{entered}' is incompatible with this item's base unit '{base}'. "
            f"Use one of: {', '.join(compatible_units(base))}."
        )
    factor = _FAMILIES[fam_base][entered]
    base_factor = _FAMILIES[fam_base][base]
    qty = quantize_qty(entered_qty)
    # Convert relative to the ITEM's base unit (which may itself be the
    # sub-unit, e.g. a gram-based item: 150 g stays 150 g; 2 kg -> 2000 g).
    canonical = (qty * factor / base_factor).quantize(QTY_QUANTUM, rounding=ROUND_HALF_UP)
    if canonical <= 0:
        raise ValueError(f"Quantity {entered_qty!r} {entered} converts to zero {base}; enter a larger amount.")
    return canonical


def to_decimal_number(value: object) -> Decimal:
    """Parse a stored numeric (int legacy, float, Decimal128, str) to Decimal."""
    if isinstance(value, Decimal):
        return value
    try:
        # bson Decimal128 stringifies to its plain decimal form.
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid stored quantity: {value!r}.") from exc


def decimal_to_mongo(value: Decimal):
    """Return a Mongo-storable exact decimal.

    Whole numbers stay plain ``int`` so legacy integer stocks are untouched;
    fractional values become :class:`bson.decimal128.Decimal128` (exact, no
    float drift — plain ``Decimal`` is not BSON-encodable).
    """
    from bson.decimal128 import Decimal128

    q = value.quantize(QTY_QUANTUM, rounding=ROUND_HALF_UP)
    if q == q.to_integral_value():
        return int(q)
    return Decimal128(q)
