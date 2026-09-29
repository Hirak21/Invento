export interface StockAlert {
  item_id: string
  item_name: string
  current_stock: number
  min_stock_level: number
  base_unit: string
  suggested_reorder_qty: number
  status: 'low' | 'out'
}
