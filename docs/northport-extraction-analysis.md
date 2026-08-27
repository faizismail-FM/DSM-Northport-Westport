# Northport invoice extraction — analysis

Analysis of the sample Northport bills in `Northport/` against the AlgoDocs
extractor recipe documented in `steps algodocs northport.xlsx`.

---

## 1. Headline finding: the workbook documents the **Westports** extractor, not Northport

Despite the filename, every screenshot in `steps algodocs northport.xlsx` is a
Westports extractor session. Evidence:

| Signal | Value in workbook | Belongs to |
|---|---|---|
| Raw data header (Sheet1, img 1) | `WESTPORTS MALAYSIA SDN BHD (192725-V)` | Westports |
| Sample invoice no. | `727657457`, `727623765` (9-digit) | Westports (`Westport/727657457.pdf`) |
| Line-table columns | `DESCRIPTION / SST RATE(%) / QUANTITY / RATE / AMOUNT` | Westports |
| Extracted fields | Invoice No, Invoice Date, **Vessel**, **Voyage**, **Call No** | Westports |
| Container rows | standalone `CCLU7251910-DV- 40-CSE` header rows | Westports |

Northport bills have **none** of these: no SST RATE / QUANTITY / RATE columns,
no Vessel / Call No fields, and the container number is not a standalone header
row. So the recipe is a **reference method**, not a template that can be
re-pointed at Northport. Reusable primitives are identified in §5.

The workbook contains only two text cells:
- `[A-Z]{4}[0-9]{7}` — the ISO container-number regex (Sheet1!B130)
- `repeat 6 times` — annotates the *Add Column* step (table!V327)

---

## 2. What the workbook actually prescribes (Westports recipe, 8 sheets)

### Sheet1 / Sheet2 — raw-data pre-processing
1. **Specify Start Position** — `Text match including` → `DESCRIPTION`
2. **Specify End Position** — `Text match before` → `Remarks`
3. **Search & Replace** — regex `AMOUNT$` → `AMOUNT` (normalises the header)
4. **Convert to Table** — Strict Mode on
5. **Remove Specific Column** — regex `^SST$|^RATE\(\%\)$|^QUANTITY$|^RATE$`, *Match multiple columns*
6. **Merge Columns** — range 2→4
7. **Copy Rows** — copy following rows from col 2 where col 2 matches `[A-Z]{4}[0-9]{7}`,
   *Until the next occurrence* + *Remove copied row*, **Prepend** to column 2

### Field sheets — `Invoice no`, `invoice date`, `vessel`, `voyage`, `scn`
Each is a single-value field built the same way:

| Field | Advanced Keyword-Based Search | Data Type | Value position |
|---|---|---|---|
| Invoice No | `no` | ID / Invoice Number / Account | right of phrase |
| Invoice Date | `date` | Date, en-GB, output `yyyy-MM-dd` | right of phrase |
| Vessel | (vessel) | text | right of phrase |
| Voyage | `voyage` | Combination of digits & letters | right of phrase |
| Call No (SCN) | `call no` | Combination of digits & letters | right of phrase |

…followed by **Remove blank spaces → All Blank Spaces**.

### `table` sheet — the 23-step line-item pipeline
1. Specify Start Position → `description`
2. Specify End Position → `remarks`
3. Remove empty lines
4. Convert to Table (Strict Mode, *Process all pages as a single page*, *Table with column borders*)
5. Remove Specific Column where `^sst rate`
6. Remove Specific Column where `^quantity`
7. Remove Specific Column where `^rate`
8. **Copy Rows** — following rows from col 1 where col 1 matches `[a-z]{4}[0-9]{7}`,
   *Until next occurrence* + *Remove copied row* → container number lands in its own new column
9. Split Column 1 on `-` (splits `FBIU5554359-RE- 40-IAL` into number / type-size)
10. Remove Specific Column 2 (drops the `RE- 40-IAL` remainder)
11. **Keep Rows** where column 1 has a value
12. **Merge Rows** where column 3 has a value (folds the date/time continuation line into its charge line)
13. Split Column 1 (blank split value)
14. Remove Specific Column 2
15. **Add Column** after column 0 — *repeat 6 times* → six empty leading columns
16. Copy Column 8 → column 1
17. **Search & Keep** in column 1, regex `^[0-9].(0-9)?` → keeps the SNO
18. **Fill Cells Of Column** — Replace col 2 using the value of `Invoice No`
19. Fill Cells Of Column — Replace col 3 using `Invoice Date`
20. Fill Cells Of Column — Replace col 4 using `Vessel`
21. Fill Cells Of Column — Replace col 5 using `Voyage`
22. Fill Cells Of Column — Replace col 6 using `Call No`
23. Search & Replace in column 8, regex `^[0-9].(0-9)?` → strips the leading SNO from the description

**Final Westports table shape:**
`SNO | Invoice No | Invoice Date | Vessel | Voyage | Call No | Container | Description | Amount`

---

## 3. Northport document structure (the actual target)

Six samples split into **three distinct layouts**:

### Layout A — Summary + per-reference Service Detail (5 of 6 files)
`25678723`, `25694149b`, `25694501`, `25694711`, `71977468`

**Summary page(s)** — 1..n pages, columns at fixed x:

| Column | x | Example |
|---|---|---|
| Reference | 69 | `CF2500638243` |
| Location | 157 | `CT1` |
| Voyage No | 228 | `NA` |
| Amount (RM) | 442 | `95.00` |

plus header block: `Bill No` (x423), `A/C No`, `Date`, `Due Date`, and a
closing `Total (RM)` row.

**Detail pages** — *one page per Reference No*. Header block at x144/x240:
`Reference No`, `A/C No`, `Location`, `Date`, `Bill No`, `Bill Of Lading No`,
`Purchase Order No`, `Vendor No`, and a **service-type banner** at x27
(`IMPORT FCL`, `VERIFIED GROSS MASS (VGM)`, `MISCELLANEOUS SERVICES`,
`DEMURRAGE CHARGES`, `REEFER MONITORING SERVICES`).

Line table column x-positions — **stable across all layout-A samples**:

| Header | x | Notes |
|---|---|---|
| `SNO` | 27–38 | block index |
| `CONTAINERS/ VOYAGE` | 44 | **container on line 1, voyage code on line 2** |
| `SIZE` / `OPER` | 111 | SIZE on line 1, OPER on line 2 — *stacked in one column* |
| `STATUS` | 139 | `FCL` |
| `DESCRIPTION.` | 165–220 | 3–5 continuation lines per block |
| `SERVICE DESCRIPTION` | 322–350 | the billable charge name |
| `AMOUNT (RM)` | 436–467 | per-charge amount |
| `SUB-TOTAL` | 532–553 | per-charge and per-block subtotal |

Terminated by a `TOTAL PAYABLE (RM)` row.

### Layout B — Tariff bill (`50124633`)
Completely different detail table:
`TARIFF DESCRIPTION | NO DAYS | TARIFF UNIT | TARIFF CODE | RATE | AMOUNT | SUB-TOTAL`,
header carries `Ship ID / Voyage No`, `Ship Name`, `LOA`, `GRT`, and the
reference is `BS438326` (not `C?25…`). Terminated by `AMOUNT PAYABLE (RM)` plus
an amount-in-words line.

### Layout C — service-type variants inside layout A
The `DESCRIPTION.` cell content is service-type dependent and must not be
parsed generically:

| Service type | Description payload |
|---|---|
| IMPORT FCL | `EX (1)WAN HAI :01012025/0206` / `TO ROAD:09012025/1035(200:29)` / `CONF:A-IADA` / `I` |
| VGM | `NMB2025000954438` / `GATE IN:` / `SHIPPER VGM :` / `SHIPPER:` / `BOOKING REF:` |
| MISCELLANEOUS | `IID#:…;UNIT:…;RATE:…` / `CTR#:…;IMO:…;CLS:…` / `STBY 1FM …` |
| REEFER MONITORING | `PLUG:… UNPLUG:…` / `NO OF SHIFT:` / `STATUS: I-F` |
| DEMURRAGE | `EX (2)LAEM CHA:04/01/2025` / `CONF:L-HEUNG A LINES` / `0%` |

---

## 4. Where the Westports recipe breaks on Northport

| # | Issue | Impact |
|---|---|---|
| **B1** | **Header fields are per-page, not per-document.** `Reference No`, `Location`, `Bill Of Lading No`, `Purchase Order No` and the service type change on *every* detail page. AlgoDocs *Fill Cells Of Column → using the value of \<field\>* writes one scalar into all rows. | Steps 18–22 of the Westports recipe **cannot be reused** for these five fields. Only `Bill No`, `Date`, `Due Date` and `A/C No` are genuinely document-scalar. |
| **B2** | *Process all pages as a single page* is **required** (to get one table across N detail pages) but that is exactly what destroys the page↔reference association. | Reference No must be carried *inside* the table, not injected afterwards. |
| **B3** | Container is already its own column — but only populated on the **first line of each SNO block**; lines 2..5 of the block are blank in that column. | Needs a *fill-down within block*, not the Westports *copy-row-and-prepend*. |
| **B4** | `SIZE` and `OPER` are **stacked in the same x-column** (both at x=111). | Convert-to-Table will merge them into one cell; they need a post-split. |
| **B5** | A single SNO block can hold **multiple billable charges** (`3 DAYS STORAGE` **and** `1 REMOVAL`), each with its own AMOUNT, plus a block SUB-TOTAL row that must be discarded. | *Keep Rows where col has a value* must key on **SERVICE DESCRIPTION**, not on the container or SNO. |
| **B6** | Start/End anchors differ. Westports uses `DESCRIPTION`…`Remarks`. | Northport needs `CONTAINERS/` (or `SNO`) … `TOTAL PAYABLE`, and the **summary pages must be excluded** or they will be swept into the table. |
| **B7** | `50124633` (layout B) shares none of the above column geometry. | Needs a **separate extractor**, not a branch of the layout-A one. |
| **B8** | Voyage code sits on line 2 of the container column (`24B2PD`), while the summary page's `Voyage No` column reads `NA`. | Voyage must be taken from the detail table, not the summary. |

---

## 5. Reusable primitives from the workbook

These four AlgoDocs filters do carry over and should form the backbone:

1. **Copy Rows … Following … Until the next occurrence** — the workhorse.
   On Westports it propagates the container; on Northport the same primitive
   propagates **Reference No / Bill Of Lading No / Purchase Order No / service
   type** down over each detail page's rows, solving **B1/B2**.
2. **Keep Rows where column N has a value** — drops continuation lines.
3. **Merge Rows where column N has a value** — folds continuation lines back
   into their charge row.
4. **Fill Cells Of Column** — still correct for the true document scalars
   (`Bill No`, `Date`, `Due Date`, `A/C No`).

---

## 6. Proposed Northport pipeline (layout A)

**Document-scalar fields** (Advanced Keyword-Based Search, same pattern as the
workbook's field sheets):

| Field | Search phrase | Data type |
|---|---|---|
| Bill No | `bill no` | ID / Invoice Number / Account |
| Invoice Date | `date` | Date en-GB → `yyyy-MM-dd` |
| Due Date | `due date` | Date en-GB → `yyyy-MM-dd` |
| A/C No | `a/c no` | Combination of digits & letters |
| Total | `total (rm)` | Decimal |

**Table pipeline:**

1. Specify Start Position → `Text match including` → `CONTAINERS/`
   *(skips the summary pages, fixes B6)*
2. Specify End Position → `Text match before` → `Computer Generated Document`
3. Remove empty lines
4. Convert to Table — Strict Mode, **Process all pages as a single page**,
   Table with column borders
5. **Copy Rows** — Reference No band: copy following rows where column matches
   `^[A-Z]{2}[0-9]{7,10}$` (covers `CF2500638243`, `CT2500638246`, `CM2500637610`, `CD2500638995`, `CL1175540`), *Until next occurrence*, **Prepend** → reference column *(B1/B2)*
6. Repeat step 5 for the service-type banner (`IMPORT FCL|VERIFIED GROSS MASS|
   MISCELLANEOUS SERVICES|DEMURRAGE CHARGES|REEFER MONITORING`)
7. **Copy Rows** on the container column, regex `[A-Z]{4}[0-9]{7}`,
   *Until next occurrence* → fills container across the block *(B3)*
8. Split the SIZE/OPER column *(B4)*
9. **Keep Rows** where the SERVICE DESCRIPTION column has a value *(B5)*
10. **Merge Rows** to fold `TO ROAD:` / `CONF:` / `SHIPPER:` continuation lines
    into their charge row
11. Remove Specific Column → `^SUB-TOTAL` (redundant with AMOUNT per charge)
12. Remove the `TOTAL PAYABLE` row
13. **Add Column** ×4, then **Fill Cells Of Column** with `Bill No`,
    `Invoice Date`, `Due Date`, `A/C No`
14. Search & Replace to strip the leading SNO from the description

**Target output shape:**

```
Bill No | Invoice Date | Due Date | A/C No | Reference No | Service Type |
SNO | Container | Voyage | Size | Oper | Status | Description | Service Description | Amount
```

**Layout B (`50124633`) requires its own extractor**, keyed on the presence of
`TARIFF CODE` / `AMOUNT PAYABLE (RM)`, producing:

```
Bill No | Invoice Date | A/C No | Reference No | Ship Name | Ship ID/Voyage |
Tariff Description | Tariff Code | No Days | Tariff Unit | Rate | Amount
```

---

## 7. Open questions

1. **Is layout B (`50124633`) in scope?** It is one of six samples but shares no
   structure with the rest. Confirm whether it needs its own extractor now or
   can be excluded.
2. **Do you want the summary page reconciled** (Reference→Amount) against the
   detail pages as a validation check, or is the detail table alone the output?
3. **Is `SUB-TOTAL` needed** as its own column, or is per-charge `AMOUNT`
   sufficient? They are equal on every layout-A sample reviewed.
4. **Should VGM `BOOKING REF` / `SHIPPER` be split into their own columns**, or
   left inside the description text?
5. `71977468` uses A/C `M1855` and a 14-day penalty clause while the others use
   `A1855` / 30 days — confirm both account codes belong to the same feed.
