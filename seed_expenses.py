#!/usr/bin/env python3
"""Seed Invento MongoDB with expenses from Consolidated_Total_Expenses_Report.pdf."""

import re
import asyncio
from datetime import datetime, timedelta
from collections import Counter

async def main():
    # Read the extracted PDF text
    with open('/home/hrk/Projects/Invento/extracted_pdf.txt', 'r') as f:
        pdf_text = f.read()

    # Parse the expense items
    items = []
    lines = pdf_text.split('\n')

    current_item = None

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        item_start_match = re.match(r'^(\d+)\s+(.+)$', line_stripped)
        is_product_desc = '/' in line_stripped and not item_start_match

        if item_start_match:
            if current_item and 'description' in current_item:
                items.append(current_item)
            current_item = {
                'description': item_start_match.group(2).strip(),
            }
        elif current_item and is_product_desc:
            freq_match = re.search(r'(\d+)x', line_stripped)
            if freq_match and 'frequency' not in current_item:
                current_item['frequency'] = int(freq_match.group(1))
            elif '₹' in line_stripped and 'total_amount' not in current_item:
                # Extract amount - try different patterns
                amount_match = re.search(r'₹[\s]*([0-9,]+\.?[0-9]*)', line_stripped)
                if amount_match and amount_match.group(1):
                    try:
                        current_item['total_amount'] = float(amount_match.group(1).replace(',', ''))
                    except ValueError:
                        pass
            elif any(k in line_stripped.lower() for k in ['pcs', 'kg', 'g', 'ltr', 'box', 'ct']):
                current_item['quantities'] = line_stripped

    if current_item and 'description' in current_item:
        items.append(current_item)

    print(f"Parsed {len(items)} items from PDF")

    # Define category mapping
    def map_to_expense_category(product_desc: str) -> str:
        desc = product_desc.lower()
        if any(k in desc for k in ['gas', 'stove', 'heater', 'boiler', 'electric', 'power']):
            return "utilities"
        if any(k in desc for k in ['delivery', 'transport', 'shipping', 'freight']):
            return "transport"
        if any(k in desc for k in ['spring', 'machine', 'apparatus', 'gear', 'motor', 'bearing', 'valve', 'pipe', 'fitting']):
            return "maintenance"
        if any(k in desc for k in ['foil', 'wrap', 'cling', 'gloves', 'mask', 'detergent', 'soap', 'sanitizer']):
            return "cleaning"
        if any(k in desc for k in ['foil', 'wrap', 'paper', 'bag', 'pack', 'cover']):
            return "packaging"
        if any(k in desc for k in ['rent', 'lease', 'premises', 'space']):
            return "rent"
        return "supplies"

    def parse_amount_from_text(text: str) -> float:
        """Extract ₹ amount from text, return 0.0 if not found."""
        if not text:
            return 0.0
        # Pattern: ₹ followed by number with optional comma and decimals
        match = re.search(r'₹[\s]*([0-9,]+\.?[0-9]*)', text)
        if match and match.group(1):
            try:
                return float(match.group(1).replace(',', ''))
            except ValueError:
                return 0.0
        # Pattern: just a number that could be an amount
        match2 = re.search(r'([0-9]{2,}\.?[0-9]{0,2})', text)
        if match2:
            try:
                val = float(match2.group(1))
                if 1 < val < 100000:  # reasonable amount filter
                    return val
            except ValueError:
                return 0.0
        return 0.0

    # Build expense records
    expenses_to_insert = []
    for i, item in enumerate(items):
        if i >= 209:
            break
        
        desc = item.get('description', '')
        amount = item.get('total_amount', 0.0)
        frequency = item.get('frequency', 1)

        # If amount is 0 or wasn't extracted, try to parse from description
        if amount == 0.0:
            amount = parse_amount_from_text(desc)

        # Still 0? Estimate based on frequency
        if amount == 0.0:
            amount = frequency * 50

        category = map_to_expense_category(desc)

        expense = {
            'expense_number': f"PDF-{i+1:03d}",
            'business_unit_id': 'rest-shop-01',
            'category': category,
            'amount': str(amount),
            'payment_method': 'cash',
            'payment_status': 'paid',
            'description': desc,
            'payee': None,
            'reference_number': None,
            'notes': f"Seed from Consolidated_Total_Expenses_Report.pdf - item {i+1}",
            'spent_at': datetime.now() - timedelta(days=90),
            'idempotency_key': f"pdf-seed-{i+1:03d}",
            'created_by_username': 'system-seed',
        }
        expenses_to_insert.append(expense)

    print(f"\nPrepared {len(expenses_to_insert)} expense records for insertion")
    print(f"Category breakdown: {dict(Counter(e['category'] for e in expenses_to_insert))}")
    
    amount_values = [float(e['amount']) for e in expenses_to_insert if float(e['amount']) > 0]
    if amount_values:
        print(f"Amount range: ₹{min(amount_values):.2f} - ₹{max(amount_values):.2f} (over {len(amount_values)} items with amounts)")
    
    cat_counts = Counter(e['category'] for e in expenses_to_insert)
    for cat, count in sorted(cat_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {cat}: {count}")

    # Show first 5 samples
    print("\nFirst 5 samples:")
    for e in expenses_to_insert[:5]:
        print(f"  {e['expense_number']}: {e['description'][:50]}... | ₹{e['amount']} | {e['category']}")

    # Connect to MongoDB and insert
    mongo_uri = 'mongodb://localhost:27017'
    mongo_db = 'invento'

    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(mongo_uri)
    db = client[mongo_db]

    # Check current count
    existing_count = await db.expenses.count_documents({})
    print(f"\nExisting expenses in DB: {existing_count}")

    # Insert expenses
    inserted = 0
    errors = 0

    for exp in expenses_to_insert:
        try:
            existing = await db.expenses.find_one({'idempotency_key': exp['idempotency_key']})
            if existing:
                continue
            result = await db.expenses.insert_one(exp)
            inserted += 1
            if inserted <= 5:
                print(f"  Inserted {exp['expense_number']}: ₹{exp['amount']} - {exp['description'][:45]}")
        except Exception as e:
            errors += 1
            print(f"  Error inserting {exp['expense_number']}: {e}")

    print(f"\n=== Seed Summary ===")
    print(f"Total items parsed: {len(items)}")
    print(f"Records prepared: {len(expenses_to_insert)}")
    print(f"Successfully inserted: {inserted}")
    print(f"Errors/skipped: {errors}")
    print(f"Existing before: {existing_count}")
    print(f"Total after: {existing_count + inserted}")

    # Print final category breakdown
    all_docs = await db.expenses.find({}).to_list(length=None)
    if all_docs:
        final_cats = Counter(d.get('category', 'unknown') for d in all_docs)
        print(f"Final category breakdown: {dict(final_cats)}")
        print(f"Total docs in DB now: {len(all_docs)}")

    client.close()
    print("\nDone!")

asyncio.run(main())