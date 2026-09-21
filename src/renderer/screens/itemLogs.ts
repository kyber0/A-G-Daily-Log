import { Icons } from '../components/icons'
import { renderAuditLogView } from './auditLogView'

export function renderItemLogsScreen(container: HTMLElement): void {
  renderAuditLogView(container, {
    logType: 'item',
    title: 'Item Sales Audit Trail',
    subtitle: 'Chronological raw records for item merchandise transactions, edits, and voided sales',
    icon: Icons.package,
    fetchLogs: (prefix: string) => window.api.readItemLog(prefix),
    actionOptions: [
      { value: 'ITEM_SALE_ADD', label: 'Item Sales Added' },
      { value: 'ITEM_SALE_EDIT', label: 'Item Sales Modified' },
      { value: 'ITEM_SALE_DELETE', label: 'Item Sales Voided' },
      { value: 'STOCK_DISPATCH', label: 'Stock Dispatched' },
      { value: 'STOCK_OUT', label: 'Stock Out' },
      { value: 'STOCK_IN', label: 'Stock In / Restocked' },
      { value: 'ITEM_CATALOG_ADD', label: 'Catalog Product Added' },
      { value: 'ITEM_CATALOG_EDIT', label: 'Catalog Product Modified' },
      { value: 'ITEM_CATALOG_DELETE', label: 'Catalog Product Removed' },
      { value: 'STOCK_MOVEMENT_DELETE', label: 'Stock Movement Voided' }
    ],
    exportFileNamePrefix: 'item_sales'
  })
}
