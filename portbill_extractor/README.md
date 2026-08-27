# Northport Bill Extractor

Upload Northport invoice PDFs, get one Excel workbook back. Built to replace the
AlgoDocs "Fields & Tables" setup for Northport bills.

See [`docs/northport-extraction-analysis.md`](../docs/northport-extraction-analysis.md)
for why the AlgoDocs Westports recipe does not transfer to Northport.

## Install

```bash
pip install -r requirements.txt
```

## Use

**Web app** — drag and drop, then download:

```bash
python -m portbill_extractor --serve          # http://127.0.0.1:5000
```

**Command line** — files or a whole folder:

```bash
python -m portbill_extractor Northport/ -o northport.xlsx
python -m portbill_extractor Northport/25694501.pdf -o one-bill.xlsx
```

**As a library:**

```python
from portbill_extractor import extract, write_workbook

docs = [extract(p) for p in Path("Northport").glob("*.pdf")]
write_workbook(docs, "northport.xlsx")
```

## Output workbook

| Sheet | Contents |
|---|---|
| **Fields** | One row per PDF: Bill No, Invoice Date, Due Date, A/C No, Bill To, Total, page counts |
| **Table 1 – Charges** | Every billable charge line from the service-detail pages |
| **Table 2 – Tariff** | Line items from the tariff layout (`50124633`-style bills) |
| **Summary** | The cover page's Reference / Location / Voyage / Amount list |
| **Validation** | Reconciles summary rows and line items against the printed total |

`Table 1 – Charges` columns:

```
Bill No | Invoice Date | Due Date | A/C No | Reference No | Location | Service Type |
Bill Of Lading No | Purchase Order No | SNO | Container No | Voyage | Size | Oper |
Status | Service Description | Description | Amount (RM) | Sub-Total (RM) | Source File | Page
```

## How it works

Northport bills are digitally generated, so every column sits at a fixed x
position. The extractor bands words into columns by their left edge rather than
guessing at a table structure:

1. **Classify each page** — summary, service detail, or tariff detail.
2. **Read that page's header** by vertical alignment. Reference No, Location,
   Bill Of Lading No and the service-type banner change on *every* detail page,
   so they are read per page and attached to that page's rows. This is the part
   AlgoDocs gets wrong: its "fill a single scalar into every row" step would
   stamp one reference across the whole document.
3. **Walk the charge table in SNO blocks.** Northport prints the container, voyage,
   size, operator and SNO once per block; later charges in the same block
   (`3 DAYS STORAGE` then `1 REMOVAL`) inherit them.
4. **Drop the block-total rows.** A block that bills 30.00 + 65.00 also prints
   95.00 underneath. Only rows carrying a SERVICE DESCRIPTION are charges.
5. **Reconcile** line items and summary rows against the printed total.

### Known quirks handled

- Sub-total cells are rendered ~0.7pt below their charge row, so lines are
  clustered by vertical midpoint with a tolerance rather than bucketed.
- The Bill Of Lading value is emitted out of order in the PDF text stream; it is
  matched to its label by y coordinate.
- `SIZE` and `OPER` share one x column, stacked on consecutive lines.

## Tests

```bash
python -m pytest tests/ -q
```

30 tests pinned to the six sample bills, covering totals, per-page reference
handling, block fill-down, block-total suppression and the tariff layout.

## Scope

Handles the two Northport layouts present in `Northport/`. Westports bills are a
different format and are not handled by this extractor.
