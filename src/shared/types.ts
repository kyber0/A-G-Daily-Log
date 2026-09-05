// ─── Container / Water / Price types ─────────────────────────────────────────

export interface ContainerType {
  name: string
  requiresWaterType: boolean
}

export type WaterType = string

export interface PriceRow {
  container: string
  water: string   // empty string for bottle-only types
  pickup: number
  deliver: number
  note: string
}

export interface AppConfig {
  saveFolder: string
  backupFolder: string  // '' = auto-backup disabled
  backupTime: string    // '19:00' = 7:00 PM default (HH:mm)
  theme: 'light' | 'dark'
  containerTypes: ContainerType[]
  waterTypes: WaterType[]
  priceTable: PriceRow[]
  inventoryFolder: string // Path to the folder containing Sales/Stock reports
  supabaseUrl?: string
  supabaseAnonKey?: string
  appAccountEmail?: string
  appAccountPassword?: string
}

// ─── Sale entry ───────────────────────────────────────────────────────────────

export type SaleMode = 'PICKUP' | 'DELIVER'

export interface SaleRow {
  sn: number          // always 1-indexed sequential, rewritten on save
  container: string
  water: string       // empty string for bottle types
  qty: number
  mode: SaleMode
  price: number
}

// ─── IPC result wrapper ───────────────────────────────────────────────────────

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// ─── Logs ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string
  action: string
  details: string
}

// ─── Draft ───────────────────────────────────────────────────────────────────

export interface DraftPayload {
  date: string        // ISO date string YYYY-MM-DD
  rows: SaleRow[]
  savedAt: string     // ISO datetime
}

// ─── Day load/save payloads ───────────────────────────────────────────────────

export interface DayTarget {
  filePath: string    // resolved absolute path to monthly .xlsx
  sheetName: string   // e.g. "AUG29"
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryDay {
  date: string        // YYYY-MM-DD
  sheetName: string   // e.g. "AUG29"
  rowCount: number
  totalAmount: number
  totalExpenses: number
  netProfit: number
  expenses: { desc: string, amount: number, remarks: string }[]
  filePath: string
  isRed: boolean      // true = Sunday or holiday (red tab in Excel)
}

// ─── Backup ──────────────────────────────────────────────────────────────────

export interface BackupResult {
  backupPath: string
  filesCopied: number
  timestamp: string
}

// ─── Google Drive ─────────────────────────────────────────────────────────────

export interface DriveStatus {
  connected: boolean
  email: string | null
}

export interface DriveUploadResult {
  success: boolean
  message: string
}

// ─── Inventory & Sales ───────────────────────────────────────────────────────

export interface InventoryItem {
  id?: string
  description: string
  category: string
  itemCode: string
  price: number
}

export interface ItemSale {
  id?: string
  itemId?: string
  item: string
  category: string
  itemCode: string
  price: number
  qty: number
  salesAmount: number
  discount: number
  salesTotal: number
  remarks: string
  date: string
  rowNum?: number  // Excel row number — used for edit/delete
  buyerId?: string
}

export interface ExpenseEntry {
  desc: string
  amount: number
  remarks: string
}

// ─── Stock / Inventory DB ────────────────────────────────────────────────────

export interface StockCategory {
  id: string
  name: string
  sortOrder?: number
}

export interface StockBuyer {
  id: string
  name: string
  isOwnShop: boolean
}

export interface StockItem {
  id: string                 // e.g. "ITM-001" or uuid
  itemLabel: string          // e.g. "ITM-001 · 5 GAL SLIM CONTAINER W/ CAP BLUE"
  code?: string              // optional supplier code
  name: string               // clean item name
  categoryId: string
  packing?: string
  dealerPrice: number
  srp: number
  batchNote?: 'SOLD' | 'NEW BATCH' | null
  batchDate?: string
  lowStockThreshold?: number
  isArchived?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface StockMovement {
  id: string
  itemId: string
  itemLabel?: string
  direction: 'in' | 'out'
  quantity: number
  buyerId?: string
  buyerName?: string
  date: string               // YYYY-MM-DD
  source: 'sales_entry' | 'wholesale_dispatch' | 'restock' | 'historical_import'
  sourceId?: string
  reference?: string
  note?: string
}

export interface RestockOrder {
  id: string
  soNumber?: string
  orderDate: string
  receivedDate?: string
  amount: number
  truckingFee?: number
  orderTotal?: number
  note?: string
}

export interface StockDB {
  sourceXlsxPath?: string
  isLegacySingleSheet?: boolean
  categories: StockCategory[]
  buyers: StockBuyer[]
  items: StockItem[]
  movements: StockMovement[]
  restockOrders: RestockOrder[]
}

/** Derived computed row returned to the renderer for display */
export interface StockItemRow extends StockItem {
  categoryName: string
  qtyOrdered: number
  qtyStockOut: number
  qtyBalance: number
  totalCost: number
  salesAmount: number
  profitPerUnit: number
  status: 'in_stock' | 'low' | 'out'
}

// ─── Legacy (kept for backward compatibility if needed) ──────────────────────

export interface LegacyStockItem {
  code: string
  item: string
  packing: string
  dealerPrice: number
  qtyOrdered: number
  totalAmount: number
  qtyStockOut: number
  qtyBalance: number
  srp: number
  status: string
}

export interface AddProductPayload {
  code: string
  item: string
  category: string
  packing: string
  dealerPrice: number
  srp: number
}

