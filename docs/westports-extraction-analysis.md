# Westports invoice extraction — analysis

Analysis of the ten sample Westports bills in `Westport/`, and how the extractor
in `webtool/` implements them.

The AlgoDocs workbook in this repo, `steps algodocs westport.xlsx`, documents
**this** extractor — see
[`northport-extraction-analysis.md`](northport-extraction-analysis.md) §2 for the
transcribed 23 steps. This document records the layouts found in the samples and
where the implementation departs from that recipe.

---

## 1. Document structure

One invoice per document — and unlike Northport, the vessel, voyage and call
number are **document-level**, printed once and repeated on every page. That is
what makes the AlgoDocs "fill a single scalar into every row" step correct here
and wrong for Northport.

### Header

| Field | Where | Example |
|---|---|---|
| Invoice No | top right, label `No :` x466, value x519 | `727657457` |
| Date | top right, label `Date :` x465, value x534 | `27/12/2024` |
| SST Reg No | left, x19 | `W10-2402-32000142` |
| LHDN Validation / Unique ID | left, x19 | `20241227122909` |
| Visit ID, Vessel, Voyage, Call No, ATA, Line, Terms, DUE DATE | right block, labels x302, values x414 | `GH RIVER`, `072W`, `24A1M5` |
| Company (bill-to) | left, x24 | `FM Global Logistics (M) Sdn Bhd …` |
| Remarks | below table, x16 / x72 | `7580347 /BL No:7254770620` |
| Amount Excluding SST / Add Total SST / Total Amount | labels x299, values x546–562 | `1,754.00` |

### Charge table

Column positions are identical on every sample:

| Header | x |
|---|---|
| (line no.) | 15–45 |
| `DESCRIPTION` | 45–300 |
| `SST RATE(%)` | 300–360 |
| `QUANTITY` | 360–430 |
| `RATE` | 430–500 |
| `AMOUNT` | 500–600 |

Three row kinds appear inside it:

1. **Container header** — a bare container line with no amount, e.g.
   `FBIU5554359-RE- 40-IAL`. It groups the charges printed beneath it.
2. **Charge line** — a line number, a tariff code, a description and an amount,
   e.g. `1 G80104 STG-M-FCL-ASEAN-40', 11 Days, 243 Hours … 135.00`.
3. **Continuation** — a line with no amount that is not a container, carrying
   either a storage window (`02/12/2024, 10:50-12/12/2024, 13:20`), a VGM
   reading (`Shipper: 0 kg Terminal: 26,650 kg Variance: 0.00 %`), or a wrapped
   description.

The three are told apart by whether the row has an amount, and whether the
description starts with an ISO container number — the same
`[A-Z]{4}[0-9]{7}` regex the AlgoDocs workbook pins in `Sheet1!B130`.

---

## 2. Layout variants across the samples

| # | Variant | Seen on |
|---|---|---|
| **V1** | Container-grouped charges, full vessel header | `727657457`, `727739883`, `727741687`, `REEFER MONITOR` |
| **V2** | Container-grouped, **no vessel / voyage / call / ATA** (VGM-only bills) | `727737521`, `727739885`, `727740957` |
| **V3** | Container header with **no type/size suffix** — a bare number | `727741225` (`DAHU9100904`) |
| **V4** | **No container rows at all**; charges billed by count, with a `Line` field instead of a call number | `702510390` |
| **V5** | **Storage annex page** — a second page with its own table: `No / Vsl ID / Vsl Name / Voyage / Container ID / Sz / St / DG / IN Date / OUT Date / Days / Chgd Days / Total` | `702510390` p2 |
| **V6** | **Non-container service invoice** — `Terms 30 Days` + `DUE DATE`, no vessel block, description wraps across two lines | `780027139` |
| **V7** | **Multi-page invoice** — charges continue on page 2, totals repeat on both pages | `727739885` |

Container header forms that must all parse:

```
FBIU5554359-RE- 40-IAL     → FBIU5554359 / RE / 40 / IAL
MTMU2892985-DV-20-MTM      → MTMU2892985 / DV / 20 / MTM
DAHU9100904                → DAHU9100904 /    /    /
```

---

## 3. Where the implementation departs from the AlgoDocs recipe

| AlgoDocs step | What the tool does instead | Why |
|---|---|---|
| Steps 5–7: *Remove Specific Column* ×3 to drop SST RATE / QUANTITY / RATE | Keeps all three as columns | They are real billing data. Dropping them was a convenience for the flattened AlgoDocs table, not a requirement. |
| Step 8: *Copy Rows … until next occurrence* to lift the container into a column | Same idea, done directly: a container header opens a group and every charge beneath inherits it | Identical result; no row juggling needed when the parser already knows the page geometry. |
| Steps 9–14: split / remove / merge columns to clean up the container string | One `splitContainer()` that returns container, type, size and operator | The AlgoDocs sequence discarded the type and operator; both are useful. |
| Steps 15–22: *Add Column* ×6 then *Fill Cells* with Invoice No / Date / Vessel / Voyage / Call No | Header fields are read once and stamped onto each row at build time | Correct for Westports, since these genuinely are document-level. |
| Step 23: strip the leading line number from the description | Line number is banded into its own column from the start | The number never enters the description, so nothing needs stripping. |
| — | Also extracts Visit ID, ATA, Terms, SST Reg No, Remarks, tariff code, and the storage annex | None of these were in the AlgoDocs field set, and all are useful for reconciliation. |

Two quirks the geometry has to absorb:

- **The line number is drawn ~0.6pt off its charge row** (`337.1` for the charge,
  `337.7` for the number). Lines are clustered by vertical midpoint with a
  tolerance rather than bucketed, or the number lands on its own row.
- **The call number is sometimes printed inside the voyage** as
  `0101W (24B1MF)` rather than on its own `Call No` line. It is split back out.

---

## 4. Reconciliation

Three checks per Westports bill, all passing on all ten samples:

1. Charge lines sum to **Amount Excluding SST (RM)**
2. Excluding SST + SST = **Total Amount (RM)**
3. Where a storage annex is attached, its rows sum to the invoice total

Totals repeat on every page of a multi-page invoice, so they are read once
per document rather than accumulated.

---

## 5. Cross-check against AlgoDocs

`REEFER MONITOR - WESTPORT.PDF` is the invoice the AlgoDocs workbook screenshots
were taken from. Its extracted values match the workbook exactly:

| Field | AlgoDocs screenshot | Extractor |
|---|---|---|
| Invoice No | `727623765` | `727623765` |
| Vessel | `X-PRESS AQUARIUS` | `X-PRESS AQUARIUS` |
| Voyage | `028W` | `028W` |
| Call No | `24B9R2` | `24B9R2` |
| First container | `FBIU5554359` | `FBIU5554359` |
| First charge | `G80104 STG-M-FCL-ASEAN-40', 11 Days, 243 Hours` @ `135.00` | same |

---

## 6. Open questions

1. **Should the storage annex rows be matched back to invoice charge lines?**
   Right now both are extracted but kept as separate tables; on `702510390` the
   annex has 4 containers against 2 charge lines, so the join is not 1:1.
2. **`SST RATE(%)` is `0` on every sample.** Confirm SST is genuinely zero-rated
   for these services rather than the column simply being unused.
3. **VGM detail** (`Shipper: 0 kg Terminal: 26,650 kg Variance: 0.00 %`) is kept
   as free text in the Detail column — split into Shipper / Terminal / Variance
   columns?
4. **`780027139`** is a monthly service invoice (garbage collection), not a
   container bill. Confirm these belong in the same feed.
