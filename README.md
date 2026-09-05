# A&G Daily Log

A Windows desktop application for managing daily water refill station sales, retail inventory, and operations for **A&G Water Refill Station (Living Water)** — replacing manual paper and spreadsheet entry while preserving the exact 31-sheet monthly Excel workbooks the business relies on.

---

## 🛠 Tech Stack

- **Desktop Runtime**: [Electron](https://www.electronjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) (`electron-vite`)
- **Cloud Backend**: [Supabase](https://supabase.com/) (PostgreSQL + GoTrue Auth) with Row Level Security (RLS)
- **Local Database**: SQLite 3 ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) in WAL mode with auto-healing
- **Offline Sync**: Custom offline-first sync engine with retry limits and dead-letter protection
- **Excel Engine**: [ExcelJS](https://github.com/exceljs/exceljs) for generating accounting-compliant spreadsheets
- **UI & Charts**: Vanilla HTML5/CSS3 (Glassmorphism design system) + [Chart.js](https://www.chartjs.org/) + [Flatpickr](https://flatpickr.js.org/)
- **Testing**: [Vitest](https://vitest.dev/)

---

## 🚀 Setup & Local Development

### 1. Prerequisites
- Node.js (v20 or v22 LTS recommended)
- npm (v10+)

### 2. Clone and Install
```bash
git clone https://github.com/kyber0/A-G-Daily-Log.git
cd A-G-Daily-Log
npm install
```

### 3. Environment Configuration (Development Mode)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Supabase project parameters:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key-here
```
> **Note:** In production builds, credentials are never baked into the binary. Instead, the app prompts for credentials during the initial setup screen and stores them locally in `%APPDATA%\ag-daily-log\config.json`.

### 4. Run the Dev Server
```bash
npm run dev
```

---

## 🧪 Automated Testing

The project uses [Vitest](https://vitest.dev/) to verify critical business logic: Excel export format accuracy, stock balance calculations, and Supabase client authentication checks:

```bash
# Run all unit tests once
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📦 Packaging & Building Installers

To build the standalone Windows installer (`.exe`):
```bash
npm run package
```
The output NSIS installer will be located in the `dist-app/` directory (e.g. `dist-app/A&G Daily Log Setup 2.1.0.exe`).

### Windows SmartScreen Note (Code Signing)
The build configuration in `package.json` sets `forceCodeSigning: false`. Windows Defender SmartScreen may display an "Unknown Publisher" warning on initial installation.
- **To install**: Click **More info** → **Run anyway** (or right-click the `.exe` → **Properties** → check **Unblock**).
- **Code Signing (Production)**: If purchasing an Organization Validation (OV) code signing certificate, provide `CSC_LINK` and `CSC_KEY_PASSWORD` at build time without committing secrets.

---

## 🗄 Database & Migrations

Database schema and security migrations are located in `supabase/migrations/`:
- `001_initial_schema.sql` — Base tables, types, and indexes.
- `002_fix_rls_and_triggers.sql` — Automatic stock movement trigger functions.
- `003_add_missing_indexes.sql` — Query performance optimizations.
- `004_authenticated_rls.sql` — Authenticated-only Row Level Security (RLS) policies across all 14 tables.

Apply them via the Supabase Dashboard **SQL Editor** or Supabase CLI in numeric order.

---

## 📊 Data Model Overview

| Domain | Description |
| :--- | :--- |
| **Daily Log** | Water refill service transactions (Gallon & Bottle formats across Alkaline, Purified, and Mineral water) with Pickup vs. Delivery pricing, plus daily operational expenses (*Gasoline, Staff Meals, Trucking, Maintenance*). |
| **Sales Report** | Merchandise and accessories sales (*dispensers, caps, seals, containers*) mapped to counter retail and wholesale station accounts. |
| **Stock Report** | Inventory catalog and batch movements (`IN` supplier restocks and `OUT` sales deductions), tracking balance and low-stock alerts. |
| **Audit Logs** | Immutable SQLite action history recording user actions, saves, edits, and deletions. |

---

## 🔐 Security & Hardening

1. **Zero Secret Baking**: The Supabase `service_role` key is never bundled into output code.
2. **Authenticated App Session**: The client connects using the public `anon` key, immediately establishing a signed-in session using a dedicated service user (`app@agwaterrefill.internal`).
3. **Database RLS**: Every table enforces `to authenticated` policies; unauthenticated anonymous requests are rejected at the database level.
4. **Local Configuration**: Client settings are persisted securely on the user's computer in `config.json`.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
Copyright (c) 2026, Keaneth Dave Berido.
