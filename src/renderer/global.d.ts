declare module '*.png' {
  const value: string
  export default value
}

declare global {
  interface Window {
    api: {
      getSettings: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').AppConfig>>
      updateSettings: (partial: Partial<import('../../shared/types').AppConfig>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').AppConfig>>
      syncSettingsToDatabase: () => Promise<import('../../shared/types').IpcResult<{ containersSynced: number; waterTypesSynced: number; pricesSynced: number }>>
      chooseFolder: () => Promise<import('../../shared/types').IpcResult<string>>
      testSupabaseAuth: (creds: { url: string; anonKey: string; email: string; password: string }) => Promise<import('../../shared/types').IpcResult<void>>
      openSaveFolder: () => Promise<void>
      loadDay: (date: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').SaleRow[]>>
      saveDay: (date: string, rows: import('../../shared/types').SaleRow[], expenses?: import('../../shared/types').ExpenseEntry[]) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').DayTarget>>
      markDayClosed: (date: string, reason: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').DayTarget>>
      unmarkDayClosed: (date: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').DayTarget>>
      getDayStatus: (date: string) => Promise<import('../../shared/types').IpcResult<{ isClosed: boolean; reason: string }>>
      getDraft: (date: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').DraftPayload | null>>
      saveDraft: (date: string, rows: import('../../shared/types').SaleRow[]) => Promise<void>
      clearDraft: (date: string) => Promise<void>
      listHistory: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').HistoryDay[]>>
      loadHistoryDay: (date: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').SaleRow[]>>
      loadDayExpenses: (date: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').ExpenseEntry[]>>
      saveDayExpenses: (date: string, expenses: import('../../shared/types').ExpenseEntry[]) => Promise<import('../../shared/types').IpcResult<void>>
      chooseBackupFolder: () => Promise<import('../../shared/types').IpcResult<string>>
      clearBackupFolder: () => Promise<import('../../shared/types').IpcResult<void>>
      createBackup: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').BackupResult>>
      openBackupFolder: () => Promise<void>
      getBackupFolder: () => Promise<import('../../shared/types').IpcResult<string>>
      getLogs: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').LogEntry[]>>
      clearLogs: () => Promise<import('../../shared/types').IpcResult<void>>
      appendItemLog: (action: string, details: string) => Promise<void>
      readItemLog: (month: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').LogEntry[]>>
      
      driveStatus: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').DriveStatus>>
      driveAuth: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').DriveStatus>>
      driveDisconnect: () => Promise<import('../../shared/types').IpcResult<void>>

      // Inventory & Sales
      listInventory: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').InventoryItem[]>>
      saveInventory: (items: import('../../shared/types').InventoryItem[]) => Promise<import('../../shared/types').IpcResult<void>>
      saveItemSale: (sale: import('../../shared/types').ItemSale) => Promise<import('../../shared/types').IpcResult<void>>
      loadItemSalesMonth: (month: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').ItemSale[]>>
      deleteItemSale: (month: string, rowNum: number | string) => Promise<import('../../shared/types').IpcResult<void>>
      updateItemSale: (month: string, rowNum: number | string, sale: import('../../shared/types').ItemSale) => Promise<import('../../shared/types').IpcResult<void>>
      listStock: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').LegacyStockItem[]>>
      addStockOrder: (item: string, qty: number, soNum: string) => Promise<import('../../shared/types').IpcResult<void>>
      addProduct: (payload: import('../../shared/types').AddProductPayload) => Promise<import('../../shared/types').IpcResult<void>>
      // Stock DB
      stockDbGet: () => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockDB & { itemRows: import('../../shared/types').StockItemRow[] }>>
      stockDbAddItem: (item: Omit<import('../../shared/types').StockItem, 'id'|'createdAt'|'isArchived'>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockItem>>
      stockDbUpdateItem: (id: string, patch: Partial<import('../../shared/types').StockItem>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockItem>>
      stockDbArchiveItem: (id: string) => Promise<import('../../shared/types').IpcResult<void>>
      stockDbDeleteItem: (id: string) => Promise<import('../../shared/types').IpcResult<void>>
      stockDbAddMovement: (mov: Omit<import('../../shared/types').StockMovement, 'id'>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockMovement>>
      stockDbUpdateMovement: (id: string, patch: Partial<import('../../shared/types').StockMovement>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockMovement>>
      stockDbDeleteMovement: (id: string) => Promise<import('../../shared/types').IpcResult<void>>
      stockDbAddBuyer: (buyer: Omit<import('../../shared/types').StockBuyer, 'id'>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockBuyer>>
      stockDbUpdateBuyer: (id: string, patch: Partial<import('../../shared/types').StockBuyer>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockBuyer>>
      stockDbDeleteBuyer: (id: string) => Promise<import('../../shared/types').IpcResult<void>>
      stockDbAddRestockOrder: (order: Omit<import('../../shared/types').RestockOrder, 'id'>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').RestockOrder>>
      stockDbUpdateRestockOrder: (id: string, patch: Partial<import('../../shared/types').RestockOrder>) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').RestockOrder>>
      stockDbDeleteRestockOrder: (id: string) => Promise<import('../../shared/types').IpcResult<void>>
      stockDbAddCategory: (name: string) => Promise<import('../../shared/types').IpcResult<import('../../shared/types').StockCategory>>
      stockDbDeleteCategory: (id: string) => Promise<import('../../shared/types').IpcResult<void>>
      stockDbPickExcelFile: () => Promise<import('../../shared/types').IpcResult<string | undefined>>
      stockDbImportExcel: (filePath?: string) => Promise<import('../../shared/types').IpcResult<{ itemsImported: number }>>
      stockDbMigrateLegacy: (backupOriginal?: boolean) => Promise<import('../../shared/types').IpcResult<{ success: boolean; message: string }>>
      stockDbOpenFile: () => Promise<import('../../shared/types').IpcResult<void>>

      // Excel Export
      exportStockReport: () => Promise<import('../../shared/types').IpcResult<string | undefined>>
      exportSalesReport: (monthStr: string) => Promise<import('../../shared/types').IpcResult<string | undefined>>
      exportDailyLog: (monthStr: string) => Promise<import('../../shared/types').IpcResult<string | undefined>>
      exportWaterLog: (monthStr: string) => Promise<import('../../shared/types').IpcResult<string | undefined>>
      exportItemLog: (monthStr: string) => Promise<import('../../shared/types').IpcResult<string | undefined>>
      exportFolder: (srcPath: string) => Promise<import('../../shared/types').IpcResult<{ destPath: string; filesCopied: number }>>
      exportOpenFile: (filePath: string) => Promise<import('../../shared/types').IpcResult<void>>
      exportBulkYear: (year: number) => Promise<import('../../shared/types').IpcResult<{ folder: string; filesWritten: number }>>


      // Executive Analytics
      getExecutiveAnalytics: (year: number, month: number) => Promise<import('../../shared/types').IpcResult<any>>

      // Connectivity & Sync
      connectivityStatus: () => Promise<{ isOnline: boolean; pendingCount: number }>
      syncNow: () => Promise<{ synced: number; failed: number }>

      // Application Updates
      getAppVersion: () => Promise<string>
      getUpdateState: () => Promise<import('../../shared/types').IpcResult<any>>
      checkForUpdates: () => Promise<import('../../shared/types').IpcResult<{ updateAvailable: boolean; version?: string; message?: string }>>
      installUpdate: () => Promise<import('../../shared/types').IpcResult<void>>

      on: (channel: string, callback: (...args: any[]) => void) => () => void
      removeListener: (channel: string, callback: (...args: any[]) => void) => void
    }
  }
}




