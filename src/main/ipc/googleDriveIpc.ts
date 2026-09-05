import { ipcMain, app, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { google } from 'googleapis'
import type { IpcResult, DriveStatus } from '../../shared/types'

// Client credentials — pull from runtime environment / local config, never hardcode secrets in source
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const REDIRECT_URI = 'http://localhost:3000'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

const TOKEN_PATH = path.join(app.getPath('userData'), 'google_auth.json')

let oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

// Load saved tokens if they exist
if (fs.existsSync(TOKEN_PATH)) {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
    oauth2Client.setCredentials(tokens)
  } catch (err) {
    console.error('[drive] Failed to load Google tokens', err)
  }
}

// In-memory cache for folder IDs to prevent redundant API calls & duplicate folder creation
const folderIdCache = new Map<string, string>()

export function registerGoogleDriveIpc(): void {
  ipcMain.handle('drive:status', async (): Promise<IpcResult<DriveStatus>> => {
    try {
      if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) {
        return { ok: true, data: { connected: false, email: null } }
      }
      
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const res = await oauth2.userinfo.get()
      return { ok: true, data: { connected: true, email: res.data.email || 'Unknown' } }
    } catch (err: any) {
      return { ok: true, data: { connected: false, email: null } }
    }
  })

  ipcMain.handle('drive:auth', async (): Promise<IpcResult<DriveStatus>> => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return { ok: false, error: 'Google OAuth Client ID and Secret are not configured.' }
    }
    return new Promise((resolve) => {
      let isSettled = false
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const safeResolve = (val: IpcResult<DriveStatus>) => {
        if (isSettled) return
        isSettled = true
        if (timeoutId) clearTimeout(timeoutId)
        try { server.close() } catch {}
        resolve(val)
      }

      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, 'http://localhost:3000')
          const code = url.searchParams.get('code')
          if (code) {
            res.end('<h1>Authentication successful!</h1><p>You can close this tab and return to the app.</p><script>window.close()</script>')
            
            const { tokens } = await oauth2Client.getToken(code)
            oauth2Client.setCredentials(tokens)
            
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens))
            
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
            const userInfo = await oauth2.userinfo.get()
            
            safeResolve({ ok: true, data: { connected: true, email: userInfo.data.email || 'Unknown' } })
          } else {
            res.end('<h1>Authentication failed</h1>')
            safeResolve({ ok: false, error: 'Auth failed: No code received' })
          }
        } catch (err: any) {
          try { res.end('<h1>Authentication failed</h1><p>' + err.message + '</p>') } catch {}
          safeResolve({ ok: false, error: err.message })
        }
      })

      server.on('error', (err: any) => {
        safeResolve({ ok: false, error: `Authentication server error: ${err.message}` })
      })

      // 120-second timeout to prevent permanently hung port
      timeoutId = setTimeout(() => {
        safeResolve({ ok: false, error: 'Authentication timed out. Please try again.' })
      }, 120_000)
      
      server.listen(3000, () => {
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
          prompt: 'consent'
        })
        shell.openExternal(authUrl)
      })
    })
  })

  ipcMain.handle('drive:disconnect', async (): Promise<IpcResult<void>> => {
    try {
      folderIdCache.clear()
      if (fs.existsSync(TOKEN_PATH)) {
        fs.unlinkSync(TOKEN_PATH)
      }
      oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
      return { ok: true, data: undefined }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })
}

/** Get or create a folder path on Google Drive with caching */
async function getOrCreateDriveFolder(drive: any, folderPath: string): Promise<string> {
  const normalizedPath = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!normalizedPath) return 'root'

  if (folderIdCache.has(normalizedPath)) {
    return folderIdCache.get(normalizedPath)!
  }

  const parts = normalizedPath.split('/')
  let currentParentId = 'root'
  let accumulatedPath = ''

  for (const part of parts) {
    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part
    if (folderIdCache.has(accumulatedPath)) {
      currentParentId = folderIdCache.get(accumulatedPath)!
      continue
    }

    const query = `name='${part.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${currentParentId}' in parents and trashed=false`
    const res = await drive.files.list({ q: query, spaces: 'drive', fields: 'files(id, name)' })

    if (res.data.files && res.data.files.length > 0) {
      currentParentId = res.data.files[0].id
    } else {
      const created = await drive.files.create({
        requestBody: {
          name: part,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParentId]
        },
        fields: 'id'
      })
      currentParentId = created.data.id
    }

    folderIdCache.set(accumulatedPath, currentParentId)
  }

  return currentParentId
}

/** Uploads a single file to Drive with atomic update if already exists */
export async function uploadToDrive(localPath: string, driveFolderPath: string): Promise<boolean> {
  if (!oauth2Client.credentials || !oauth2Client.credentials.access_token) return false
  if (!fs.existsSync(localPath)) return false

  const drive = google.drive({ version: 'v3', auth: oauth2Client })

  try {
    const parentId = await getOrCreateDriveFolder(drive, driveFolderPath)
    const fileName = path.basename(localPath)

    const isText = localPath.toLowerCase().endsWith('.txt')
    const mimeType = isText 
      ? 'text/plain' 
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

    // Check if file already exists in target folder
    const fileQuery = `name='${fileName.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
    const existingRes = await drive.files.list({ q: fileQuery, spaces: 'drive', fields: 'files(id, name)' })

    const media = {
      mimeType,
      body: fs.createReadStream(localPath)
    }

    if (existingRes.data.files && existingRes.data.files.length > 0) {
      // Update existing file in-place
      const fileId = existingRes.data.files[0].id!
      await drive.files.update({
        fileId: fileId,
        media: media,
        fields: 'id, name'
      })
    } else {
      // Create new file
      await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentId]
        },
        media: media,
        fields: 'id, name'
      })
    }

    return true
  } catch (err) {
    console.error(`[drive] Upload failed for ${localPath}:`, (err as any).message)
    return false
  }
}
