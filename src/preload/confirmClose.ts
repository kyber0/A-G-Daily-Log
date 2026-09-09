import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronConfirmClose', {
  confirm: () => ipcRenderer.send('confirm-close:confirm'),
  cancel:  () => ipcRenderer.send('confirm-close:cancel'),
})
