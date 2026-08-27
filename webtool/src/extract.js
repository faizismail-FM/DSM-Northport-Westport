/* ---------------------------------------------------------------------------
   Issuer detection, routing and reconciliation.

   A dropped PDF can be from either terminal, so the issuer is detected from
   the page text and the document is handed to the matching parser. Both
   produce the same document shape so the grid, workbook and validation treat
   them alike.
   --------------------------------------------------------------------------- */
import { groupLines } from './geometry.js';
import {
  NP_SUMMARY_PAGE, NP_DETAIL_SERVICE, NP_DETAIL_TARIFF, classifyNorthportPage,
  parseNorthportSummary, parseNorthportServiceDetail, parseNorthportTariffDetail,
} from './northport.js';
import {
  WP_INVOICE_PAGE, WP_ANNEX_PAGE, classifyWestportsPage, parseWestportsHeader,
  parseWestportsInvoicePage, parseWestportsAnnexPage,
} from './westports.js';


export const NORTHPORT = 'Northport';
export const WESTPORTS = 'Westports';

export function detectIssuer(pages) {
  const text = pages
    .flatMap((p) => p.items.map((i) => i.text))
    .join(' ')
    .toUpperCase();
  if (text.includes('WESTPORTS MALAYSIA')) return WESTPORTS;
  if (text.includes('NORTHPORT (MALAYSIA)')) return NORTHPORT;
  return '';
}

function emptyDocument(source, pageCount) {
  return {
    fields: {
      source_file: source, issuer: '', layout: '', invoice_no: '', invoice_date: '',
      due_date: '', account_no: '', sst_reg_no: '', bill_to: '', vessel: '', voyage: '',
      call_no: '', visit_id: '', ata: '', line: '', terms: '', remarks: '',
      amount_excl_sst: null, sst_amount: null, total_amount: null,
      pages: pageCount, detail_pages: 0, line_items: 0,
    },
    np_charges: [], np_tariff: [], np_summary: [],
    wp_charges: [], wp_storage: [],
    warnings: [],
  };
}

/**
 * @param pages  [{ items: [{text, x0, x1, y}] }] in page order
 * @param source file name, kept on every row
 */
export function extractDocument(pages, source) {
  const doc = emptyDocument(source, pages.length);

  if (!pages.some((p) => p.items.some((i) => i.text.trim()))) {
    doc.warnings.push('No text found. This PDF looks like a scan — only text-based port bills can be read.');
    doc.fields.layout = 'unreadable';
    return doc;
  }

  const issuer = detectIssuer(pages);
  doc.fields.issuer = issuer;
  if (issuer === WESTPORTS) return extractWestportsDocument(pages, source, doc);
  if (issuer === NORTHPORT) return extractNorthportDocument(pages, source, doc);

  doc.warnings.push('Not a Northport or Westports bill — no matching layout.');
  doc.fields.layout = 'unrecognised';
  return doc;
}

/* --- Northport ------------------------------------------------------------ */

function extractNorthportDocument(pages, source, doc) {
  let summaryHeader = {};
  let detailPages = 0;

  pages.forEach((page, index) => {
    const pageNo = index + 1;
    const lines = groupLines(page.items);
    const kind = classifyNorthportPage(lines);

    if (kind === NP_SUMMARY_PAGE) {
      const { header, rows, total, billTo } = parseNorthportSummary(lines, source, pageNo);
      summaryHeader = { ...header, ...Object.fromEntries(Object.entries(summaryHeader).filter(([, v]) => v)) };
      doc.np_summary.push(...rows);
      if (total !== null) doc.fields.total_amount = total;
      if (!doc.fields.bill_to) doc.fields.bill_to = billTo;
    } else if (kind === NP_DETAIL_SERVICE) {
      doc.np_charges.push(...parseNorthportServiceDetail(lines, source, pageNo));
      detailPages++;
    } else if (kind === NP_DETAIL_TARIFF) {
      doc.np_tariff.push(...parseNorthportTariffDetail(lines, source, pageNo));
      detailPages++;
    } else {
      doc.warnings.push(`Page ${pageNo}: layout not recognised`);
    }
  });

  const firstOf = (attr) => {
    for (const row of [...doc.np_charges, ...doc.np_tariff]) if (row[attr]) return row[attr];
    return '';
  };
  const f = doc.fields;
  f.invoice_no = summaryHeader['bill no'] || firstOf('bill_no');
  f.invoice_date = summaryHeader['date'] || firstOf('invoice_date');
  f.due_date = summaryHeader['due date'] || '';
  f.account_no = summaryHeader['a/c no'] || firstOf('account_no');
  f.detail_pages = detailPages;
  f.layout = doc.np_tariff.length && !doc.np_charges.length ? 'tariff' : 'service detail';
  f.line_items = doc.np_charges.length + doc.np_tariff.length;

  // The due date is only printed on the cover page; push it onto every row.
  for (const row of [...doc.np_charges, ...doc.np_tariff]) row.due_date = f.due_date;
  return doc;
}

/* --- Westports ------------------------------------------------------------ */

function extractWestportsDocument(pages, source, doc) {
  let header = null;
  let invoicePages = 0;
  const pending = [];

  pages.forEach((page, index) => {
    const pageNo = index + 1;
    const lines = groupLines(page.items);
    const kind = classifyWestportsPage(lines);

    if (kind === WP_INVOICE_PAGE) {
      // Header fields repeat on every invoice page; the first one wins, but a
      // later page fills anything the first left blank.
      const pageHeader = parseWestportsHeader(lines);
      header = header ? mergeHeader(header, pageHeader) : pageHeader;
      pending.push({ lines, pageNo });
      invoicePages++;
    } else if (kind === WP_ANNEX_PAGE) {
      pending.push({ lines, pageNo, annex: true });
    } else {
      doc.warnings.push(`Page ${pageNo}: layout not recognised`);
    }
  });

  if (!header) {
    doc.warnings.push('No invoice page found.');
    doc.fields.layout = 'unrecognised';
    return doc;
  }

  for (const { lines, pageNo, annex } of pending) {
    if (annex) doc.wp_storage.push(...parseWestportsAnnexPage(lines, source, pageNo, header));
    else doc.wp_charges.push(...parseWestportsInvoicePage(lines, source, pageNo, header));
  }

  const f = doc.fields;
  Object.assign(f, {
    invoice_no: header.invoice_no,
    invoice_date: header.invoice_date,
    due_date: header.due_date,
    sst_reg_no: header.sst_reg_no,
    bill_to: header.bill_to,
    vessel: header.vessel,
    voyage: header.voyage,
    call_no: header.call_no,
    visit_id: header.visit_id,
    ata: header.ata,
    line: header.line,
    terms: header.terms,
    remarks: header.remarks,
    amount_excl_sst: header.amount_excl_sst,
    sst_amount: header.sst_amount,
    total_amount: header.total_amount,
    detail_pages: invoicePages,
    layout: doc.wp_storage.length ? 'invoice + storage annex' : 'invoice',
    line_items: doc.wp_charges.length,
  });
  return doc;
}

function mergeHeader(base, next) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (!merged[key] && value) merged[key] = value;
  }
  return merged;
}

/* --- reconciliation ------------------------------------------------------- */

const round = (n) => Math.round(n * 100) / 100;

/** Compare what we read against what the bill says it totals. */
export function validate(doc) {
  const f = doc.fields;
  const rows = [];
  const check = (name, expected, actual, note) => {
    if (expected === null || expected === undefined) return;
    const variance = round(actual - expected);
    rows.push({
      source_file: f.source_file, issuer: f.issuer, invoice_no: f.invoice_no,
      check: name, expected, actual: round(actual), variance,
      status: variance === 0 ? 'OK' : 'CHECK', note,
    });
  };

  if (f.issuer === NORTHPORT) {
    const lineTotal = [...doc.np_charges, ...doc.np_tariff].reduce((s, r) => s + (r.amount || 0), 0);
    const summaryTotal = doc.np_summary.reduce((s, r) => s + (r.amount || 0), 0);
    check('Summary rows vs Total (RM)', f.total_amount, summaryTotal,
          'Every reference on the cover page adds up to the printed total.');
    check('Line items vs Total (RM)', f.total_amount, lineTotal,
          'Detail pages missing from the PDF show up here as a shortfall.');
  } else if (f.issuer === WESTPORTS) {
    const lineTotal = doc.wp_charges.reduce((s, r) => s + (r.amount || 0), 0);
    check('Line items vs Amount Excluding SST', f.amount_excl_sst, lineTotal,
          'Every charge line adds up to the amount before SST.');
    if (f.amount_excl_sst !== null) {
      check('Excluding SST + SST vs Total Amount', f.total_amount,
            f.amount_excl_sst + (f.sst_amount || 0),
            'The printed total is the pre-SST amount plus the SST charged.');
    }
    if (doc.wp_storage.length) {
      const storageTotal = doc.wp_storage.reduce((s, r) => s + (r.amount || 0), 0);
      check('Storage annex vs Total Amount', f.total_amount, storageTotal,
            'The annex sheet lists the same storage the invoice bills.');
    }
  }

  for (const warning of doc.warnings) {
    rows.push({
      source_file: f.source_file, issuer: f.issuer, invoice_no: f.invoice_no,
      check: 'Page layout', expected: null, actual: null, variance: null,
      status: 'REVIEW', note: warning,
    });
  }
  return rows;
}
