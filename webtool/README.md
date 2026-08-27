# Northport Bill Extractor — single-file web tool

**`dist/northport-extractor.html`** is the whole tool. One file, ~1.5 MB. Double-click
it, drop in Northport invoice PDFs, download the Excel workbook.

No install, no server, nothing to run. Nothing is uploaded anywhere — the PDFs are read
in the browser and never leave the machine, so it is safe to open from a shared
drive or email it to a colleague.

## Using it

1. Open `dist/northport-extractor.html` in any current browser.
2. Drop in one or more PDFs (several bills merge into one workbook).
3. **Extract**, then **Download Excel workbook** — or **Download CSV** for the
   table you are looking at.

## What comes out

| Sheet | Contents |
|---|---|
| **Fields** | One row per PDF: Bill No, Invoice Date, Due Date, A/C No, Bill To, Total, page counts |
| **Table 1 – Charges** | Every billable charge line from the service-detail pages |
| **Table 2 – Tariff** | Line items from the tariff layout (`50124633`-style bills) |
| **Summary** | The cover page's Reference / Location / Voyage / Amount list |
| **Validation** | Reconciles summary rows and charge lines against the printed total |

`Table 1 – Charges`:

```
Bill No | Invoice Date | Due Date | A/C No | Reference No | Location | Service Type |
Bill Of Lading No | Purchase Order No | SNO | Container No | Voyage | Size | Oper |
Status | Service Description | Description | Amount (RM) | Sub-Total (RM) | Source File | Page
```

## How it reads a bill

Northport invoices are digitally generated, so every column sits at a fixed
position on the page. Rather than guess at a table, the parser bands each piece of
text into a column by its left edge and clusters text into lines by vertical
position. There is no OCR — and none is needed, because these PDFs carry a real
text layer. A scanned bill has no text to read, and the tool says so instead of
returning empty rows.

1. **Classify each page** — summary, service detail, or tariff detail.
2. **Read that page's header** by vertical alignment. Reference No, Location,
   Bill Of Lading No and the service-type banner change on *every* detail page,
   so they are read per page and attached to that page's rows.
3. **Walk the charge table in SNO blocks.** Container, voyage, size, operator and
   SNO are printed once per block; later charges in the same block
   (`3 DAYS STORAGE` then `1 REMOVAL`) inherit them.
4. **Drop the block totals.** A block billing 30.00 + 65.00 also prints 95.00
   underneath. Only rows carrying a SERVICE DESCRIPTION are charges.
5. **Reconcile** against the total printed on the bill.

Quirks handled: sub-total cells are drawn a fraction of a point off their charge
row; the Bill Of Lading value is emitted out of order in the PDF text stream and
is matched to its label by vertical position; `SIZE` and `OPER` share one column,
stacked on consecutive lines; the printed total is drawn as three separate pieces
of text (`95` `.` `00`) that have to be closed back up.

The `.xlsx` is written by hand — an xlsx is a ZIP of XML, stored uncompressed —
so there is no spreadsheet library to inline.

## Source

| Path | |
|---|---|
| `src/parser.js` | reads a bill into rows |
| `src/schema.js` | table and column definitions |
| `src/xlsx.js` | the workbook and CSV writers |
| `src/app.js` | queue, grid, downloads |
| `src/page.html` | markup and styles |
| `vendor/` | pdf.js 3.11.174, inlined at build time |
| `build.mjs` | bundles it all into `dist/` |

Rebuild after editing anything in `src/`:

```bash
node webtool/build.mjs
```

## Tests

```bash
cd webtool && npm install pdfjs-dist@4.6.82 --no-save
node --test "test/*.test.mjs"
```

29 tests pinned to the six sample bills: totals, per-page reference handling,
block fill-down, block-total suppression, the tariff layout, and the text-joining
quirks above.

## Scope

Handles the two Northport layouts present in `Northport/`. Westports bills are a
different format and are not handled.

`../docs/northport-extraction-analysis.md` explains why the AlgoDocs Westports
recipe does not transfer to Northport.
