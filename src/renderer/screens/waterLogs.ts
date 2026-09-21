import { Icons } from '../components/icons'
import { renderAuditLogView } from './auditLogView'

export function renderWaterLogsScreen(container: HTMLElement): void {
  renderAuditLogView(container, {
    logType: 'water',
    title: 'Water Audit Trail',
    subtitle: 'Chronological raw records for water refill sales, day closes, edits, and deletions',
    icon: Icons.droplets,
    fetchLogs: (prefix: string) => window.api.readLogs(prefix),
    actionOptions: [
      { value: 'ADD_SALE', label: 'Sales Added' },
      { value: 'EDIT_SALE', label: 'Sales Modified' },
      { value: 'DELETE_SALE', label: 'Sales Deleted' },
      { value: 'MARK_CLOSED', label: 'Day Closed' },
      { value: 'REOPEN_DAY', label: 'Day Reopened' },
      { value: 'AUTO_SAVE,SAVE_DAY', label: 'System Auto-Saves' }
    ],
    exportFileNamePrefix: 'water'
  })
}
