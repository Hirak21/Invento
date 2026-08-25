# Invento Lite — Product Requirements Document

## 1. Product Purpose

Invento Lite is a practical business control system for a client operating a restaurant and a shop.

The core business question is:

> “I want to know what I bought, what I sold, what I have left, where the money went, and how the business is performing.”

The MVP is not intended to be a full ERP or a replacement for large POS platforms. It should be simple enough for the owner/team to use every day and structured enough to provide reliable operational records and reports.

## 2. Primary Outcomes

The system must allow the owner to:

1. Record purchases and incoming stock.
2. Record sales.
3. Automatically reduce inventory when a sale occurs.
4. Track current stock and stock movements.
5. Record wastage and manual adjustments.
6. Record business expenses.
7. Separate restaurant and shop activity.
8. View daily/monthly/custom-period performance.
9. Export useful reports to Excel.
10. Understand where money and stock are going.

## 3. Scope

### MVP In Scope

- Authentication
- Business/location setup
- Dashboard
- Product/ingredient master
- Categories
- Units of measurement
- Suppliers
- Purchases
- Sales
- Automatic stock deduction
- Inventory movement ledger
- Wastage
- Stock adjustments
- Expenses
- Basic payment methods
- Restaurant/shop separation
- Date-range reports
- Excel export
- Audit trail for important mutations

### Explicitly Out of Scope for MVP

- Full accounting
- Payroll
- GST filing/compliance automation
- Advanced POS hardware integration
- Barcode hardware integration
- Online ordering
- Customer loyalty
- Multi-tenant SaaS billing
- Complex role/permission matrix
- Advanced forecasting
- AI recommendations
- Recipe-level ingredient deduction unless required during validation

Recipe support should be designed as a future extension, not allowed to complicate the first operational release.

## 4. Business Structure

The system should support one client business containing multiple operational units:

- Restaurant
- Shop

Use a shared inventory/transaction architecture while allowing records to be associated with a business unit.

Example:

Restaurant → food/raw-material inventory and restaurant sales.

Shop → packaged/product inventory and shop sales.

## 5. Core Inventory Formula

The system must maintain a traceable stock ledger.

Conceptually:

Opening Stock
+ Purchases
+ Positive Adjustments
+ Transfers In
- Sales Consumption
- Wastage
- Negative Adjustments
- Transfers Out
= Current Stock

For MVP, transfers may remain disabled in UI unless there is a demonstrated requirement.

Never rely only on a mutable stock number without a movement history.

## 6. Inventory Items

Each item should support:

- Name
- SKU/internal code
- Category
- Business unit
- Item type: Shop Product / Raw Material / Packaging / Other
- Base unit
- Purchase price
- Selling price where applicable
- Minimum stock level
- Supplier
- Active/inactive status
- Opening stock
- Current stock
- Notes

Units must be explicit, e.g. pcs, kg, g, litre, ml, box, packet.

The system must prevent nonsensical unit operations.

## 7. Purchases

A purchase records stock coming into the business.

Fields:

- Purchase number
- Date/time
- Business unit
- Supplier
- Items
- Quantity
- Unit
- Unit cost
- Line total
- Total amount
- Payment status
- Payment method
- Notes
- Reference/invoice number

Completing a purchase must create positive inventory movements.

## 8. Sales

A sale records outgoing products.

Fields:

- Sale number
- Date/time
- Business unit
- Items
- Quantity
- Selling price
- Discount if required
- Total
- Payment method
- Notes

Completing a sale must create corresponding negative inventory movements.

The sale and stock deduction must be atomic from the application's perspective.

The same sale must not be processed twice.

## 9. Wastage

Wastage records stock consumed without a sale.

Fields:

- Date/time
- Business unit
- Item
- Quantity
- Reason
- Notes
- Recorded by

Reasons may include:

- Spoiled
- Expired
- Damaged
- Cooking/handling loss
- Other

Wastage creates a negative inventory movement.

## 10. Stock Adjustment

Authorized staff may record physical-count corrections.

Fields:

- Item
- Previous quantity
- New quantity or delta
- Reason
- Notes
- Recorded by
- Date/time

Never silently overwrite stock. Every adjustment must be represented in the movement ledger.

## 11. Expenses

Expenses answer “where did the money go?”

Fields:

- Expense number
- Date
- Business unit
- Category
- Amount
- Payment method
- Description
- Supplier/payee
- Reference/receipt attachment if supported
- Recorded by

MVP expense categories can include:

- Utilities
- Transport
- Maintenance
- Cleaning
- Packaging
- Supplies
- Rent
- Other

Do not present a calculated net profit as authoritative accounting unless the calculation clearly states its limitations.

## 12. Dashboard

The owner dashboard should prioritize decisions, not decoration.

Show:

- Today's total sales
- Restaurant sales
- Shop sales
- Purchases
- Expenses
- Low-stock item count
- Current inventory value where reliable
- Recent sales
- Recent purchases
- Recent expenses
- Top-selling items
- Stock alerts

Provide date filtering for daily, weekly, monthly and custom periods.

## 13. Reports

Required MVP reports:

### Sales

- Date
- Business unit
- Product/item
- Quantity
- Revenue
- Payment method
- Totals

### Purchases

- Date
- Supplier
- Item
- Quantity
- Cost
- Total
- Payment method

### Inventory

- Current stock
- Minimum level
- Stock value
- Low-stock status

### Stock Movement

- Date
- Item
- Movement type
- Quantity in/out
- Reference
- Balance if implemented

### Wastage

- Date
- Item
- Quantity
- Reason
- Estimated value where reliable

### Expenses

- Date
- Category
- Amount
- Payment method
- Description

### Business Summary

- Sales
- Purchases
- Expenses
- Inventory movement summary
- Gross-margin estimate only if cost data is sufficiently reliable

Every report must support date filtering and Excel export.

## 14. Excel Export

Exports should be clean and useful rather than raw database dumps.

Recommended files/sheets:

- Sales Report
- Purchase Report
- Inventory Report
- Stock Movement Report
- Wastage Report
- Expense Report
- Summary

Use consistent dates, currency formatting, totals and column names.

## 15. Data Integrity

Critical rules:

- Completed transactions should be immutable or reversed through a controlled reversal process.
- Inventory changes must always have a movement record.
- Duplicate sale submission must not duplicate stock deduction.
- Duplicate purchase submission must not duplicate stock addition.
- Quantities must not accept invalid negative values.
- Money should avoid binary floating-point calculations for authoritative totals.
- Important changes should have created_at, updated_at and recorded_by where applicable.
- Deletion of operational transactions should be avoided; use inactive/void/reversal states.
- Audit important financial and inventory mutations.

## 16. MVP User Flow

Owner/team opens application.

Dashboard
→ choose Restaurant or Shop
→ record Purchase / Sale / Expense
→ inventory updates automatically
→ review stock and alerts
→ review reports
→ export Excel.

The application should require as few steps as possible for common daily entries.

## 17. Success Criteria

The MVP is successful when a real user can answer these questions without spreadsheets:

- What did we buy today/month?
- What did we sell today/month?
- What stock do we currently have?
- Which items are low?
- What was wasted?
- What expenses were recorded?
- How much did each business unit sell?
- Where did money go?
- What happened to a specific inventory item?
- Can I export this period for further review?

## 18. Product Philosophy

Simple first.

Reliable records over flashy dashboards.

Traceability over hidden calculations.

Useful reports over dozens of screens.

Build the smallest system that the client can actually use every day.
