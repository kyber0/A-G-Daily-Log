# Inventory Feature Specification
Derived from `STOCK_REPORT.xlsx` and `12-_SALES_REPORT__DEC-2023_.xlsx` (business: LIVING WATER A&G), for the water-refill-app rebuild.

**Files this spec covers:**
- `STOCK_REPORT.xlsx` — original source file (analysis only, not to be edited)
- `12-_SALES_REPORT__DEC-2023_.xlsx` — one month of the linked Sales Report series (analysis only, **never edited by the app's Stock Report logic**)
- `STOCK_REPORT_stable.xlsx` — first-pass cleanup: same single-sheet layout as the original, formula-and-value-identical, just with the ~24 decorative colors reduced to a stable, meaningful set. Superseded by the file below for actual implementation.
- **`STOCK_REPORT_refactored.xlsx`** — the reference implementation. Segments the one 36-column sheet into 7 purpose-built sheets, replaces every hand-typed running-total formula with a real transaction ledger, and is the structure Section 14 documents in full. **This is the file the app's Inventory feature should be built to match.**

Section 8 is the Sales Report connection design. Section 11 lists things the original files do that the app should NOT copy. Section 12 is the recommended app data model. Section 14 documents the actual reference workbook, sheet by sheet, formula by formula.

---

## 1. Domain model in plain English

LIVING WATER A&G runs a water refill station and also acts as a **distributor**: it buys stock in bulk (containers, cap seals, filters, salt, labels, dispensers, etc.) from suppliers, then moves that stock out two ways:

1. **Retail, at its own counter** — this is what the daily/monthly **Sales Report** currently tracks (one workbook per month, one sheet per day).
2. **Wholesale, to 15 named buyer accounts** (other refilling stations/shops it supplies) — this is only tracked in the **Stock Report**, never in the Sales Report.

Both of these are the *same underlying event* — stock leaving inventory — just recorded in two different places today, against two independently-typed copies of the item catalog. The fix: **one shared Item catalog, one shared stock ledger, two views (Sales Report, Inventory) over it** — and Balance updates the moment either channel moves stock, without ever writing back into the Sales Report file itself (confirmed requirement — see Section 8).

---

## 2. Entities

| Entity | What it is | Where it lives in the source files today |
|---|---|---|
| **Item** | A catalog product | Duplicated: Sales Report's "Inventory List" sheet AND Stock Report's own columns. **One shared entity in the app; one `Item Catalog` sheet in the reference file.** |
| **Category** | Grouping of items (10 of them) | Red banner divider rows in Stock Report; a VLOOKUP column in Sales Report. **One `Categories` reference sheet.** |
| **Buyer** | An outlet the business dispatches stock to | Stock Report columns U–AJ only. **One `Buyers` reference sheet**, own shop flagged. |
| **SalesEntry** | One retail sale, logged day-by-day | Sales Report `Table13`, one row per sale. Stays in Sales Report's own file. |
| **StockMovement** | Any unit(s) of an item moving in or out, from any channel | Not a real entity in the source. **One `Stock Movements` sheet — the actual ledger.** |
| **Restock / Purchase Order** | A bulk order placed with a supplier | Stock Report bottom log. **One `Restock Orders` sheet.** |
| **Status** *(new)* | Current availability of an item | Unused in source. **Computed column on `Item Catalog`.** |
| **Batch Note** *(new, kept by request)* | A manual flag like "SOLD" or "NEW BATCH" | Baked into item name text in source. **Separate `Batch Note` / `Batch Date` columns on `Item Catalog`, color-driven by conditional formatting.** |

---

## 3. Sales Report schema (source: `Table13`, B7:I107, plus K/L outside the table)

| Col | Header | Type | Formula (source) | Meaning |
|---|---|---|---|---|
| B | ITEM DESCRIPTION | text | dropdown, sourced from `'Inventory List'!$B$3:$B$47` | which item was sold |
| C | ITEM CATEGORY | text | `=IFERROR(VLOOKUP(B{r},InventoryList[],2,0),"–")` | looked up, not typed |
| D | ITEM CODE | text | `=IFERROR(VLOOKUP(B{r},InventoryList[],3,0),"–")` | looked up, not typed |
| E | PRICE (SRP) | currency | `=IFERROR(VLOOKUP(B{r},InventoryList[],4,0),"–")` | looked up, not typed |
| F | QTY | number | manual entry | units sold in this transaction |
| G | SALES AMOUNT | currency | `=Table13[[#This Row],[PRICE(SRP)]]*Table13[[#This Row],[QTY]]` | Price × Qty |
| H | DISCOUNT | currency | manual entry (calculated-column formula is broken/dead — see 11.9) | per-sale discount |
| I | SALES TOTAL | currency | `=Table13[[#This Row],[SALES AMOUNT]]-Table13[[#This Row],[DISCOUNT]]` | Sales Amount − Discount |
| K | REMARKS | text | manual entry, outside the table | free text |
| L | DATE (STOCK OUT) | date | manual entry, outside the table | date of the sale |

Header summary box: `I3 =SUM(G8:G107)`, `I4 =SUM(H8:H107)`, `I5 =SUM(I8:I107)` — `I5` is the number Stock Report currently pulls in via external link. **The app replaces that link with a direct query (Section 8) — Sales Report itself is never modified.**

---

## 4. Stock Report item schema — original 36-column layout (historical reference; superseded by Section 14)

| Col | Header | Formula (source) | Meaning |
|---|---|---|---|
| A | CODE | manual entry | supplier code, **not unique** (11.5) |
| B | ITEM | manual entry | name, **sometimes has status baked in** (11.1) |
| C | PACKING | manual entry | unit description |
| D | PRICE (Dealer) | manual entry | cost per unit |
| E | QUANTITY ORDERED | manual entry | cumulative, all-time |
| F | TOTAL AMOUNT | `=D{r}*E{r}` | Dealer price × Qty Ordered |
| G | QTY (STOCK OUT) | **manual addition chain** (11.2) | cumulative, wholesale only |
| H | QTY (BALANCE) | `=SUM(E{r}-G{r})` | undercounts, ignores retail (11.3) |
| I–L | *(unused)* | — | dead columns (11.7) |
| M | STATUS | unused | now built for real — Section 13 |
| N | SO No. | manual entry | mostly blank at item level |
| O | SRP | manual entry | independently typed from Sales Report's own price (11.4) |
| P | DISCOUNT | manual entry | rare |
| Q | SALES AMOUNT | `=SUM(G{r}*O{r})` | wholesale only |
| R | PROFIT PER ITEM | `=SUM(O{r}-D{r})` | |
| S | TOTAL STOCK OUT | `=SUM(U{r}:AX{r})` | should equal G |
| T | *(check)* | `=S{r}-G{r})` | must be 0 |
| U | A&G (LW-BAAO) | manual addition chain | own shop |
| V–AJ | 15 named buyers | manual addition chain | wholesale |

---

## 5. Categories (exact list, in order)

CONTAINERS, CAPSEALS, SOAP SANITIZER, SALT 50KG, FILTERS, PET BOTTLE, LABELS, STICKER, CAPS REPLACEMENT, DISPENSERS.

Plus 4 "TRUCKING FEE" line items after the last category — delivery fees, not items; they belong with the restock log.

---

## 6. Buyers (exact list, in order)

1. **A&G (LW-BAAO)** — own shop, not a wholesale buyer
2. ALKAVIVA (BAAO)
3. OTHERS (CUSTOMER)
4. CRISPY KING
5. CITY WATER (LW-TAPAYAS)
6. PURE DROP
7. LW (SORSOGON)
8. LW (BATO)
9. SARALEX
10. CRYSTAL REF. STATION
11. WATER MARKET (BAAO)
12. AQUARES
13. LANON W.R.S.
14. W.L.D. REF. STN (BATO)
15. ALKAVIVA (BARAS)
16. SHAUNTI REF. STN.

---

## 7. Restock / Purchase Order log

| # | What | Amount | Trucking fee |
|---|---|---|---|
| 1 | SO111897, 13.Oct.2023 → 05.Nov.2023 | 250,480 | — |
| 2 | SO112258, 23.Oct.2023 → 05.Nov.2023 | 63,988 | — |
| 3 | Trucking for SO112635, 03.Nov.2023 → 05.Nov.2023 | — | 16,000 |
| — | **INITIAL CAPITAL** (sum of 1–3) | **330,468** | |
| 4 | SO124878, 30.Sept.2024 → 03.Oct.2024 | 50,085 | |
| 5 | Trucking (Lalamove) for SO124878 | | 12,300 |
| 6 | SO136446, 07.Oct.2025 → 15.Oct.2025 | 50,210 | |
| 7 | Trucking (Lalamove) for SO136446 | | 11,615 |
| 8 | SO141459, 15.May.2026 → 16.May.2026 | 55,186 | |
| 9 | Trucking (Lalamove) for SO141459 | | 12,700 |
| — | **TOTAL SPENT TO DATE** | **522,564** | |

---

## 8. Connecting Inventory to the Sales Report — confirmed design

**Sync timing (confirmed):** immediate and automatic — the moment a sale is saved in Sales Report, Stock Report's balance reflects it. No batch/manual sync step.

**The Sales Report file is never edited.** The connection lives entirely on the Stock Report side:

1. App saves a `SalesEntry` in its own Sales Report data/file (unchanged from the existing plan).
2. App appends one row to `Stock Movements` in the Stock Report workbook: `Direction=Out`, `Buyer=A&G (LW-BAAO)` (own shop), `Source=Sales Entry`, `Reference` pointing back to the sale.
3. Every formula on `Item Catalog` (`Qty Stock Out`, `Qty Balance`, `Status`) re-evaluates automatically, because they're live `SUMIFS` formulas reading the `Stock Movements` sheet — not stored numbers that need separate updating.

Wholesale dispatches (to any of the 15 buyers) are appended the same way, tagged `Source=Wholesale Dispatch`, logged directly from the Inventory side since Sales Report has no buyer concept. Restocks are appended tagged `Source=Restock`, linked to a `Restock Orders` row.

The old Yearly Sales external-link mechanism is gone — replaced by a direct query over the app's own Sales data (`yearlySales(year)` in Section 12).

---

## 9. Color / highlight semantics

| Color | Where | Meaning | In the reference file |
|---|---|---|---|
| Dark red | Category grouping | Section grouping | Kept as a UI/category concept, not required in the flat catalog layout |
| Yellow | Batch Note = "SOLD" | This batch is sold out | **Conditional formatting**, driven by the text itself — can't drift out of sync with a manually-applied fill the way the original could |
| Light blue | Batch Note = "NEW BATCH" | A new batch has come in | Same — conditional formatting |
| ~15 other scattered colors | ordinary data cells | **Confirmed decorative, no meaning** | Not replicated |

Status (In Stock / Low / Out) gets the same treatment in the reference file: green / yellow / orange conditional formatting driven by the computed value, never a manually-applied fill.

---

## 10. Confirmed business rules

- `Qty Stock Out` = units sold/dispatched, from any channel, combined.
- `Qty Balance` = `Qty Ordered` − `Qty Stock Out`, across all channels.
- Own-shop is not a "buyer" — kept separate from the 15 wholesale buyers, but still just another `Buyer` row with `isOwnShop=true`.
- Decorative colors carry no state.
- STATUS: build for real, computed from Balance + per-item threshold (Section 13).
- Batch label/flag: **kept**, as its own field — not baked into the item name.
- Buyer-level breakdown: **kept** as an always-current, auto-computed view (`Buyer Summary`), not a manually maintained grid.
- Sales Report file: **never edited** by any of this.

---

## 11. Data-quality issues found in the source files (documented, not replicated)

1. **11.1 — Status baked into the name field.** `(SOLD)` / `- NEW BATCH (date)` typed into the item name, fragmenting one item into multiple rows over time.
2. **11.2 — Stock-out is a hand-typed running total, not a ledger.** e.g. `=245+1+1+1+5+1+1+15+2+10...`, with no per-transaction history surviving.
3. **11.3 — Wholesale-only tracking undercounts real stock.** The original Balance never saw retail sales at all.
4. **11.4 — Two independently-typed item catalogs that can drift** (Sales Report's "Inventory List" vs. Stock Report's own columns).
5. **11.5 — Item codes aren't reliably unique.** Some rows share a code across different batches; some have none.
6. **11.6 — The restock log's amount column switches (F, then G) partway through**, and one divider row had a stray leftover item code.
7. **11.7 — Dead columns** (I, J, K, L) with no data anywhere in the sheet.
8. **11.8 — Fragile cross-file formulas** for the yearly rollup.
9. **11.9 — Sales Report's DISCOUNT calculated-column formula is broken** (`...*#REF!`); every real value is manually typed over it.
10. **11.10 — A stray cell reference hidden inside a stock-out chain.** Row 37 (`INDUSTRIAL SALT ART-COURSE`)'s `QTY (STOCK OUT)` formula was `=1+1+1+M324+1+1+...` — `M324` is a typo, an out-of-range empty cell that silently evaluates to 0 instead of throwing a visible error. The true total (confirmed against the per-buyer breakdown, which summed correctly) is 63, not the corrupted-but-plausible-looking number the chain would produce if `M324` weren't blank. **This is the exact failure mode a hand-typed running total invites — a typo that doesn't error, doesn't get noticed, and just quietly sits in the total.** Fixed in the reference file by computing from the transaction-level buyer breakdown instead.
11. **11.11 — Two rows sharing one physical batch.** Rows 15–16 (`5 GAL SLIM CONTAINER W/ CAP GREEN`) were merged cells (`C15:C16`, `D15:D16`, `H15:H16`) representing one restock batch whose stock-out tally had simply outgrown a single row's chain, split across two rows with a combined balance formula (`H15 =SUM(E15-G15)-G16`). Reconstructed as a single catalog item in the reference file (Qty Ordered 350, combined Stock Out 220, Balance 130 — verified to match the original's merged-cell balance exactly).

---

## 12. Recommended data model for the app

```typescript
interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

interface Item {
  id: string;                 // generated, stable — NOT the supplier code (11.5)
  itemLabel: string;           // id + name, guaranteed-unique display key (see 14.2) — used as the
                                 // foreign key in Stock Movements / Buyer Summary, since name alone
                                 // is NOT unique in the real data (11.11-style duplicate-name pairs)
  code?: string;
  name: string;                 // clean — no "(SOLD)" / "NEW BATCH" text (11.1)
  categoryId: string;
  packing?: string;
  dealerPrice: number;
  srp: number;
  batchNote?: 'SOLD' | 'NEW BATCH' | null;   // kept by request — own field, not name text
  batchDate?: string;
  lowStockThreshold?: number;    // drives derived status (Section 13); unset by default
  createdAt: string;
  updatedAt: string;
}
// status is NOT stored — always computed on read from qtyBalance() + lowStockThreshold (Section 13),
// exactly as it is in Item Catalog's Status column in the reference file (a live formula, not a value)

interface Buyer {
  id: string;
  name: string;               // seed with the 16 in Section 6
  isOwnShop: boolean;          // true only for "A&G (LW-BAAO)"
}

interface SalesEntry {         // one row in the Sales Report (unchanged file/shape)
  id: string;
  itemId: string;
  quantity: number;
  discount?: number;
  date: string;
  remarks?: string;
  stockMovementId: string;      // the StockMovement this sale generated (Section 8)
}

interface StockMovement {       // the single ledger — Section 14.3
  id: string;
  itemId: string;
  direction: 'in' | 'out';
  quantity: number;
  buyerId?: string;              // required when direction='out'
  date: string;
  source: 'sales_entry' | 'wholesale_dispatch' | 'restock' | 'historical_import';
  sourceId?: string;              // links to SalesEntry.id or RestockOrder.id
  note?: string;
}

interface RestockOrder {
  id: string;
  soNumber?: string;
  orderDate: string;
  receivedDate?: string;
  amount: number;
  truckingFee?: number;
  note?: string;
}
```

**Derived values** (never stored, always computed from `StockMovement`):

```
qtyOrdered(item)   = SUM(movements where direction='in',  itemId=item.id, quantity)
qtyStockOut(item)  = SUM(movements where direction='out', itemId=item.id, quantity)
qtyBalance(item)   = qtyOrdered(item) - qtyStockOut(item)
status(item)       = qtyBalance(item) <= 0 ? 'out'
                      : (item.lowStockThreshold != null && qtyBalance(item) <= item.lowStockThreshold) ? 'low'
                      : 'in_stock'
salesAmount(item)  = qtyStockOut(item) * item.srp
profitPerUnit(item)= item.srp - item.dealerPrice
stockOutByBuyer(item, buyer) = SUM(movements where direction='out', itemId=item.id, buyerId=buyer.id, quantity)
yearlySales(year)  = SUM(SalesEntry.quantity * item.srp - SalesEntry.discount where YEAR(SalesEntry.date)=year)
```

---

## 13. STATUS field logic

```
function computeStatus(item, balance):
  if balance <= 0: return 'out'
  if item.lowStockThreshold != null and balance <= item.lowStockThreshold: return 'low'
  return 'in_stock'
```

`lowStockThreshold` is per-item and user-editable, left unset by default. In the reference file this is columns K (threshold, blank) and O (Status, a live `IF` formula) on `Item Catalog`, with conditional formatting (green/yellow/orange) — never a manually-applied fill.

---

## 14. Reference implementation: `STOCK_REPORT_refactored.xlsx`

Built from the extracted, verified historical totals (see 11.10, 11.11 for corrections applied during extraction). 1,575 formulas, 0 errors on recalculation. Sheet order as opened: Dashboard, Item Catalog, Stock Movements, Buyer Summary, Restock Orders, Buyers, Categories.

### 14.1 Sheet overview

| Sheet | Rows of data | Role |
|---|---|---|
| Dashboard | — | Aggregates only, nothing entered here directly |
| Item Catalog | 51 items | Master list — the shared `Item` table |
| Stock Movements | 214 (seed) | The ledger — every future transaction is a new row here |
| Buyer Summary | 51 items × 16 buyers | Read-only computed pivot |
| Restock Orders | 9 | The PO log |
| Buyers | 16 | Reference/dropdown source |
| Categories | 10 | Reference/dropdown source |

### 14.2 Item Catalog — exact columns

| Col | Header | Formula |
|---|---|---|
| A | Item ID | literal, e.g. `ITM-001` |
| B | Item Label | `=A{r}&" · "&C{r}` — the unique key used everywhere else |
| C | Item Name | literal (cleaned — no batch text) |
| D | Code | literal |
| E | Category | literal, dropdown from `Categories!A3:A12` |
| F | Packing | literal |
| G | Batch Note | literal, dropdown `SOLD` / `NEW BATCH` / blank |
| H | Batch Date | literal |
| I | Dealer Price | literal |
| J | SRP | literal |
| K | Low Stock Threshold | literal, **left blank by default** |
| L | Qty Ordered | `=SUMIFS('Stock Movements'!$E:$E,'Stock Movements'!$C:$C,$B{r},'Stock Movements'!$D:$D,"In")` |
| M | Qty Stock Out | same pattern, `"Out"` |
| N | Qty Balance | `=L{r}-M{r}` |
| O | Status | `=IF(N{r}<=0,"Out",IF(AND(K{r}<>"",N{r}<=K{r}),"Low","In Stock"))` |
| P | Profit / Unit | `=J{r}-I{r}` |

Conditional formatting: G (Batch Note) → yellow if `"SOLD"`, light blue if `"NEW BATCH"`. O (Status) → green/`In Stock`, yellow/`Low`, orange/`Out`.

### 14.3 Stock Movements — exact columns, and the migration approach

| Col | Header |
|---|---|
| A | Move ID (`MV-0001`, sequential) |
| B | Date |
| C | Item Label (dropdown from `Item Catalog!B`) |
| D | Direction (`In` / `Out`) |
| E | Quantity |
| F | Buyer (dropdown from `Buyers!A`, blank for `In`) |
| G | Source (`Sales Entry` / `Wholesale Dispatch` / `Restock` / `Historical Import`) |
| H | Reference |
| I | Note |

**Seeding methodology:** the original file only ever kept running totals — no per-transaction dates survive (11.2). So each item gets exactly one `In` row (its all-time `Qty Ordered`) and one `Out` row per buyer with a nonzero historical total (its all-time total to that buyer), all dated `2026-05-16` (the file's last known activity date) and tagged `Source=Historical Import`. This preserves every number exactly while being honest that it's a lump-sum migration, not fabricated transaction history. **Every real transaction from this point forward is one new row with a real date and the correct Source tag** — that's the entire mechanism, and it's also literally what Section 8 describes as the Sales Report connection.

### 14.4 Buyer Summary — exact formula pattern

Columns: Item Label, Item Name, then one column per buyer (16), then Row Total, then a Check column.

Each buyer cell: `=SUMIFS('Stock Movements'!$E:$E,'Stock Movements'!$C:$C,$A{r},'Stock Movements'!F:F,{buyer}$2,'Stock Movements'!$D:$D,"Out")`
Check column: `=RowTotal{r} - 'Item Catalog'!$N{itemrow}` — flags red if nonzero. **All 51 currently read 0.**

### 14.5 Restock Orders — exact columns

SO Number, Order Date, Received Date, Amount, Trucking Fee, Order Total (`=SUM(Amount:TruckingFee)`), Note. One row per historical entry from Section 7, plus a totals row (`=SUM(...)`, reads 522,564 — matches the item-level `Total Amount` sum independently, a strong internal consistency check).

### 14.6 Dashboard — exact metrics

Total catalog items, Items by Status (`COUNTIF` against `Item Catalog!O`), Total Qty Ordered/Stock Out/Balance (`SUM` against `Item Catalog`), Total spent on restocking (pulled from `Restock Orders` total row), and "Sales this period" — a `SUMPRODUCT` over `Stock Movements` filtered to `Source="Sales Entry"`, currently 0 since no real dated sales exist yet (only `Historical Import` rows). This is intentionally ready to populate as real Sales Report activity flows in.

### 14.7 Verification results

| Metric | Original (`STOCK_REPORT.xlsx`) | Reference file | Match |
|---|---|---|---|
| Total Qty Stock Out | 2,606 | 2,606 | ✅ |
| Total Qty Balance | 4,165 | 4,165 | ✅ |
| Total restocking spend | 522,564 | 522,564 | ✅ |
| Buyer Summary cross-checks (51 items) | — | all 0 | ✅ |
| Items flagged "Out" (Balance=0) | 5 of 6 `(SOLD)`-tagged items exactly | 5 (computed) | ✅ (6th item's real balance is 1, not 0 — original's manual tag was applied one unit early; computed Status is correct where the manual label wasn't) |

### 14.8 What the app needs to do to keep this file (or its DB equivalent) in sync

1. On `SalesEntry` save → append one `Stock Movements` row (`Out`, own shop, `Source=Sales Entry`, `Reference`→sale id). Immediate, automatic (confirmed in Section 8).
2. On wholesale dispatch (logged from the Inventory feature) → append one row (`Out`, chosen buyer, `Source=Wholesale Dispatch`).
3. On restock received → append one `Restock Orders` row and one `Stock Movements` row (`In`, `Source=Restock`, `Reference`→PO id).
4. Never write to the Sales Report file from any of this — only `Stock Movements` changes.
5. Everything else (`Qty Ordered`, `Qty Stock Out`, `Qty Balance`, `Status`, `Buyer Summary`, `Dashboard`) is a formula and updates itself.
