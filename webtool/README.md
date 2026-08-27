# Port Klang Bill Extractor — single-file web tool

**`dist/portklang-extractor.html`** is the whole tool. One file, ~1.5 MB.
Double-click it, drop in Northport or Westports invoice PDFs, download the Excel
workbook.

No install, no server, nothing to run. Nothing is uploaded anywhere — the PDFs
are read in the browser and never leave the machine, so it is safe to open from a
shared drive or email it to a colleague.

## Using it

1. Open `dist/portklang-extractor.html` in any current browser.
2. Drop in one or more PDFs. Mixed piles are fine — each bill is recognised as
   Northport or Westports on its own, and everything merges into one workbook.
3. **Extract**, then **Download Excel workbook** — or **Download CSV** for the
   table you are looking at.

## What comes out

| Sheet | Contents |
|---|---|
| **Fields** | One row per PDF: issuer, invoice/bill no, dates, vessel, voyage, call no, totals, page counts |
| **Westports – Charges** | Every charge line, with its container, tariff code, quantity and rate |
| **Westports – Storage** | The storage annex sheet, where a bill carries one |
| **Northport – Charges** | Every charge line from the service-detail pages |
| **Northport – Tariff** | Line items from the tariff layout (`50124633`-style bills) |
| **Northport – Summary** | The cover page's Reference / Location / Voyage / Amount list |
| **Validation** | Adds the extracted rows back up and compares them to the printed totals |

Tabs with no rows are greyed out, so a pile of Westports bills shows only the
sheets that apply.

## How it reads a bill

Both terminals issue digitally generated PDFs, so every column sits at a fixed
position on the page. Rather than guess at a table, the parser bands each piece
of text into a column by its left edge and clusters text into lines by vertical
position. There is no OCR — and none is needed, because these PDFs carry a real
text layer. A scanned bill has no text to read, and the tool says so instead of
returning empty rows.

The issuer is detected from the page text, then routed to the matching parser.

### Westports

One invoice per document; vessel, voyage and call number are document-level and
repeat on every page. The charge table is grouped by container: a bare container
line (`FBIU5554359-RE- 40-IAL`) stands as a header above the charges billed
against it, and each charge inherits it. Rows carrying no amount are either a
container header or a continuation — a storage window, a VGM reading, or a
wrapped description — told apart by whether the text starts with an ISO container
number. Some bills add a storage annex page with per-container in/out timestamps,
which becomes its own table.

### Northport

Multi-page: a cover page listing references and amounts, then one detail page per
reference. Reference No, Location, Bill Of Lading No and the service-type banner
change on *every* detail page, so they are read per page and attached to that
page's rows. Inside the charge table, container, voyage, size, operator and SNO
are printed once per SNO block and inherited by later charges in the same block
(`3 DAYS STORAGE` then `1 REMOVAL`). A block that bills 30.00 + 65.00 also prints
95.00 underneath — only rows carrying a SERVICE DESCRIPTION count as charges, so
block totals are not billed twice.

### Quirks handled

- Cells are drawn a fraction of a point off their row — Northport's sub-totals,
  Westports' line numbers — so lines cluster by midpoint with a tolerance.
- Northport emits the Bill Of Lading value out of order in the text stream; it is
  matched to its label by vertical position.
- Northport stacks `SIZE` and `OPER` in one column on consecutive lines.
- Northport draws its printed total as three pieces of text (`95` `.` `00`),
  which have to be closed back up.
- Westports sometimes prints the call number inside the voyage, as
  `0101W (24B1MF)`.

The `.xlsx` is written by hand — an xlsx is a ZIP of XML, stored uncompressed —
so there is no spreadsheet library to inline.

## Source

| Path | |
|---|---|
| `src/geometry.js` | line clustering and column banding, shared by both parsers |
| `src/westports.js` | reads a Westports bill into rows |
| `src/northport.js` | reads a Northport bill into rows |
| `src/extract.js` | issuer detection, routing, reconciliation |
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

60 tests pinned to the sixteen sample bills — totals and reconciliation for every
one, plus the structural cases: container fill-down, block-total suppression,
per-page reference handling, page breaks, the storage annex, the tariff layout,
and the text-joining quirks above.

## Background

- [`../docs/westports-extraction-analysis.md`](../docs/westports-extraction-analysis.md)
  — Westports layouts, and where this departs from the AlgoDocs recipe
- [`../docs/northport-extraction-analysis.md`](../docs/northport-extraction-analysis.md)
  — why that AlgoDocs recipe does not transfer to Northport
