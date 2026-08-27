/* ---------------------------------------------------------------------------
   Westports Malaysia Sdn Bhd bill parser.

   One invoice per document, unlike Northport - the vessel, voyage and call
   number are document-level and printed once, repeated on each page. The
   charge table is grouped by container: a bare container line stands as a
   header above the charges billed against it, exactly the shape the AlgoDocs
   recipe handled with "copy rows until the next occurrence".

   Some invoices carry an annex page - a storage detail sheet with per-container
   in/out timestamps that the invoice page itself does not show.
   --------------------------------------------------------------------------- */
import { cell, toAmount, findHeader, labelled, CONTAINER_RE } from './geometry.js';


// Invoice charge table, by left edge of the text.
const WP_SNO = [15, 45];
const WP_DESC = [45, 300];
const WP_SST = [300, 360];
const WP_QTY = [360, 430];
const WP_RATE = [430, 500];
const WP_AMOUNT = [500, 600];

// The right-hand header block (Vessel / Voyage / Call No / ATA / Line / Terms).
const WP_LABEL = [295, 410];
const WP_VALUE = [410, 600];

// The top-right block (invoice number and date).
const WP_TOP_LABEL = [455, 515];
const WP_TOP_VALUE = [515, 600];

// Totals at the foot of every page.
const WP_TOTAL_LABEL = [290, 440];
const WP_TOTAL_VALUE = [500, 600];

// Annex page - the storage detail sheet.
const AX_NO = [10, 30];
const AX_VSL_ID = [30, 60];
const AX_VSL_NAME = [60, 135];
const AX_VOYAGE = [135, 175];
const AX_CONTAINER = [175, 245];
const AX_SIZE = [245, 262];
const AX_STATUS = [262, 275];
const AX_DG = [275, 292];
const AX_IN = [292, 388];
const AX_OUT = [388, 485];
const AX_DAYS = [485, 515];
const AX_CHARGED = [515, 545];
const AX_TOTAL = [545, 600];

const TARIFF_RE = /^(G\d{5})\s+(.*)$/;

/** Split "FBIU5554359-RE- 40-IAL" into its parts. */
export function splitContainer(text) {
  const match = CONTAINER_RE.exec(text);
  if (!match) return null;
  const rest = text.slice(match[1].length).replace(/^-/, '');
  const parts = rest.split('-').map((p) => p.trim()).filter(Boolean);
  return {
    container_no: match[1],
    type: parts[0] || '',
    size: parts[1] || '',
    operator: parts[2] || '',
  };
}

/** Is this line a container header rather than a charge or a continuation? */
function isContainerHeader(description, amount) {
  return amount === null && CONTAINER_RE.test(description);
}

export function parseWestportsInvoicePage(lines, source, pageNo, header) {
  const start = findHeader(lines, 'DESCRIPTION', 'QUANTITY', 'AMOUNT');
  if (start < 0) return [];

  const rows = [];
  let group = { container_no: '', type: '', size: '', operator: '' };

  for (const line of lines.slice(start + 1)) {
    const upper = line.text.toUpperCase();
    if (upper.startsWith('REMARKS') || upper.includes('MAKE ALL CHEQUE')) break;

    const sno = cell(line, WP_SNO);
    const description = cell(line, WP_DESC);
    const amount = toAmount(cell(line, WP_AMOUNT));

    if (isContainerHeader(description, amount)) {
      group = splitContainer(description);
      continue;
    }
    if (amount === null) {
      // A wrapped description or a detail line such as
      // "Shipper: 0 kg Terminal: 26,650 kg Variance: 0.00 %".
      if (description && rows.length) {
        const last = rows[rows.length - 1];
        last.detail = [last.detail, description].filter(Boolean).join(' ');
      }
      continue;
    }

    const tariff = TARIFF_RE.exec(description);
    rows.push({
      invoice_no: header.invoice_no,
      invoice_date: header.invoice_date,
      due_date: header.due_date,
      vessel: header.vessel,
      voyage: header.voyage,
      call_no: header.call_no,
      visit_id: header.visit_id,
      ata: header.ata,
      ...group,
      sno,
      tariff_code: tariff ? tariff[1] : '',
      charge_description: tariff ? tariff[2] : description,
      detail: '',
      sst_rate: cell(line, WP_SST),
      quantity: toAmount(cell(line, WP_QTY)) ?? cell(line, WP_QTY),
      rate: toAmount(cell(line, WP_RATE)),
      amount,
      source_file: source,
      page: pageNo,
    });
  }
  return rows;
}

/** The annex: one row per container, with in/out timestamps and charged days. */
export function parseWestportsAnnexPage(lines, source, pageNo, header) {
  const start = findHeader(lines, 'CONTAINER', 'VOYAGE', 'DAYS');
  if (start < 0) return [];

  // The line above the table describes what the annex covers.
  let caption = '';
  for (const line of lines.slice(0, start)) {
    const text = cell(line, [10, 300]);
    if (/between period/i.test(text)) caption = text.replace(/\s*\.\s*$/, '');
  }

  const rows = [];
  for (const line of lines.slice(start + 1)) {
    const upper = line.text.toUpperCase();
    if (upper.startsWith('PAGE ')) break;
    const container = cell(line, AX_CONTAINER);
    if (!CONTAINER_RE.test(container)) continue;   // skips the Total row
    rows.push({
      invoice_no: header.invoice_no,
      invoice_date: header.invoice_date,
      caption,
      no: cell(line, AX_NO),
      vessel_id: cell(line, AX_VSL_ID),
      vessel_name: cell(line, AX_VSL_NAME),
      voyage: cell(line, AX_VOYAGE),
      container_no: container,
      size: cell(line, AX_SIZE),
      status: cell(line, AX_STATUS),
      dg: cell(line, AX_DG),
      in_datetime: cell(line, AX_IN),
      out_datetime: cell(line, AX_OUT),
      days: cell(line, AX_DAYS),
      charged_days: cell(line, AX_CHARGED),
      amount: toAmount(cell(line, AX_TOTAL)),
      source_file: source,
      page: pageNo,
    });
  }
  return rows;
}

/** Header fields, read from any invoice page - they repeat on every page. */
export function parseWestportsHeader(lines) {
  const right = labelled(lines, WP_LABEL, WP_VALUE);
  const top = labelled(lines, WP_TOP_LABEL, WP_TOP_VALUE);
  const totals = labelled(lines, WP_TOTAL_LABEL, WP_TOTAL_VALUE);

  // The left column carries SST Reg No / LHDN Validation / Unique ID as
  // "label : value" on one run of text.
  const leftValue = (label) => {
    for (const line of lines) {
      const text = cell(line, [10, 300]);
      const match = new RegExp(`^${label}\\s*:\\s*(\\S+)`, 'i').exec(text);
      if (match) return match[1];
    }
    return '';
  };

  const billTo = [];
  for (const line of lines) {
    if (line.y > 300) break;
    const text = cell(line, [20, 200]);
    if (text && line.y > 205 && !/^company$/i.test(text)) billTo.push(text);
  }

  let remarks = '';
  const remarksIndex = findHeader(lines, 'REMARKS');
  if (remarksIndex >= 0) {
    const parts = [];
    for (const line of lines.slice(remarksIndex + 1)) {
      if (/MAKE ALL CHEQUE/i.test(line.text)) break;
      const text = cell(line, [10, 290]);
      if (text) parts.push(text);
    }
    remarks = parts.join(' ');
  }

  // Some invoices print the call number inside the voyage, as "0101W (24B1MF)",
  // instead of on its own Call No line.
  let voyage = right['voyage'] || '';
  let callNo = right['call no'] || '';
  const inlineCall = /^(\S+)\s*\(([A-Z0-9]+)\)$/.exec(voyage);
  if (inlineCall) {
    voyage = inlineCall[1];
    if (!callNo) callNo = inlineCall[2];
  }

  return {
    invoice_no: top['no'] || '',
    invoice_date: top['date'] || '',
    due_date: right['due date'] || '',
    terms: right['terms'] || '',
    visit_id: right['visit id'] || '',
    vessel: right['vessel'] || '',
    voyage,
    call_no: callNo,
    ata: right['ata'] || '',
    line: right['line'] || '',
    sst_reg_no: leftValue('SST Reg No'),
    bill_to: billTo.join(' '),
    remarks,
    amount_excl_sst: toAmount(totals['amount excluding sst (rm)'] || ''),
    sst_amount: toAmount(totals['add total sst amount (rm)'] || ''),
    total_amount: toAmount(totals['total amount (rm)'] || ''),
  };
}

export const WP_INVOICE_PAGE = 'wp_invoice';
export const WP_ANNEX_PAGE = 'wp_annex';

export function classifyWestportsPage(lines) {
  const text = lines.map((l) => l.text).join('\n').toUpperCase();
  if (text.includes('DESCRIPTION') && text.includes('QUANTITY') && text.includes('AMOUNT')) {
    return WP_INVOICE_PAGE;
  }
  if (text.includes('CONTAINER ID') || (text.includes('CHGD') && text.includes('VOYAGE'))) {
    return WP_ANNEX_PAGE;
  }
  return '';
}
