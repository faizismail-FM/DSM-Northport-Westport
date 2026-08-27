/* ---------------------------------------------------------------------------
   Northport bill parser.

   Northport invoices are digitally generated, so every column sits at a fixed
   horizontal position on the page. Rather than guess at a table structure we
   band each piece of text into a column by its left edge, and cluster text into
   visual lines by vertical position.

   Three page kinds appear:
     summary        - the cover page: Reference / Location / Voyage / Amount
     detail_service - one page per Reference No, carrying the charge table
     detail_tariff  - the tariff layout (Ship Name / TARIFF CODE / NO DAYS ...)

   Reference No, Location, Bill Of Lading No and the service-type banner change
   on EVERY detail page, so they are read per page and attached to that page's
   rows.
   --------------------------------------------------------------------------- */

// Two pieces of text on one visual line can differ in y by a fraction of a
// point - Northport draws the SUB-TOTAL cell ~0.8pt off its charge row.
export const LINE_TOLERANCE = 3.0;

// Charge table columns, by left edge of the text.
const SNO        = [20, 44];
const CONTAINER  = [44, 111];   // container on block line 1, voyage on line 2
const SIZE       = [111, 139];  // size on block line 1, operator on line 2
const STATUS     = [139, 165];
const DESC       = [165, 322];
const SERVICE    = [322, 430];
const AMOUNT     = [430, 500];
const SUBTOTAL   = [500, 600];

// Tariff table columns.
const T_DESC     = [15, 200];
const T_DAYS     = [200, 245];
const T_UNIT     = [245, 300];
const T_CODE     = [300, 340];
const T_RATE     = [340, 390];
const T_AMOUNT   = [390, 470];
const T_SUBTOTAL = [470, 600];

// Header label/value blocks.
const DETAIL_LABEL  = [140, 240];
const DETAIL_VALUE  = [240, 360];
const TARIFF_LABEL  = [175, 253];
const TARIFF_VALUE  = [260, 345];
const SUMMARY_LABEL = [360, 420];
const SUMMARY_VALUE = [420, 560];

const MONEY = /^-?[\d,]+\.\d{2}$/;

export function toAmount(text) {
  const t = (text || '').trim();
  return MONEY.test(t) ? parseFloat(t.replace(/,/g, '')) : null;
}

/* --- lines and cells ------------------------------------------------------ */

/** Cluster page items into visual lines, top to bottom. */
export function groupLines(items, tolerance = LINE_TOLERANCE) {
  const words = items
    .filter((it) => it.text.trim())
    .map((it) => ({ ...it, text: it.text.trim() }))
    .sort((a, b) => a.y - b.y || a.x0 - b.x0);

  const lines = [];
  let anchor = null;
  for (const word of words) {
    if (anchor === null || word.y - anchor > tolerance) {
      anchor = word.y;
      lines.push({ y: word.y, words: [] });
    }
    lines[lines.length - 1].words.push(word);
  }
  for (const line of lines) {
    line.words.sort((a, b) => a.x0 - b.x0);
    line.text = join(line.words);
  }
  return lines;
}

/** Join words, closing up fragments that touch - "95" "." "00" is one number. */
function join(words) {
  let out = '';
  let prev = null;
  for (const word of words) {
    if (prev && word.x0 - prev.x1 > 1.0) out += ' ';
    out += word.text;
    prev = word;
  }
  return out.trim();
}

/** Text of the words whose left edge falls inside a column band. */
export function cell(line, band) {
  return join(line.words.filter((w) => w.x0 >= band[0] && w.x0 < band[1]));
}

/* --- page classification -------------------------------------------------- */

export const SUMMARY = 'summary';
export const DETAIL_SERVICE = 'detail_service';
export const DETAIL_TARIFF = 'detail_tariff';
export const UNKNOWN = 'unknown';

export function classify(lines) {
  const text = lines.map((l) => l.text).join('\n').toUpperCase();
  if (text.includes('CONTAINERS/') && text.includes('SUB-TOTAL')) return DETAIL_SERVICE;
  if (text.includes('TARIFF') && text.includes('SUB-TOTAL')) return DETAIL_TARIFF;
  if (text.includes('DUE DATE') || (text.includes('REFERENCE') && text.includes('AMOUNT (RM)'))) return SUMMARY;
  return UNKNOWN;
}

/** Read a stacked label/value header block, matching by vertical alignment. */
function labelled(lines, labelBand, valueBand) {
  const out = {};
  for (const line of lines) {
    const label = cell(line, labelBand).replace(/:\s*$/, '').trim();
    if (!label) continue;
    const value = cell(line, valueBand).replace(/^:\s*/, '').trim();
    const key = label.replace(/\s+/g, ' ').toLowerCase();
    if (!(key in out) || (value && !out[key])) out[key] = value;
  }
  return out;
}

function findHeader(lines, ...needles) {
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase();
    if (needles.every((n) => upper.includes(n))) return i;
  }
  return -1;
}

/** The service banner is the last left-margin line above the table header. */
function serviceType(lines, headerIndex) {
  const found = [];
  for (const line of lines.slice(0, headerIndex)) {
    const text = cell(line, [20, 300]).trim();
    if (!text) continue;
    if (!line.words.some((w) => w.x0 < 60)) continue;  // skip the label column
    const upper = text.toUpperCase();
    if (upper.includes('SDN BHD') || upper.startsWith('SIZE') || upper.startsWith('CONTAINERS')) continue;
    found.push(text);
  }
  return found.length ? found[found.length - 1] : '';
}

/* --- summary page --------------------------------------------------------- */

export function parseSummary(lines, source, pageNo) {
  const header = labelled(lines, SUMMARY_LABEL, SUMMARY_VALUE);
  const start = findHeader(lines, 'REFERENCE', 'AMOUNT');
  const rows = [];
  let total = null;
  if (start < 0) return { header, rows, total, billTo: billTo(lines) };

  for (const line of lines.slice(start + 1)) {
    const upper = line.text.toUpperCase();
    if (upper.startsWith('NOTES') || upper.includes('COMPUTER GENERATED')) break;
    if (upper.includes('TOTAL (RM)')) { total = toAmount(cell(line, [400, 560])); break; }
    const reference = cell(line, [60, 150]);
    if (!reference) continue;
    rows.push({
      bill_no: header['bill no'] || '',
      reference,
      location: cell(line, [150, 220]),
      voyage_no: cell(line, [220, 330]),
      amount: toAmount(cell(line, [400, 560])),
      source_file: source,
      page: pageNo,
    });
  }
  return { header, rows, total, billTo: billTo(lines) };
}

function billTo(lines) {
  const first = lines.find((l) => l.text.toUpperCase().includes('SDN BHD') && l.words.some((w) => w.x0 < 120));
  return first ? cell(first, [40, 340]) : '';
}

/* --- service detail page -------------------------------------------------- */

export function parseServiceDetail(lines, source, pageNo) {
  const header = labelled(lines, DETAIL_LABEL, DETAIL_VALUE);
  const start = findHeader(lines, 'SNO', 'DESCRIPTION', 'SUB-TOTAL');
  if (start < 0) return [];

  const common = {
    bill_no: header['bill no'] || '',
    invoice_date: header['date'] || '',
    due_date: '',
    account_no: header['a/c no'] || '',
    reference_no: header['reference no'] || '',
    location: header['location'] || '',
    service_type: serviceType(lines, start),
    bill_of_lading_no: header['bill of lading no'] || '',
    purchase_order_no: header['purchase order no'] || '',
    source_file: source,
    page: pageNo,
  };

  const rows = [];
  let block = [];
  let containers = [];
  let sizes = [];
  let blockStatus = '';
  let pendingDesc = [];

  // Northport prints container, voyage, size, operator and SNO once per block;
  // later charges in the same block inherit them.
  const closeBlock = () => {
    const sno = (block.find((r) => r.sno) || {}).sno || '';
    for (const row of block) {
      row.container_no = containers[0] || '';
      row.voyage = containers[1] || '';
      row.size = sizes[0] || '';
      row.operator = sizes[1] || '';
      row.status = blockStatus;
      row.sno = sno;
      rows.push(row);
    }
    block = []; containers = []; sizes = [];
  };

  for (const line of lines.slice(start + 1)) {
    const upper = line.text.toUpperCase();
    if (upper.includes('TOTAL PAYABLE') || upper.includes('COMPUTER GENERATED')) break;

    const sno = cell(line, SNO);
    const containerCell = cell(line, CONTAINER);
    const sizeCell = cell(line, SIZE);
    const statusCell = cell(line, STATUS);
    const desc = cell(line, DESC);
    const service = cell(line, SERVICE);
    const amount = toAmount(cell(line, AMOUNT));
    const subTotal = toAmount(cell(line, SUBTOTAL));

    if (sno) { closeBlock(); blockStatus = statusCell; pendingDesc = []; }
    if (containerCell) containers.push(containerCell);
    if (sizeCell) sizes.push(sizeCell);
    if (statusCell && !blockStatus) blockStatus = statusCell;

    if (service) {
      block.push({
        ...common, sno,
        service_description: service,
        description: [...pendingDesc, desc].filter(Boolean).join(' '),
        amount, sub_total: subTotal,
      });
      pendingDesc = [];
    } else if (desc) {
      if (block.length) {
        const last = block[block.length - 1];
        last.description = [last.description, desc].filter(Boolean).join(' ');
      } else pendingDesc.push(desc);
    } else if (block.length && subTotal !== null && block[block.length - 1].sub_total === null) {
      // The SUB-TOTAL cell is drawn a fraction of a point off its charge row.
      block[block.length - 1].sub_total = subTotal;
    }
    // Amount-only rows with no service description are the block total. They
    // repeat the charges above, so they are dropped.
  }
  closeBlock();
  return rows;
}

/* --- tariff detail page --------------------------------------------------- */

export function parseTariffDetail(lines, source, pageNo) {
  const header = labelled(lines, TARIFF_LABEL, TARIFF_VALUE);
  let shipName = '', shipId = '', loa = '', grt = '';
  for (const line of lines) {
    const upper = line.text.toUpperCase();
    if (upper.includes('SHIP ID')) {
      shipId = cell(line, [125, 340]); loa = cell(line, [370, 440]); grt = cell(line, [475, 540]);
    } else if (upper.startsWith('SHIP NAME')) {
      shipName = cell(line, [125, 340]);
    }
  }

  const start = findHeader(lines, 'TARIFF', 'SUB-TOTAL');
  if (start < 0) return [];

  const common = {
    bill_no: header['bill no'] || '',
    invoice_date: header['date'] || '',
    due_date: '',
    account_no: header['a/c no'] || '',
    reference_no: header['reference no'] || '',
    location: header['location'] || '',
    ship_name: shipName, ship_id_voyage: shipId, loa, grt,
    source_file: source, page: pageNo,
  };

  const rows = [];
  let groupRef = '';
  for (const line of lines.slice(start + 1)) {
    const upper = line.text.toUpperCase();
    if (upper.includes('AMOUNT PAYABLE') || upper.includes('COMPUTER GENERATED')) break;
    const description = cell(line, T_DESC);
    const amount = toAmount(cell(line, T_AMOUNT));
    const code = cell(line, T_CODE);
    if (description && !code && amount === null) { groupRef = description; continue; }
    if (!description && amount === null) continue;
    if (!code) continue;   // the page total row
    rows.push({
      ...common, group_ref: groupRef, tariff_description: description, tariff_code: code,
      no_days: cell(line, T_DAYS), tariff_unit: cell(line, T_UNIT),
      rate: toAmount(cell(line, T_RATE)), amount, sub_total: toAmount(cell(line, T_SUBTOTAL)),
    });
  }
  return rows;
}

/* --- whole document ------------------------------------------------------- */

/**
 * @param pages  [{ items: [{text, x0, x1, y}] }] in page order
 * @param source file name, kept on every row
 */
export function extractDocument(pages, source) {
  const doc = {
    fields: {
      source_file: source, layout: '', bill_no: '', invoice_date: '', due_date: '',
      account_no: '', bill_to: '', total_amount: null,
      pages: pages.length, detail_pages: 0, line_items: 0,
    },
    summary_rows: [], charge_rows: [], tariff_rows: [], warnings: [],
  };

  let summaryHeader = {};
  let detailPages = 0;
  let anyText = false;

  pages.forEach((page, index) => {
    const pageNo = index + 1;
    if (page.items.some((i) => i.text.trim())) anyText = true;
    const lines = groupLines(page.items);
    const kind = classify(lines);

    if (kind === SUMMARY) {
      const { header, rows, total, billTo: to } = parseSummary(lines, source, pageNo);
      summaryHeader = { ...header, ...Object.fromEntries(Object.entries(summaryHeader).filter(([, v]) => v)) };
      doc.summary_rows.push(...rows);
      if (total !== null) doc.fields.total_amount = total;
      if (!doc.fields.bill_to) doc.fields.bill_to = to;
    } else if (kind === DETAIL_SERVICE) {
      doc.charge_rows.push(...parseServiceDetail(lines, source, pageNo));
      detailPages++;
    } else if (kind === DETAIL_TARIFF) {
      doc.tariff_rows.push(...parseTariffDetail(lines, source, pageNo));
      detailPages++;
    } else {
      doc.warnings.push(`Page ${pageNo}: layout not recognised`);
    }
  });

  if (!anyText) {
    doc.warnings = ['No text found. This PDF looks like a scan - only text-based Northport bills can be read.'];
  }

  const firstOf = (attr) => {
    for (const row of [...doc.charge_rows, ...doc.tariff_rows]) if (row[attr]) return row[attr];
    return '';
  };
  doc.fields.bill_no = summaryHeader['bill no'] || firstOf('bill_no');
  doc.fields.invoice_date = summaryHeader['date'] || firstOf('invoice_date');
  doc.fields.due_date = summaryHeader['due date'] || '';
  doc.fields.account_no = summaryHeader['a/c no'] || firstOf('account_no');
  doc.fields.detail_pages = detailPages;
  doc.fields.layout = doc.tariff_rows.length && !doc.charge_rows.length ? 'tariff' : 'service detail';
  doc.fields.line_items = doc.charge_rows.length + doc.tariff_rows.length;

  // The due date is only printed on the cover page; push it onto every row.
  for (const row of [...doc.charge_rows, ...doc.tariff_rows]) row.due_date = doc.fields.due_date;
  return doc;
}

/** Reconcile what we read against what the bill says it totals. */
export function validate(doc) {
  const lineTotal = [...doc.charge_rows, ...doc.tariff_rows].reduce((s, r) => s + (r.amount || 0), 0);
  const summaryTotal = doc.summary_rows.reduce((s, r) => s + (r.amount || 0), 0);
  const printed = doc.fields.total_amount;
  const check = (name, actual, note) => {
    const variance = printed === null ? null : round(actual - printed);
    return {
      source_file: doc.fields.source_file, bill_no: doc.fields.bill_no, check: name,
      expected: printed, actual: round(actual), variance,
      status: variance === 0 ? 'OK' : 'CHECK', note,
    };
  };
  const rows = [
    check('Summary rows vs Total (RM)', summaryTotal,
          'Every reference on the cover page adds up to the printed total.'),
    check('Line items vs Total (RM)', lineTotal,
          'Detail pages missing from the PDF show up here as a shortfall.'),
  ];
  for (const warning of doc.warnings) {
    rows.push({
      source_file: doc.fields.source_file, bill_no: doc.fields.bill_no, check: 'Page layout',
      expected: null, actual: null, variance: null, status: 'REVIEW', note: warning,
    });
  }
  return rows;
}

const round = (n) => Math.round(n * 100) / 100;
