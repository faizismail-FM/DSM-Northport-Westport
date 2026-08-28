/* Table definitions - these drive the on-screen grid, the CSV and the workbook. */

export const FIELD_COLUMNS = [
  { key: 'source_file', label: 'Source File' },
  { key: 'issuer', label: 'Issuer' },
  { key: 'layout', label: 'Layout' },
  { key: 'invoice_no', label: 'Invoice / Bill No', mono: true },
  { key: 'invoice_date', label: 'Invoice Date', mono: true },
  { key: 'due_date', label: 'Due Date', mono: true },
  { key: 'terms', label: 'Terms' },
  { key: 'account_no', label: 'A/C No', mono: true },
  { key: 'sst_reg_no', label: 'SST Reg No', mono: true },
  { key: 'bill_to', label: 'Bill To', wide: true },
  { key: 'vessel', label: 'Vessel' },
  { key: 'voyage', label: 'Voyage', mono: true },
  { key: 'call_no', label: 'Call No', mono: true },
  { key: 'visit_id', label: 'Visit ID', mono: true },
  { key: 'ata', label: 'ATA', mono: true },
  { key: 'line', label: 'Line', mono: true },
  { key: 'remarks', label: 'Remarks', wide: true },
  { key: 'amount_excl_sst', label: 'Excluding SST (RM)', money: true },
  { key: 'sst_amount', label: 'SST (RM)', money: true },
  { key: 'total_amount', label: 'Total (RM)', money: true },
  { key: 'pages', label: 'Pages', numeric: true },
  { key: 'detail_pages', label: 'Detail Pages', numeric: true },
  { key: 'line_items', label: 'Line Items', numeric: true },
];

export const NP_CHARGE_COLUMNS = [
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

export const NP_TARIFF_COLUMNS = [
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

export const NP_SUMMARY_COLUMNS = [
  { key: 'bill_no', label: 'Bill No', mono: true },
  { key: 'reference', label: 'Reference', mono: true },
  { key: 'location', label: 'Location' },
  { key: 'voyage_no', label: 'Voyage No', mono: true },
  { key: 'amount', label: 'Amount (RM)', money: true },
  { key: 'source_file', label: 'Source File' },
  { key: 'page', label: 'Page', numeric: true },
];

export const WP_CHARGE_COLUMNS = [
  { key: 'invoice_no', label: 'Invoice No', mono: true },
  { key: 'invoice_date', label: 'Invoice Date', mono: true },
  { key: 'due_date', label: 'Due Date', mono: true },
  { key: 'vessel', label: 'Vessel' },
  { key: 'voyage', label: 'Voyage', mono: true },
  { key: 'call_no', label: 'Call No', mono: true },
  { key: 'visit_id', label: 'Visit ID', mono: true },
  { key: 'ata', label: 'ATA', mono: true },
  { key: 'sno', label: 'No', numeric: true },
  { key: 'container_no', label: 'Container No', mono: true },
  { key: 'type', label: 'Type', mono: true },
  { key: 'size', label: 'Size', mono: true },
  { key: 'operator', label: 'Oper', mono: true },
  { key: 'tariff_code', label: 'Tariff Code', mono: true },
  { key: 'charge_description', label: 'Charge Description' },
  { key: 'detail', label: 'Detail', wide: true },
  { key: 'sst_rate', label: 'SST Rate (%)', numeric: true },
  { key: 'quantity', label: 'Quantity', numeric: true },
  { key: 'rate', label: 'Rate', money: true },
  { key: 'amount', label: 'Amount (RM)', money: true },
  { key: 'source_file', label: 'Source File' },
  { key: 'page', label: 'Page', numeric: true },
];

export const WP_STORAGE_COLUMNS = [
  { key: 'invoice_no', label: 'Invoice No', mono: true },
  { key: 'invoice_date', label: 'Invoice Date', mono: true },
  { key: 'caption', label: 'Period', wide: true },
  { key: 'no', label: 'No', numeric: true },
  { key: 'vessel_id', label: 'Vessel ID', mono: true },
  { key: 'vessel_name', label: 'Vessel Name' },
  { key: 'voyage', label: 'Voyage', mono: true },
  { key: 'container_no', label: 'Container No', mono: true },
  { key: 'size', label: 'Size', mono: true },
  { key: 'status', label: 'St', mono: true },
  { key: 'dg', label: 'DG', mono: true },
  { key: 'in_datetime', label: 'IN Date', mono: true },
  { key: 'out_datetime', label: 'OUT Date', mono: true },
  { key: 'days', label: 'Days', numeric: true },
  { key: 'charged_days', label: 'Chgd Days', numeric: true },
  { key: 'amount', label: 'Total (RM)', money: true },
  { key: 'source_file', label: 'Source File' },
  { key: 'page', label: 'Page', numeric: true },
];

export const VALIDATION_COLUMNS = [
  { key: 'source_file', label: 'Source File' },
  { key: 'issuer', label: 'Issuer' },
  { key: 'invoice_no', label: 'Invoice / Bill No', mono: true },
  { key: 'check', label: 'Check' },
  { key: 'expected', label: 'Expected', money: true },
  { key: 'actual', label: 'Actual', money: true },
  { key: 'variance', label: 'Variance', money: true },
  { key: 'status', label: 'Status', pill: true },
  { key: 'note', label: 'Note', wide: true },
];

/**
 * Sheet order, used for both the tab strip and the workbook.
 * `tab` is the short label; `sheet` is the workbook sheet name.
 * `port` is which terminal the table belongs to - tables without one (Fields,
 * Validation) cover both and are filtered by row instead.
 */
export const TABLES = [
  { id: 'fields', tab: 'Fields', sheet: 'Fields', columns: FIELD_COLUMNS },
  { id: 'wp_charges', tab: 'Charges', sheet: 'Westports - Charges', port: 'Westports', columns: WP_CHARGE_COLUMNS },
  { id: 'wp_storage', tab: 'Storage', sheet: 'Westports - Storage', port: 'Westports', columns: WP_STORAGE_COLUMNS },
  { id: 'np_charges', tab: 'Charges', sheet: 'Northport - Charges', port: 'Northport', columns: NP_CHARGE_COLUMNS },
  { id: 'np_tariff', tab: 'Tariff', sheet: 'Northport - Tariff', port: 'Northport', columns: NP_TARIFF_COLUMNS },
  { id: 'np_summary', tab: 'Summary', sheet: 'Northport - Summary', port: 'Northport', columns: NP_SUMMARY_COLUMNS },
  { id: 'validation', tab: 'Validation', sheet: 'Validation', columns: VALIDATION_COLUMNS },
];

/**
 * The terminal the tool is set to. Chosen before uploading; only this
 * terminal's bills are shown and exported.
 */
export const PORTS = [
  { id: 'Westports', label: 'Westports' },
  { id: 'Northport', label: 'Northport' },
];

export const DEFAULT_PORT = 'Westports';
