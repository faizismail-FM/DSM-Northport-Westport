"""Northport (Malaysia) Bhd bill parser.

Three page kinds appear in Northport bills and each is handled separately:

* SUMMARY        - the cover page(s): a Reference/Location/Voyage/Amount list
                   plus the document-level header (Bill No, Date, Due Date).
* DETAIL_SERVICE - one page per Reference No, carrying the charge table
                   (SNO / CONTAINERS-VOYAGE / SIZE-OPER / STATUS / DESCRIPTION /
                   SERVICE DESCRIPTION / AMOUNT / SUB-TOTAL).
* DETAIL_TARIFF  - the tariff layout (TARIFF DESCRIPTION / NO DAYS / TARIFF UNIT
                   / TARIFF CODE / RATE / AMOUNT / SUB-TOTAL) with a Ship
                   Name / Ship ID header instead of a container table.

Header fields such as Reference No and the service-type banner change on every
detail page, so they are read per page and attached to that page's rows. This
is what makes the AlgoDocs "fill a single scalar into every row" step wrong for
Northport, and it is why the parser is page-driven.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import pymupdf

from .geometry import Line, group_lines, page_words

# --- Detail (service) table column bands -------------------------------------
# Left edge of a word decides its column. Verified stable across every sampled
# service type (IMPORT FCL, VGM, MISCELLANEOUS, DEMURRAGE, REEFER MONITORING).
SNO_BAND = (20.0, 44.0)
CONTAINER_BAND = (44.0, 111.0)   # container on block line 1, voyage on line 2
SIZE_BAND = (111.0, 139.0)       # size on block line 1, operator on line 2
STATUS_BAND = (139.0, 165.0)
DESC_BAND = (165.0, 322.0)
SERVICE_BAND = (322.0, 430.0)
AMOUNT_BAND = (430.0, 500.0)
SUBTOTAL_BAND = (500.0, 600.0)

# --- Tariff table column bands ------------------------------------------------
T_DESC_BAND = (15.0, 200.0)
T_DAYS_BAND = (200.0, 245.0)
T_UNIT_BAND = (245.0, 300.0)
T_CODE_BAND = (300.0, 340.0)
T_RATE_BAND = (340.0, 390.0)
T_AMOUNT_BAND = (390.0, 470.0)
T_SUBTOTAL_BAND = (470.0, 600.0)

# --- Header key/value bands ---------------------------------------------------
DETAIL_LABEL_BAND = (140.0, 240.0)
DETAIL_VALUE_BAND = (240.0, 360.0)
TARIFF_LABEL_BAND = (175.0, 253.0)
TARIFF_VALUE_BAND = (260.0, 345.0)
SUMMARY_LABEL_BAND = (360.0, 420.0)
SUMMARY_VALUE_BAND = (420.0, 560.0)

MONEY = re.compile(r"^-?[\d,]+\.\d{2}$")


class PageKind(str, Enum):
    SUMMARY = "summary"
    DETAIL_SERVICE = "detail_service"
    DETAIL_TARIFF = "detail_tariff"
    UNKNOWN = "unknown"


def to_amount(text: str) -> float | None:
    text = text.strip()
    if not text or not MONEY.match(text):
        return None
    return float(text.replace(",", ""))


@dataclass
class ChargeRow:
    """One billable charge line from a service-detail page."""

    bill_no: str = ""
    invoice_date: str = ""
    due_date: str = ""
    account_no: str = ""
    reference_no: str = ""
    location: str = ""
    service_type: str = ""
    bill_of_lading_no: str = ""
    purchase_order_no: str = ""
    sno: str = ""
    container_no: str = ""
    voyage: str = ""
    size: str = ""
    operator: str = ""
    status: str = ""
    description: str = ""
    service_description: str = ""
    amount: float | None = None
    sub_total: float | None = None
    source_file: str = ""
    page: int = 0


@dataclass
class TariffRow:
    """One line from a tariff-layout page."""

    bill_no: str = ""
    invoice_date: str = ""
    due_date: str = ""
    account_no: str = ""
    reference_no: str = ""
    location: str = ""
    ship_name: str = ""
    ship_id_voyage: str = ""
    loa: str = ""
    grt: str = ""
    group_ref: str = ""
    tariff_description: str = ""
    tariff_code: str = ""
    no_days: str = ""
    tariff_unit: str = ""
    rate: float | None = None
    amount: float | None = None
    sub_total: float | None = None
    source_file: str = ""
    page: int = 0


@dataclass
class SummaryRow:
    bill_no: str = ""
    reference: str = ""
    location: str = ""
    voyage_no: str = ""
    amount: float | None = None
    source_file: str = ""
    page: int = 0


@dataclass
class DocumentFields:
    """The document-level scalars - the AlgoDocs 'Fields' panel."""

    source_file: str = ""
    layout: str = ""
    bill_no: str = ""
    invoice_date: str = ""
    due_date: str = ""
    account_no: str = ""
    bill_to: str = ""
    total_amount: float | None = None
    pages: int = 0
    detail_pages: int = 0
    line_items: int = 0


@dataclass
class Document:
    fields: DocumentFields = field(default_factory=DocumentFields)
    summary_rows: list[SummaryRow] = field(default_factory=list)
    charge_rows: list[ChargeRow] = field(default_factory=list)
    tariff_rows: list[TariffRow] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# -----------------------------------------------------------------------------
# page classification
# -----------------------------------------------------------------------------
def classify(lines: list[Line]) -> PageKind:
    text = "\n".join(line.text for line in lines).upper()
    if "CONTAINERS/" in text and "SUB-TOTAL" in text:
        return PageKind.DETAIL_SERVICE
    if "TARIFF" in text and "SUB-TOTAL" in text:
        return PageKind.DETAIL_TARIFF
    if "DUE DATE" in text or ("REFERENCE" in text and "AMOUNT (RM)" in text):
        return PageKind.SUMMARY
    return PageKind.UNKNOWN


def _labelled(lines: list[Line], label_band, value_band) -> dict[str, str]:
    """Read a stacked label/value header block into a dict.

    Values are matched to labels by vertical alignment, not by text-stream
    order - Northport emits the Bill Of Lading value out of order, and only the
    y coordinate is trustworthy.
    """
    out: dict[str, str] = {}
    for line in lines:
        label = line.cell(*label_band).rstrip(":").strip()
        if not label:
            continue
        value = line.cell(*value_band).lstrip(":").strip()
        key = re.sub(r"\s+", " ", label).lower()
        if key not in out or (value and not out[key]):
            out[key] = value
    return out


def _find_header_index(lines: list[Line], *needles: str) -> int | None:
    for i, line in enumerate(lines):
        upper = line.text.upper()
        if all(n in upper for n in needles):
            return i
    return None


def _service_type(lines: list[Line], header_index: int) -> str:
    """The service banner sits on the line below the customer name."""
    candidates: list[str] = []
    for line in lines[:header_index]:
        cell = line.cell(20.0, 300.0).strip()
        if not cell or line.top < 120:
            continue
        upper = cell.upper()
        if "SDN BHD" in upper or upper.startswith(("SIZE", "CONTAINERS")):
            continue
        candidates.append(cell)
    return candidates[-1] if candidates else ""


# -----------------------------------------------------------------------------
# summary page
# -----------------------------------------------------------------------------
def parse_summary(lines: list[Line], source: str, page_no: int) -> tuple[dict[str, str], list[SummaryRow], float | None]:
    header = _labelled(lines, SUMMARY_LABEL_BAND, SUMMARY_VALUE_BAND)
    bill_no = header.get("bill no", "")

    start = _find_header_index(lines, "REFERENCE", "AMOUNT")
    rows: list[SummaryRow] = []
    total: float | None = None
    if start is None:
        return header, rows, total

    for line in lines[start + 1:]:
        upper = line.text.upper()
        if upper.startswith("NOTES") or "COMPUTER GENERATED" in upper:
            break
        if "TOTAL (RM)" in upper:
            total = to_amount(line.cell(400.0, 560.0))
            break
        reference = line.cell(60.0, 150.0)
        if not reference:
            continue
        rows.append(
            SummaryRow(
                bill_no=bill_no,
                reference=reference,
                location=line.cell(150.0, 220.0),
                voyage_no=line.cell(220.0, 330.0),
                amount=to_amount(line.cell(400.0, 560.0)),
                source_file=source,
                page=page_no,
            )
        )
    return header, rows, total


# -----------------------------------------------------------------------------
# service-detail page
# -----------------------------------------------------------------------------
def parse_service_detail(lines: list[Line], source: str, page_no: int) -> list[ChargeRow]:
    header = _labelled(lines, DETAIL_LABEL_BAND, DETAIL_VALUE_BAND)
    start = _find_header_index(lines, "SNO", "DESCRIPTION", "SUB-TOTAL")
    if start is None:
        return []

    common = dict(
        bill_no=header.get("bill no", ""),
        invoice_date=header.get("date", ""),
        account_no=header.get("a/c no", ""),
        reference_no=header.get("reference no", ""),
        location=header.get("location", ""),
        bill_of_lading_no=header.get("bill of lading no", ""),
        purchase_order_no=header.get("purchase order no", ""),
        service_type=_service_type(lines, start),
        source_file=source,
        page=page_no,
    )

    rows: list[ChargeRow] = []
    block: list[ChargeRow] = []
    block_container: list[str] = []
    block_size: list[str] = []
    block_status = ""
    pending_desc: list[str] = []

    def close_block() -> None:
        """Apply the block's container/voyage/size/oper/SNO to all of its charges.

        Northport prints these once per SNO block, on its first one or two
        lines; a block's later charges (STORAGE then REMOVAL, EMC then WEIGH)
        leave the cells blank and inherit them.
        """
        container = block_container[0] if block_container else ""
        voyage = block_container[1] if len(block_container) > 1 else ""
        size = block_size[0] if block_size else ""
        operator = block_size[1] if len(block_size) > 1 else ""
        sno = next((r.sno for r in block if r.sno), "")
        for row in block:
            row.container_no = container
            row.voyage = voyage
            row.size = size
            row.operator = operator
            row.status = block_status
            row.sno = sno
        rows.extend(block)
        block.clear()
        block_container.clear()
        block_size.clear()

    for line in lines[start + 1:]:
        upper = line.text.upper()
        if "TOTAL PAYABLE" in upper or "COMPUTER GENERATED" in upper:
            break

        sno = line.cell(*SNO_BAND)
        container_cell = line.cell(*CONTAINER_BAND)
        size_cell = line.cell(*SIZE_BAND)
        status_cell = line.cell(*STATUS_BAND)
        desc = line.cell(*DESC_BAND)
        service = line.cell(*SERVICE_BAND)
        amount = to_amount(line.cell(*AMOUNT_BAND))
        subtotal = to_amount(line.cell(*SUBTOTAL_BAND))

        if sno:                       # a new SNO block begins
            close_block()
            block_status = status_cell
            pending_desc.clear()
        if container_cell:
            block_container.append(container_cell)
        if size_cell:
            block_size.append(size_cell)
        if status_cell and not block_status:
            block_status = status_cell

        if service:                   # a billable charge line
            row = ChargeRow(**common, sno=sno, service_description=service,
                            amount=amount, sub_total=subtotal)
            row.description = " ".join(filter(None, [*pending_desc, desc]))
            pending_desc.clear()
            block.append(row)
        elif desc:                    # continuation of the current charge
            if block:
                block[-1].description = " ".join(filter(None, [block[-1].description, desc]))
            else:
                pending_desc.append(desc)
        elif block and subtotal is not None and block[-1].sub_total is None:
            # SUB-TOTAL rendered a fraction of a point below its charge row.
            block[-1].sub_total = subtotal
        # rows that are amount-only with no description are the block total -
        # they duplicate the charges above and are dropped.

    close_block()
    return rows


# -----------------------------------------------------------------------------
# tariff-detail page
# -----------------------------------------------------------------------------
def parse_tariff_detail(lines: list[Line], source: str, page_no: int) -> list[TariffRow]:
    header = _labelled(lines, TARIFF_LABEL_BAND, TARIFF_VALUE_BAND)
    ship_name = ship_id = loa = grt = ""
    for line in lines:
        upper = line.text.upper()
        if "SHIP ID" in upper:
            ship_id = line.cell(125.0, 340.0)
            loa = line.cell(370.0, 440.0)
            grt = line.cell(475.0, 540.0)
        elif upper.startswith("SHIP NAME"):
            ship_name = line.cell(125.0, 340.0)

    start = _find_header_index(lines, "TARIFF", "SUB-TOTAL")
    if start is None:
        return []

    common = dict(
        bill_no=header.get("bill no", ""),
        invoice_date=header.get("date", ""),
        account_no=header.get("a/c no", ""),
        reference_no=header.get("reference no", ""),
        location=header.get("location", ""),
        ship_name=ship_name,
        ship_id_voyage=ship_id,
        loa=loa,
        grt=grt,
        source_file=source,
        page=page_no,
    )

    rows: list[TariffRow] = []
    group_ref = ""
    for line in lines[start + 1:]:
        upper = line.text.upper()
        if "AMOUNT PAYABLE" in upper or "COMPUTER GENERATED" in upper:
            break
        description = line.cell(*T_DESC_BAND)
        amount = to_amount(line.cell(*T_AMOUNT_BAND))
        code = line.cell(*T_CODE_BAND)
        if description and not code and amount is None:
            group_ref = description   # e.g. IID:A5401521@IN:...OUT:...
            continue
        if not description and amount is None:
            continue
        if not code:
            continue                  # the page total row
        rows.append(
            TariffRow(**common, group_ref=group_ref, tariff_description=description,
                      tariff_code=code, no_days=line.cell(*T_DAYS_BAND),
                      tariff_unit=line.cell(*T_UNIT_BAND),
                      rate=to_amount(line.cell(*T_RATE_BAND)), amount=amount,
                      sub_total=to_amount(line.cell(*T_SUBTOTAL_BAND)))
        )
    return rows


# -----------------------------------------------------------------------------
# document
# -----------------------------------------------------------------------------
def extract(path: str | Path) -> Document:
    path = Path(path)
    source = path.name
    doc = Document()
    doc.fields.source_file = source

    with pymupdf.open(path) as pdf:
        doc.fields.pages = len(pdf)
        summary_header: dict[str, str] = {}
        kinds: list[PageKind] = []
        for index, page in enumerate(pdf, start=1):
            lines = group_lines(page_words(page))
            kind = classify(lines)
            kinds.append(kind)
            if kind is PageKind.SUMMARY:
                header, rows, total = parse_summary(lines, source, index)
                summary_header = {**header, **{k: v for k, v in summary_header.items() if v}}
                doc.summary_rows.extend(rows)
                if total is not None:
                    doc.fields.total_amount = total
                if not doc.fields.bill_to:
                    doc.fields.bill_to = _bill_to(lines)
            elif kind is PageKind.DETAIL_SERVICE:
                doc.charge_rows.extend(parse_service_detail(lines, source, index))
            elif kind is PageKind.DETAIL_TARIFF:
                doc.tariff_rows.extend(parse_tariff_detail(lines, source, index))
            else:
                doc.warnings.append(f"{source} page {index}: layout not recognised")

    doc.fields.bill_no = summary_header.get("bill no", "") or _first(doc, "bill_no")
    doc.fields.invoice_date = summary_header.get("date", "") or _first(doc, "invoice_date")
    doc.fields.due_date = summary_header.get("due date", "")
    doc.fields.account_no = summary_header.get("a/c no", "") or _first(doc, "account_no")
    doc.fields.detail_pages = sum(
        1 for k in kinds if k in (PageKind.DETAIL_SERVICE, PageKind.DETAIL_TARIFF)
    )
    doc.fields.layout = "tariff" if doc.tariff_rows and not doc.charge_rows else "service detail"
    doc.fields.line_items = len(doc.charge_rows) + len(doc.tariff_rows)

    # The due date only ever appears on the summary page; push it onto the rows.
    for row in (*doc.charge_rows, *doc.tariff_rows):
        row.due_date = doc.fields.due_date
    return doc


def _first(doc: Document, attr: str) -> str:
    for row in (*doc.charge_rows, *doc.tariff_rows):
        value = getattr(row, attr, "")
        if value:
            return value
    return ""


def _bill_to(lines: list[Line]) -> str:
    """The customer block on the summary page, left of the header column."""
    parts = [line.cell(60.0, 340.0) for line in lines if 145 < line.top < 215]
    return " ".join(p for p in parts if p).strip()
