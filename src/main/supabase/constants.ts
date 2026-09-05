// Fallback values read from environment variables injected at build time.
// For production builds: URL is fine to keep as default endpoint; keys are never baked in.
// Supabase Anon Key and app credentials are stored locally in config.json.
export const DEFAULT_SUPABASE_URL: string = process.env['SUPABASE_URL'] ?? ''
