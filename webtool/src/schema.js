/* Table definitions - these drive the on-screen grid, the CSV and the workbook. */

export const FIELD_COLUMNS = [
  { key: 'source_file', label: 'Source File' },
  { key: 'layout', label: 'Layout' },
  { key: 'bill_no', label: 'Bill No', mono: true },
  { key: 'invoice_date', label: 'Invoice Date', mono: true },
  { key: 'due_date', label: 'Due Date', mono: true },
  { key: 'account_no', label: 'A/C No', mono: true },
  { key: 'bill_to', label: 'Bill To' },
  { key: 'total_amount', label: 'Total (RM)', money: true },
  { key: 'pages', label: 'Pages', numeric: true },
  { key: 'detail_pages', label: 'Detail Pages', numeric: true },
  { key: 'line_items', label: 'Line Items', numeric: true },
];

export const CHARGE_COLUMNS = [
  { key: 'bill_no', label: 'Bill No', mono: true },
  { key: 'invoice_date', label: 'Invoice Date', mono: true },
  { key: 'due_date', label: 'Due Date', mono: true },
  { key: 'account_no', label: 'A/C No', mono: true },
  { key: 'reference_no', label: 'Reference No', mono: true },
  { key: 'location', label: 'Location' },
  { key: 'service_type', label: 'Service Type' },
  { key: 'bill_of_lading_no', label: 'Bill Of Lading No', mono: true },
  { key: 'purchase_order_no', label: 'Purchase Order No', mono: true },
  { key: 'sno', label: 'SNO', numeric: true },
  { key: 'container_no', label: 'Container No', mono: true },
  { key: 'voyage', label: 'Voyage', mono: true },
  { key: 'size', label: 'Size', mono: true },
  { key: 'operator', label: 'Oper', mono: true },
  { key: 'status', label: 'Status' },
  { key: 'service_description', label: 'Service Description' },
  { key: 'description', label: 'Description', wide: true },
  { key: 'amount', label: 'Amount (RM)', money: true },
  { key: 'sub_total', label: 'Sub-Total (RM)', money: true },
  { key: 'source_file', label: 'Source File' },
  { key: 'page', label: 'Page', numeric: true },
];

export const TARIFF_COLUMNS = [
  { key: 'bill_no', label: 'Bill No', mono: true },
  { key: 'invoice_date', label: 'Invoice Date', mono: true },
  { key: 'due_date', label: 'Due Date', mono: true },
  { key: 'account_no', label: 'A/C No', mono: true },
  { key: 'reference_no', label: 'Reference No', mono: true },
  { key: 'location', label: 'Location' },
  { key: 'ship_name', label: 'Ship Name' },
  { key: 'ship_id_voyage', label: 'Ship ID / Voyage No', mono: true },
  { key: 'loa', label: 'LOA', numeric: true },
  { key: 'grt', label: 'GRT', numeric: true },
  { key: 'group_ref', label: 'Group Ref', mono: true },
  { key: 'tariff_description', label: 'Tariff Description' },
  { key: 'tariff_code', label: 'Tariff Code', mono: true },
  { key: 'no_days', label: 'No Days', numeric: true },
  { key: 'tariff_unit', label: 'Tariff Unit', numeric: true },
  { key: 'rate', label: 'Rate', money: true },
  { key: 'amount', label: 'Amount (RM)', money: true },
  { key: 'sub_total', label: 'Sub-Total (RM)', money: true },
  { key: 'source_file', label: 'Source File' },
  { key: 'page', label: 'Page', numeric: true },
];

export const SUMMARY_COLUMNS = [
  { key: 'bill_no', label: 'Bill No', mono: true },
  { key: 'reference', label: 'Reference', mono: true },
  { key: 'location', label: 'Location' },
  { key: 'voyage_no', label: 'Voyage No', mono: true },
  { key: 'amount', label: 'Amount (RM)', money: true },
  { key: 'source_file', label: 'Source File' },
  { key: 'page', label: 'Page', numeric: true },
];

export const VALIDATION_COLUMNS = [
  { key: 'source_file', label: 'Source File' },
  { key: 'bill_no', label: 'Bill No', mono: true },
  { key: 'check', label: 'Check' },
  { key: 'expected', label: 'Expected', money: true },
  { key: 'actual', label: 'Actual', money: true },
  { key: 'variance', label: 'Variance', money: true },
  { key: 'status', label: 'Status', pill: true },
  { key: 'note', label: 'Note', wide: true },
];

/** Sheet order, used for both the tab strip and the workbook. */
export const TABLES = [
  { id: 'fields', name: 'Fields', sheet: 'Fields', columns: FIELD_COLUMNS },
  { id: 'charges', name: 'Charges', sheet: 'Table 1 - Charges', columns: CHARGE_COLUMNS },
  { id: 'tariff', name: 'Tariff', sheet: 'Table 2 - Tariff', columns: TARIFF_COLUMNS },
  { id: 'summary', name: 'Summary', sheet: 'Summary', columns: SUMMARY_COLUMNS },
  { id: 'validation', name: 'Validation', sheet: 'Validation', columns: VALIDATION_COLUMNS },
];
