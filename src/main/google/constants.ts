// Fallback values for Google OAuth read from environment variables injected at build time.
// Raw secrets must never be hardcoded in version-controlled source files.
// Credentials can also be configured directly in Settings and stored encrypted at rest in config.json.
export const DEFAULT_GOOGLE_CLIENT_ID: string = process.env['GOOGLE_CLIENT_ID'] || ''
export const DEFAULT_GOOGLE_CLIENT_SECRET: string = process.env['GOOGLE_CLIENT_SECRET'] || ''
