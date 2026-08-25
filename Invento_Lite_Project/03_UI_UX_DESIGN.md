# Invento Lite — UI/UX Design

## 1. Design Goal

The interface should feel like a calm owner control panel, not an accounting textbook and not an oversized enterprise ERP.

The owner should understand the current state within seconds.

Primary UX principle:

> Record quickly. Understand immediately. Investigate when needed.

## 2. Navigation

Desktop sidebar:

- Dashboard
- Sales
- Purchases
- Inventory
- Wastage
- Expenses
- Reports
- Settings

Top area:

- Current business unit selector
- Date/period context
- Notifications/low-stock indicator
- User menu

Mobile:

- Bottom navigation or compact drawer for the most important actions.
- Primary quick actions should remain easy to reach.

## 3. Dashboard

Header:

**Good morning / Good afternoon**

Then period selector:

Today | 7 Days | This Month | Custom

Primary cards:

- Total Sales
- Purchases
- Expenses
- Low Stock

Business split:

Restaurant | Shop | All

Charts should be restrained.

Useful sections:

### Sales Overview

Daily/weekly trend.

### Business Unit Performance

Restaurant vs Shop.

### Low Stock

Item
Current
Minimum
Status

### Recent Activity

Latest sale, purchase, expense and stock movement.

### Top Selling

Top products/items for selected period.

Avoid dashboard overload.

## 4. Quick Actions

Prominent buttons:

+ New Sale
+ Purchase
+ Expense
+ Wastage
+ Stock Adjustment

The most frequent action should be accessible in one or two clicks.

## 5. Sales Screen

The sales screen should be optimized for speed.

Layout:

Left/main:
- Search item
- Category filters
- Item selection
- Quantity
- Price

Right/summary:
- Selected items
- Subtotal
- Discount if enabled
- Total
- Payment method
- Complete Sale

For mobile, stack the summary below the item selection.

On completion show a clear success state and reference number.

## 6. Purchase Screen

Use a structured line-item form.

Fields:

- Supplier
- Date
- Business unit
- Item
- Quantity
- Unit cost
- Payment method
- Reference number
- Notes

Show live total.

## 7. Inventory Screen

Table columns:

- Item
- Category
- Unit
- Current stock
- Minimum
- Purchase price
- Stock value
- Status

Status:

- Healthy
- Low
- Out

Allow search and filters.

Clicking an item opens:

- Item details
- Current stock
- Recent movements
- Purchase history
- Sales consumption
- Wastage
- Adjustments

## 8. Wastage Screen

Simple form:

Item
Quantity
Reason
Notes
Date

Show recent wastage below.

## 9. Expense Screen

Simple entry form.

Category
Amount
Payment method
Description
Payee
Date
Attachment if enabled

Show recent expenses and period total.

## 10. Reports

Reports page should begin with:

Report type
Period
Business unit
Filters
Generate
Export Excel

Avoid creating one giant report table.

Use tabs/cards for:

- Sales
- Purchases
- Inventory
- Movements
- Wastage
- Expenses
- Summary

## 11. Visual Direction

Recommended:

- clean light/neutral workspace
- dark text
- restrained accent color
- subtle borders
- moderate radius
- minimal shadows
- strong spacing hierarchy
- readable typography

Do not copy Aagomon's visual language blindly.

Invento should feel like a practical operations product.

## 12. Status Colors

Use semantic color only:

- green = healthy/success
- amber = warning/low stock
- red = critical/out/error
- neutral = inactive/info

Do not make the entire interface colorful.

## 13. Forms

Forms must:

- use visible labels
- validate inline
- preserve entered values after recoverable errors
- show loading state
- disable duplicate submission
- confirm destructive actions
- show clear success/error feedback

## 14. Empty States

Useful examples:

“No sales recorded for this period.”

“No low-stock items.”

“No purchases found.”

Do not leave blank tables with no explanation.

## 15. Mobile

The system must remain usable on phone screens.

Prioritize:

1. Dashboard
2. New Sale
3. Inventory lookup
4. Purchase
5. Expense
6. Reports

Tables should become cards or horizontally scroll only when unavoidable.

## 16. Accessibility

- readable font sizes
- keyboard navigation
- visible focus
- accessible labels
- semantic buttons
- sufficient contrast
- no information conveyed by color alone

## 17. UX Guardrails

Do not add:

- unnecessary onboarding animations
- complicated dashboards
- 3D effects
- excessive charts
- decorative data visualizations
- hidden critical actions
- multi-step flows for simple entries

The software exists to reduce operational friction.
