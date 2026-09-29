"""Seed demo data for UI screenshots (run against the shot backend on :8801)."""
import json
import urllib.request

BASE = "http://127.0.0.1:8801/api"


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from None


def main() -> None:
    tok = call("POST", "/auth/bootstrap-owner", {"username": "owner", "password": "ownerpass123"})["access_token"]
    bu = call("POST", "/business-units", {"name": "Restaurant"}, tok)["id"]
    shop = call("POST", "/business-units", {"name": "Front Shop"}, tok)["id"]
    cat = call("POST", "/categories", {"name": "Raw"}, tok)["id"]
    item = call("POST", "/inventory/items", {
        "name": "Rice Flour", "sku": "S-RF", "category_id": cat, "business_unit_id": bu,
        "item_type": "raw_material", "base_unit": "g", "purchase_price": "40.00",
        "selling_price": None, "min_stock_level": 100, "opening_stock": 5000,
    }, tok)
    coke = call("POST", "/inventory/items", {
        "name": "Coke", "sku": "S-CK", "category_id": cat, "business_unit_id": shop,
        "item_type": "shop_product", "base_unit": "pcs", "purchase_price": "20.00",
        "selling_price": "45.00", "min_stock_level": 5, "opening_stock": 50,
    }, tok)
    recipe = call("POST", "/recipes", {"name": "Dosa", "business_unit_id": bu}, tok)
    rid = recipe["recipe"]["id"]
    call("POST", f"/recipes/{rid}/ingredients", {"item_id": item["id"], "quantity": 200}, tok)

    r1 = call("POST", "/rooms", {"business_unit_id": bu, "room_number": "101"}, tok)
    r2 = call("POST", "/rooms", {"business_unit_id": bu, "room_number": "102"}, tok)
    call("POST", "/rooms", {"business_unit_id": bu, "room_number": "103"}, tok)
    s1 = call("POST", "/rooms/stays/check-in", {"room_id": r1["id"], "guest_name": "Rai"}, tok)
    s2 = call("POST", "/rooms/stays/check-in", {"room_id": r2["id"], "guest_name": "Khan"}, tok)

    call("POST", "/sales", {
        "business_unit_id": bu,
        "items": [{"item_id": rid, "quantity": 2, "unit_price": "120.00"}],
        "payment_method": "room_charge", "stay_id": s1["id"], "idempotency_key": "shot-order-1",
    }, tok)
    call("POST", "/sales", {
        "business_unit_id": bu,
        "items": [{"item_id": rid, "quantity": 1, "unit_price": "120.00"}],
        "payment_method": "room_charge", "stay_id": s2["id"], "idempotency_key": "shot-order-2",
    }, tok)
    call("POST", "/sales", {
        "business_unit_id": shop,
        "items": [{"item_id": coke["id"], "quantity": 2, "unit_price": "45.00"}],
        "payment_method": "cash", "idempotency_key": "shot-shop-1",
    }, tok)

    with open("/tmp/shot_token", "w") as f:
        f.write(tok)
    print("seeded ok")


if __name__ == "__main__":
    main()
