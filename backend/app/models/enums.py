from enum import Enum


class ItemType(str, Enum):
    SHOP_PRODUCT = "shop_product"
    RAW_MATERIAL = "raw_material"
    PACKAGING = "packaging"
    OTHER = "other"


class Unit(str, Enum):
    PCS = "pcs"
    KG = "kg"
    G = "g"
    LITRE = "litre"
    # Short alias for litre (POS/BOM shorthand); normalized by units._normalize.
    L = "l"
    ML = "ml"
    BOX = "box"
    PACKET = "packet"


class MovementType(str, Enum):
    PURCHASE = "PURCHASE"
    SALE = "SALE"
    WASTAGE = "WASTAGE"
    ADJUSTMENT_IN = "ADJUSTMENT_IN"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT"


# Movement types that increase stock vs decrease it.
INBOUND_MOVEMENTS = {MovementType.PURCHASE, MovementType.ADJUSTMENT_IN}
OUTBOUND_MOVEMENTS = {
    MovementType.SALE,
    MovementType.WASTAGE,
    MovementType.ADJUSTMENT_OUT,
}


class StockStatus(str, Enum):
    HEALTHY = "healthy"
    LOW = "low"
    OUT = "out"
