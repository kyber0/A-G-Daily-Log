import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, SaleRow, IpcResult, DraftPayload, DayTarget, HistoryDay, BackupResult, LogEntry, DriveStatus, ExpenseEntry } from '../shared/types'

const listenerMap = new Map<(...args: any[]) => void, (_event: any, ...args: any[]) => void>()

// Expose a locked-down API surface to the renderer — no raw Node access.
contextBridge.exposeInMainWorld('api', {
  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getSettings: (): Promise<IpcResult<AppConfig>> =>
    ipcRenderer.invoke('getSettings'),

  updateSettings: (partial: Partial<AppConfig>): Promise<IpcResult<AppConfig>> =>
    ipcRenderer.invoke('updateSettings', partial),

  syncSettingsToDatabase: (): Promise<IpcResult<{ containersSynced: number; waterTypesSynced: number; pricesSynced: number }>> =>
    ipcRenderer.invoke('syncSettingsToDatabase'),

  chooseFolder: (): Promise<IpcResult<string>> =>
    ipcRenderer.invoke('chooseFolder'),

  testSupabaseAuth: (creds: { url: string; anonKey: string; email: string; password: string }): Promise<IpcResult<void>> =>
    ipcRenderer.invoke('testSupabaseAuth', creds),

  openSaveFolder: (): Promise<void> =>
    ipcRenderer.invoke('openSaveFolder'),

  // â”€â”€ Day operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  loadDay: (date: string): Promise<IpcResult<SaleRow[]>> =>
    ipcRenderer.invoke('loadDay', date),

  saveDay: (date: string, rows: SaleRow[], expenses: ExpenseEntry[] = []): Promise<IpcResult<DayTarget>> =>
    ipcRenderer.invoke('saveDay', date, rows, expenses),

  markDayClosed: (date: string, reason: string): Promise<IpcResult<DayTarget>> =>
    ipcRenderer.invoke('day:markClosed', date, reason),

  unmarkDayClosed: (date: string): Promise<IpcResult<DayTarget>> =>
    ipcRenderer.invoke('day:unmarkClosed', date),

  getDayStatus: (date: string): Promise<IpcResult<{ isClosed: boolean; reason: string }>> =>
    ipcRenderer.invoke('day:getStatus', date),

  // ── Expenses ──────────────────────────────────────────────────────────────────
  loadDayExpenses: (date: string): Promise<IpcResult<ExpenseEntry[]>> =>
    ipcRenderer.invoke('day:loadExpenses', date),

  saveDayExpenses: (date: string, expenses: ExpenseEntry[]): Promise<IpcResult<void>> =>
    ipcRenderer.invoke('day:saveExpenses', date, expenses),

  // ————————————————————————————————————————————————————————————————————————————————
  getDraft: (date: string): Promise<IpcResult<DraftPayload | null>> =>
    ipcRenderer.invoke('getDraft', date),

  saveDraft: (date: string, rows: SaleRow[]): Promise<void> =>
    ipcRenderer.invoke('saveDraft', date, rows),

  clearDraft: (date: string): Promise<void> =>
    ipcRenderer.invoke('clearDraft', date),

  // â”€â”€ History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  listHistory: (): Promise<IpcResult<HistoryDay[]>> =>
    ipcRenderer.invoke('history:listDays'),

  loadHistoryDay: (date: string): Promise<IpcResult<SaleRow[]>> =>
    ipcRenderer.invoke('history:loadDay', date),

  // â”€â”€ Backup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  chooseBackupFolder: (): Promise<IpcResult<string>> =>
    ipcRenderer.invoke('backup:chooseFolder'),

  clearBackupFolder: (): Promise<IpcResult<void>> =>
    ipcRenderer.invoke('backup:clearFolder'),

  createBackup: (): Promise<IpcResult<BackupResult>> =>
    ipcRenderer.invoke('backup:create'),

  openBackupFolder: (): Promise<void> =>
    ipcRenderer.invoke('backup:openFolder'),

  // â”€â”€ Google Drive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  driveStatus: (): Promise<IpcResult<DriveStatus>> =>
    ipcRenderer.invoke('drive:status'),

  driveAuth: (): Promise<IpcResult<DriveStatus>> =>
    ipcRenderer.invoke('drive:auth'),

  driveDisconnect: (): Promise<IpcResult<void>> =>
    ipcRenderer.invoke('drive:disconnect'),

  getBackupFolder: (): Promise<IpcResult<string>> =>
    ipcRenderer.invoke('backup:getFolder'),

  // â”€â”€ Logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  appendLog: (action: string, details: string): Promise<void> =>
    ipcRenderer.invoke('log:append', action, details),

  readLogs: (month: string) => ipcRenderer.invoke('log:read', month),

  appendItemLog: (action: string, details: string): Promise<void> =>
    ipcRenderer.invoke('itemLog:append', action, details),

  readItemLog: (month: string) => ipcRenderer.invoke('itemLog:read', month),

  // Inventory & Sales
  listInventory: () => ipcRenderer.invoke('inventory:list'),
  saveInventory: (items: any[]) => ipcRenderer.invoke('inventory:save', items),
  
  saveItemSale: (sale: any) => ipcRenderer.invoke('itemSales:save', sale),
  loadItemSalesMonth: (month: string) => ipcRenderer.invoke('itemSales:loadMonth', month),
  deleteItemSale: (month: string, rowNum: number | string) => ipcRenderer.invoke('itemSales:delete', month, rowNum),
  updateItemSale: (month: string, rowNum: number | string, sale: any) => ipcRenderer.invoke('itemSales:update', month, rowNum, sale),
  
  listStock: () => ipcRenderer.invoke('stock:list'),
  addStockOrder: (item: string, qty: number, soNum: string) => ipcRenderer.invoke('stock:addOrder', item, qty, soNum),

  // ── Stock DB (new) ─────────────────────────────────────────────────────────
  stockDbGet: () => ipcRenderer.invoke('stockDb:get'),

  stockDbAddItem:    (item: any) => ipcRenderer.invoke('stockDb:addItem', item),
  stockDbUpdateItem: (id: string, patch: any) => ipcRenderer.invoke('stockDb:updateItem', id, patch),
  stockDbArchiveItem:(id: string) => ipcRenderer.invoke('stockDb:archiveItem', id),
  stockDbDeleteItem: (id: string) => ipcRenderer.invoke('stockDb:deleteItem', id),

  stockDbAddMovement:    (mov: any) => ipcRenderer.invoke('stockDb:addMovement', mov),
  stockDbUpdateMovement: (id: string, patch: any) => ipcRenderer.invoke('stockDb:updateMovement', id, patch),
  stockDbDeleteMovement: (id: string) => ipcRenderer.invoke('stockDb:deleteMovement', id),

  stockDbAddBuyer:    (buyer: any) => ipcRenderer.invoke('stockDb:addBuyer', buyer),
  stockDbUpdateBuyer: (id: string, patch: any) => ipcRenderer.invoke('stockDb:updateBuyer', id, patch),
  stockDbDeleteBuyer: (id: string) => ipcRenderer.invoke('stockDb:deleteBuyer', id),

  stockDbAddRestockOrder:    (order: any) => ipcRenderer.invoke('stockDb:addRestockOrder', order),
  stockDbUpdateRestockOrder: (id: string, patch: any) => ipcRenderer.invoke('stockDb:updateRestockOrder', id, patch),
  stockDbDeleteRestockOrder: (id: string) => ipcRenderer.invoke('stockDb:deleteRestockOrder', id),

  stockDbAddCategory:    (name: string) => ipcRenderer.invoke('stockDb:addCategory', name),
  stockDbDeleteCategory: (id: string)   => ipcRenderer.invoke('stockDb:deleteCategory', id),

  stockDbPickExcelFile: () => ipcRenderer.invoke('stockDb:pickExcelFile'),
  stockDbImportExcel: (filePath?: string) => ipcRenderer.invoke('stockDb:importExcel', filePath),
  stockDbMigrateLegacy: (backupOriginal?: boolean) => ipcRenderer.invoke('stockDb:migrateLegacy', backupOriginal),
  stockDbOpenFile: () => ipcRenderer.invoke('stockDb:openFile'),

  addProduct: (payload: any) => ipcRenderer.invoke('inventory:addProduct', payload),

  // ── Excel & Data Export ───────────────────────────────────────────────────
  exportStockReport: (): Promise<IpcResult<string | undefined>> => ipcRenderer.invoke('export:stockReport'),
  exportSalesReport: (monthStr: string): Promise<IpcResult<string | undefined>> => ipcRenderer.invoke('export:salesReport', monthStr),
  exportDailyLog: (monthStr: string): Promise<IpcResult<string | undefined>> => ipcRenderer.invoke('export:dailyLog', monthStr),
  exportWaterLog: (monthStr: string): Promise<IpcResult<string | undefined>> => ipcRenderer.invoke('export:waterLog', monthStr),
  exportItemLog: (monthStr: string): Promise<IpcResult<string | undefined>> => ipcRenderer.invoke('export:itemLog', monthStr),
  exportFolder: (srcPath: string): Promise<IpcResult<{ destPath: string; filesCopied: number }>> => ipcRenderer.invoke('export:folder', srcPath),
  exportOpenFile: (filePath: string): Promise<IpcResult<void>> => ipcRenderer.invoke('export:openFile', filePath),
  exportBulkYear: (year: number): Promise<IpcResult<{ folder: string; filesWritten: number }>> => ipcRenderer.invoke('export:bulkYear', year),

  // ── Executive Analytics ────────────────────────────────────────────────────
  getExecutiveAnalytics: (year: number, month: number) => ipcRenderer.invoke('analytics:getExecutive', year, month),

  // ── Connectivity & Sync ───────────────────────────────────────────────────
  connectivityStatus: (): Promise<{ isOnline: boolean; pendingCount: number; deadCount: number }> =>
    ipcRenderer.invoke('connectivity:status'),
  syncNow: (): Promise<{ synced: number; failed: number; dead: number }> =>
    ipcRenderer.invoke('sync:now'),

  // ── Application Updates ──────────────────────────────────────────────────
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:getVersion'),
  getUpdateState: (): Promise<IpcResult<any>> =>
    ipcRenderer.invoke('update:getState'),
  checkForUpdates: (): Promise<IpcResult<{ updateAvailable: boolean; version?: string; message?: string }>> =>
    ipcRenderer.invoke('update:check'),
  installUpdate: (): Promise<IpcResult<void>> =>
    ipcRenderer.invoke('update:install'),

  on: (channel: string, callback: (...args: any[]) => void): (() => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
    listenerMap.set(callback, wrapper)
    ipcRenderer.on(channel, wrapper)
    return () => {
      ipcRenderer.removeListener(channel, wrapper)
      listenerMap.delete(callback)
    }
  },
  removeListener: (channel: string, callback: (...args: any[]) => void): void => {
    const wrapper = listenerMap.get(callback)
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper)
      listenerMap.delete(callback)
    } else {
      ipcRenderer.removeListener(channel, callback as any)
    }
  }
})


