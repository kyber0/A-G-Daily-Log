import type {
  AppConfig, SaleRow, IpcResult, DraftPayload, DayTarget, HistoryDay,
  BackupResult, LogEntry, DriveStatus, ExpenseEntry, InventoryItem,
  ItemSale, LegacyStockItem, StockDB, StockItem, StockMovement,
  RestockOrder, StockBuyer, StockCategory, StockItemRow, AddProductPayload
} from '../shared/types'

export interface ElectronApi {
  // Settings
  getSettings: () => Promise<IpcResult<AppConfig>>
  updateSettings: (partial: Partial<AppConfig>) => Promise<IpcResult<AppConfig>>
  chooseFolder: (title?: string) => Promise<IpcResult<string>>
  testSupabaseAuth: (creds: { url: string; anonKey: string; email: string; password: string }) => Promise<IpcResult<void>>
  openSaveFolder: () => Promise<void>

  // Day operations
  loadDay: (date: string) => Promise<IpcResult<SaleRow[]>>
  saveDay: (date: string, rows: SaleRow[], expenses?: ExpenseEntry[]) => Promise<IpcResult<DayTarget>>
  markDayClosed: (date: string, reason: string) => Promise<IpcResult<DayTarget>>
  unmarkDayClosed: (date: string) => Promise<IpcResult<DayTarget>>
  getDayStatus: (date: string) => Promise<IpcResult<{ isClosed: boolean; reason: string }>>

  // Expenses
  loadDayExpenses: (date: string) => Promise<IpcResult<ExpenseEntry[]>>
  saveDayExpenses: (date: string, expenses: ExpenseEntry[]) => Promise<IpcResult<void>>

  // Drafts
  getDraft: (date: string) => Promise<IpcResult<DraftPayload | null>>
  saveDraft: (date: string, rows: SaleRow[]) => Promise<void>
  clearDraft: (date: string) => Promise<void>

  // History
  listHistory: () => Promise<IpcResult<HistoryDay[]>>
  loadHistoryDay: (date: string) => Promise<IpcResult<SaleRow[]>>

  // Backup
  chooseBackupFolder: () => Promise<IpcResult<string>>
  clearBackupFolder: () => Promise<IpcResult<void>>
  createBackup: () => Promise<IpcResult<BackupResult>>
  openBackupFolder: () => Promise<void>
  getBackupFolder: () => Promise<IpcResult<string>>

  // Google Drive
  driveStatus: () => Promise<IpcResult<DriveStatus>>
  driveAuth: () => Promise<IpcResult<DriveStatus>>
  driveDisconnect: () => Promise<IpcResult<void>>

  // Logs
  appendLog: (action: string, details: string) => Promise<void>
  readLogs: (month: string) => Promise<IpcResult<LogEntry[]>>
  appendItemLog: (action: string, details: string) => Promise<void>
  readItemLog: (month: string) => Promise<IpcResult<LogEntry[]>>

  // Inventory & Sales
  listInventory: () => Promise<IpcResult<InventoryItem[]>>
  saveInventory: (items: InventoryItem[]) => Promise<IpcResult<void>>
  saveItemSale: (sale: ItemSale) => Promise<IpcResult<void>>
  loadItemSalesMonth: (month: string) => Promise<IpcResult<ItemSale[]>>
  deleteItemSale: (month: string, rowNum: number | string) => Promise<IpcResult<void>>
  updateItemSale: (month: string, rowNum: number | string, sale: ItemSale) => Promise<IpcResult<void>>
  listStock: () => Promise<IpcResult<LegacyStockItem[]>>
  addStockOrder: (item: string, qty: number, soNum: string) => Promise<IpcResult<void>>

  // Stock DB
  stockDbGet: () => Promise<IpcResult<StockDB & { itemRows: StockItemRow[] }>>
  stockDbAddItem: (item: any) => Promise<IpcResult<StockItem>>
  stockDbUpdateItem: (id: string, patch: any) => Promise<IpcResult<StockItem>>
  stockDbArchiveItem: (id: string) => Promise<IpcResult<void>>
  stockDbDeleteItem: (id: string) => Promise<IpcResult<void>>
  stockDbAddMovement: (mov: any) => Promise<IpcResult<StockMovement>>
  stockDbUpdateMovement: (id: string, patch: any) => Promise<IpcResult<StockMovement>>
  stockDbDeleteMovement: (id: string) => Promise<IpcResult<void>>
  stockDbAddBuyer: (buyer: any) => Promise<IpcResult<StockBuyer>>
  stockDbUpdateBuyer: (id: string, patch: any) => Promise<IpcResult<StockBuyer>>
  stockDbDeleteBuyer: (id: string) => Promise<IpcResult<void>>
  stockDbAddRestockOrder: (order: any) => Promise<IpcResult<RestockOrder>>
  stockDbUpdateRestockOrder: (id: string, patch: any) => Promise<IpcResult<RestockOrder>>
  stockDbDeleteRestockOrder: (id: string) => Promise<IpcResult<void>>
  stockDbAddCategory: (name: string) => Promise<IpcResult<StockCategory>>
  stockDbDeleteCategory: (id: string) => Promise<IpcResult<void>>
  stockDbPickExcelFile: () => Promise<IpcResult<string | undefined>>
  stockDbImportExcel: (filePath?: string) => Promise<IpcResult<{ itemsImported: number }>>
  stockDbMigrateLegacy: (backupOriginal?: boolean) => Promise<IpcResult<{ success: boolean; message: string }>>
  stockDbOpenFile: () => Promise<IpcResult<void>>
  addProduct: (payload: AddProductPayload) => Promise<IpcResult<void>>

  // Excel & Data Export
  exportStockReport: () => Promise<IpcResult<string | undefined>>
  exportSalesReport: (monthStr: string) => Promise<IpcResult<string | undefined>>
  exportDailyLog: (monthStr: string) => Promise<IpcResult<string | undefined>>
  exportWaterLog: (monthStr: string) => Promise<IpcResult<string | undefined>>
  exportItemLog: (monthStr: string) => Promise<IpcResult<string | undefined>>
  exportFolder: (srcPath: string) => Promise<IpcResult<{ destPath: string; filesCopied: number }>>
  exportOpenFile: (filePath: string) => Promise<IpcResult<void>>
  exportBulkYear: (year: number) => Promise<IpcResult<{ folder: string; filesWritten: number }>>

  // Executive Analytics
  getExecutiveAnalytics: (year: number, month: number) => Promise<IpcResult<any>>

  // Connectivity & Sync
  connectivityStatus: () => Promise<{ isOnline: boolean; pendingCount: number }>
  syncNow: () => Promise<{ synced: number; failed: number }>
  on: (channel: string, callback: (...args: any[]) => void) => () => void
  removeListener: (channel: string, callback: (...args: any[]) => void) => void
}


declare global {
  interface Window {
    api: ElectronApi
  }
}
