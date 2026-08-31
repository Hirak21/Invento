#!/usr/bin/env python3
"""
Seed Invento MongoDB with expenses from Consolidated_Total_Expenses_Report.pdf.
Maps PDF product categories to Invento's ExpenseCategory enum and inserts 
209 expense records into the expenses collection.
"""

import re
import sys
from datetime import datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, Json

# Invento's ExpenseCategory enum
class ExpenseCategory(str, Enum):
    UTILITIES = "utilities"
    TRANSPORT = "transport"
    MAINTENANCE = "maintenance"
    CLEANING = "cleaning"
    PACKAGING = "packaging"
    SUPPLIES = "supplies"
    RENT = "rent"
    OTHER = "other"

EXPENSE_CATEGORY_LABELS = {
    ExpenseCategory.UTILITIES: "Utilities",
    ExpenseCategory.TRANSPORT: "Transport",
    ExpenseCategory.MAINTENANCE: "Maintenance",
    ExpenseCategory.CLEANING: "Cleaning",
    ExpenseCategory.PACKAGING: "Packaging",
    ExpenseCategory.SUPPLIES: "Supplies",
    ExpenseCategory.RENT: "Rent",
    ExpenseCategory.OTHER: "Other",
}


def map_to_expense_category(product_desc: str) -> ExpenseCategory:
    """
    Map a product description from the PDF to an Invento ExpenseCategory.
    Based on restaurant/shop business context.
    """
    desc = product_desc.lower()
    
    # Utilities - fuel, electricity, water connections
    if any(k in desc for k in ['gas', 'stove', 'heater', 'boiler', 'electric', 'power']):
        return ExpenseCategory.UTILITIES
    
    # Transport / delivery
    if any(k in desc for k in ['delivery', 'transport', 'shipping', 'freight']):
        return ExpenseCategory.TRANSPORT
    
    # Maintenance - equipment, parts, repair
    if any(k in desc for k in ['spring', 'machine', 'apparatus', 'gear', 'motor', 'bearing', 'valve', 'pipe', 'fitting']):
        return ExpenseCategory.MAINTENANCE
    
    # Cleaning - wrapping, foil, cling wrap, gloves, etc.
    if any(k in desc for k in ['foil', 'wrap', 'cling', 'gloves', 'mask', 'detergent', 'soap', 'sanitizer']):
        return ExpenseCategory.CLEANING
    
    # Packaging - foil, wrap, boxes, bags
    if any(k in desc for k in ['foil', 'wrap', 'paper', 'bag', 'pack', 'cover']):
        return ExpenseCategory.PACKAGING
    
    # Rent - rent, lease, space
    if any(k in desc for k in ['rent', 'lease', 'premises', 'space']):
        return ExpenseCategory.RENT
    
    # Default to SUPPLIES (most restaurant/shop purchases are raw materials/food)
    return ExpenseCategory.SUPPLIES


def parse_amount(text: str) -> float:
    """Extract ₹ amount from text like '₹5,049.00' or '₹5049.00'."""
    match = re.search(r'₹[\s]*([0-9,]+\.?[0-9]*)', text)
    if match:
        return float(match.group(1).replace(',', ''))
    # Try without ₹ symbol
    match = re.search(r'([0-9,]+\.?[0-9]*)', text)
    if match:
        return float(match.group(1).replace(',', ''))
    return 0.0


def parse_quantity(text: str) -> str:
    """Extract quantity info from PDF text."""
    # Return raw text or extract meaningful part
    return text.strip()[:200] if text else "1 pc"


def main():
    pdf_path = "/home/hrk/Downloads/Consolidated_Total_Expenses_Report.pdf"
    
    # Read PDF text (already extracted by pdftotext)
    # We'll use the extracted content from earlier
    import subprocess
    result = subprocess.run(
        ['pdftotext', pdf_path, '-'],
        capture_output=True, text=True
    )
    full_text = result.stdout
    
    # Parse expenses from the PDF text
    # The PDF has a structured format - extract each line item
    expenses = []
    
    # Split by the numbered items (# 1-209)
    item_sections = re.split(r'\n#\\n', full_text)
    
    # We need to parse each item. Let me use a different approach -
    # extract from the formatted table
    lines = full_text.split('\n')
    
    # Parse the product entries - they appear as "# Product Description" lines
    # followed by frequency, quantities, cost
    current_item = {}
    items_parsed = 0
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Look for item number at start (e.g., "1", "2", etc. or "Amul Moti / Toned Milk...")
        item_num_match = re.match(r'^(\d+)$', line)
        product_match = re.match(r'^(\d+)\s+(.+)$', line)
        
        if item_num_match and not current_item:
            # Starting a new item, but we need to handle the format differently
            # The PDF format is: "# 1\n\nAmul Moti / Toned Milk (450ml)\n\nFrequency (Times Ordered)\n16x\n..."
            pass
        
        # Look for product description lines (they contain "/")
        if '/' in line and not item_num_match:
            # This could be a product description line
            # Reset item if we were tracking one
            if current_item and 'description' in current_item:
                expenses.append(current_item)
                current_item = {}
                items_parsed += 1
            
            # Try to parse as product description
            # Format: "1 Amul Moti / Toned Milk (450ml)" or just the description
            desc_match = re.match(r'^\d*\s*(.+)$', line)
            if desc_match:
                desc = desc_match.group(1).strip()
                # Check if this looks like a product description with category info
                current_item = {
                    'description': desc,
                    'raw_line': line,
                }
        elif 'Frequency' in line or 'Times Ordered' in line:
            # Frequency line - extract the number
            freq_match = re.search(r'(\d+)x', line)
            if freq_match and current_item:
                current_item['frequency'] = int(freq_match.group(1))
        elif 'Total Cost' in line or '₹' in line:
            # Cost line
            amount = parse_amount(line)
            if amount > 0 and current_item:
                current_item['total_amount'] = amount
                # Map to category
                current_item['category'] = map_to_expense_category(current_item.get('description', ''))
                # Set default payment info
                current_item['payment_method'] = 'cash'
                current_item['payment_status'] = 'paid'
                current_item['idempotency_key'] = f"pdf-seed-{items_parsed:03d}"
                current_item['business_unit_id'] = 'rest-shop-01'
                current_item['spent_at'] = datetime.now() - timedelta(days=np.random.randint(0, 180))
                current_item['expense_number'] = f"PDF-{items_parsed+1:03d}"
        
        if items_parsed >= 209:
            break
    
    # Don't forget the last item
    if current_item and 'description' in current_item:
        expenses.append(current_item)
    
    # Connect to MongoDB and insert
    # Read Mongo URI from Invento config
    config_result = subprocess.run(
        ['cat', '/home/hrk/Projects/Invento/backend/.env'],
        capture_output=True, text=True
    )
    env_output = config_result.stdout
    
    mongo_uri = 'mongodb://localhost:27017'
    mongo_db = 'invento'
    
    # Try to find env vars
    mongo_match = re.search(r'MONGO_URI[=\s]+(.+)', env_output)
    if mongo_match:
        mongo_uri = mongo_match.group(1)
    db_match = re.search(r'MONGO_DB[=\s]+(.+)', env_output)
    if db_match:
        mongo_db = db_match.group(1)
    
    client = AsyncIOMotorClient(mongo_uri)
    db = client[mongo_db]
    
    # Insert expenses
    inserted = 0
    errors = 0
    
    for exp in expenses:
        try:
            # Ensure required fields
            if 'description' not in exp:
                continue
            if 'total_amount' not in exp:
                exp['total_amount'] = 0.0
            if 'category' not in exp:
                exp['category'] = ExpenseCategory.SUPPLIES
            if 'idempotency_key' not in exp:
                exp['idempotency_key'] = f"pdf-seed-{inserted:03d}"
            if 'business_unit_id' not in exp:
                exp['business_unit_id'] = 'rest-shop-01'
            if 'spent_at' not in exp:
                exp['spent_at'] = datetime.now()
            if 'expense_number' not in exp:
                exp['expense_number'] = f"PDF-{inserted+1:03d}"
            if 'payment_method' not in exp:
                exp['payment_method'] = 'cash'
            if 'payment_status' not in exp:
                exp['payment_status'] = 'paid'
            
            # Insert into expenses collection
            result = await db.expenses.insert_one(exp)
            inserted += 1
        except Exception as e:
            print(f"Error inserting expense {inserted}: {e}")
            errors += 1
    
    print(f"\n=== Seed Summary ===")
    print(f"Total items parsed from PDF: {len(expenses)}")
    print(f"Successfully inserted: {inserted}")
    print(f"Errors: {errors}")
    print(f"MongoDB: {mongo_uri}/{mongo_db}")
    print(f"Expenses collection count: await db.expenses.count_documents({})")
    
    # Print category breakdown
    from collections import Counter
    cats = Counter(e.get('category', 'unknown') for e in expenses if 'description' in e)
    print(f"\nCategory breakdown: {dict(cats)}")
    
    client.close()
    return 0 if errors == 0 else 1


if __name__ == '__main__':
    import asyncio
    import numpy as np
    exit(asyncio.run(main()))