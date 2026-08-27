"""Regression tests pinned to the six sample bills in Northport/."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from portbill_extractor.excel import build_workbook            # noqa: E402
from portbill_extractor.northport import extract, to_amount    # noqa: E402

SAMPLES = Path(__file__).resolve().parents[1] / "Northport"

# bill no, printed total, line-item count, sum of line amounts
EXPECTED = {
    "25678723.pdf": ("25678723", 420.00, 1, 420.00),
    "25694149b.pdf": ("25694149", 560.00, 8, 360.00),   # cover lists 19 refs, PDF holds 4 detail pages
    "25694501.pdf": ("25694501", 3892.00, 39, 3892.00),
    "25694711.pdf": ("25694711", 1426.00, 1, 1426.00),
    "50124633.pdf": ("50124633", 122.00, 3, 122.00),
    "71977468.pdf": ("71977468", 200.00, 4, 200.00),
}


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_document_fields_and_totals(name):
    bill_no, total, line_items, line_sum = EXPECTED[name]
    doc = extract(SAMPLES / name)

    assert doc.fields.bill_no == bill_no
    assert doc.fields.total_amount == pytest.approx(total)
    assert doc.fields.line_items == line_items
    assert not doc.warnings

    actual = sum(r.amount or 0 for r in doc.charge_rows)
    actual += sum(r.amount or 0 for r in doc.tariff_rows)
    assert actual == pytest.approx(line_sum)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_summary_rows_reconcile_to_printed_total(name):
    doc = extract(SAMPLES / name)
    assert sum(r.amount or 0 for r in doc.summary_rows) == pytest.approx(doc.fields.total_amount)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_every_row_carries_its_page_header_fields(name):
    """The per-page fields are what the AlgoDocs 'fill a scalar' step gets wrong."""
    doc = extract(SAMPLES / name)
    for row in (*doc.charge_rows, *doc.tariff_rows):
        assert row.bill_no and row.reference_no and row.invoice_date
        assert row.source_file == name
        assert row.amount is not None


def test_reference_no_varies_across_detail_pages():
    doc = extract(SAMPLES / "25694501.pdf")
    references = {r.reference_no for r in doc.charge_rows}
    assert len(references) == 12, "each detail page must keep its own Reference No"


def test_block_fields_fill_down_to_later_charges():
    """STORAGE then REMOVAL share one container block; both must be complete."""
    doc = extract(SAMPLES / "25694501.pdf")
    first = [r for r in doc.charge_rows if r.reference_no == "CF2500638243"]
    assert len(first) == 2
    assert {r.service_description for r in first} == {"2 DAYS STORAGE", "1 REMOVAL"}
    for row in first:
        assert row.container_no == "FYCU7235098"
        assert row.voyage == "24B0CA"
        assert row.size == "286GP"
        assert row.operator == "UNL"
        assert row.sno == "1"


def test_block_total_rows_are_not_billed_twice():
    """95.00 is printed as a block total under 30.00 + 65.00 - it must not appear."""
    doc = extract(SAMPLES / "25694501.pdf")
    first = [r for r in doc.charge_rows if r.reference_no == "CF2500638243"]
    assert sum(r.amount for r in first) == pytest.approx(95.00)


def test_multiple_snos_on_one_page_are_separate_rows():
    doc = extract(SAMPLES / "71977468.pdf")
    assert [r.sno for r in doc.charge_rows] == ["1", "2", "3", "4"]
    assert len({r.container_no for r in doc.charge_rows}) == 4


def test_service_type_is_read_per_page():
    doc = extract(SAMPLES / "25694149b.pdf")
    assert {r.service_type for r in doc.charge_rows} == {"VERIFIED GROSS MASS (VGM)"}
    assert extract(SAMPLES / "71977468.pdf").charge_rows[0].service_type == "DEMURRAGE CHARGES"


def test_tariff_layout_routes_to_its_own_table():
    doc = extract(SAMPLES / "50124633.pdf")
    assert doc.fields.layout == "tariff"
    assert not doc.charge_rows
    codes = [r.tariff_code for r in doc.tariff_rows]
    assert codes == ["14006", "52110", "63602"]
    assert all(r.group_ref.startswith("IID:A5401521") for r in doc.tariff_rows)


def test_workbook_has_the_expected_sheets():
    docs = [extract(SAMPLES / name) for name in sorted(EXPECTED)]
    wb = build_workbook(docs)
    assert wb.sheetnames == [
        "Fields", "Table 1 - Charges", "Table 2 - Tariff", "Summary", "Validation"
    ]
    assert wb["Table 1 - Charges"].max_row - 1 == sum(len(d.charge_rows) for d in docs)


@pytest.mark.parametrize("text,expected", [
    ("1,426.00", 1426.00), ("5.00", 5.00), ("", None), ("NA", None), ("24B2PD", None),
])
def test_to_amount(text, expected):
    assert to_amount(text) == expected
