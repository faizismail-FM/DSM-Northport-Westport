/* ---------------------------------------------------------------------------
   Northport (Malaysia) Bhd bill parser.

   Three page kinds appear:
     summary        - the cover page: Reference / Location / Voyage / Amount
     detail_service - one page per Reference No, carrying the charge table
     detail_tariff  - the tariff layout (Ship Name / TARIFF CODE / NO DAYS ...)

   Reference No, Location, Bill Of Lading No and the service-type banner change
   on EVERY detail page, so they are read per page and attached to that page's
   rows.
   --------------------------------------------------------------------------- */
import { cell, toAmount, findHeader, labelled } from './geometry.js';


// Charge table columns, by left edge of the text.
const NP_SNO = [20, 44];
const NP_CONTAINER = [44, 111];   // container on block line 1, voyage on line 2
const NP_SIZE = [111, 139];       // size on block line 1, operator on line 2
const NP_STATUS = [139, 165];
const NP_DESC = [165, 322];
const NP_SERVICE = [322, 430];
const NP_AMOUNT = [430, 500];
const NP_SUBTOTAL = [500, 600];

// Tariff table columns.
const NT_DESC = [15, 200];
const NT_DAYS = [200, 245];
const NT_UNIT = [245, 300];
const NT_CODE = [300, 340];
const NT_RATE = [340, 390];
const NT_AMOUNT = [390, 470];
const NT_SUBTOTAL = [470, 600];

// Header label/value blocks.
const NP_DETAIL_LABEL = [140, 240];
const NP_DETAIL_VALUE = [240, 360];
const NP_TARIFF_LABEL = [175, 253];
const NP_TARIFF_VALUE = [260, 345];
const NP_SUMMARY_LABEL = [360, 420];
const NP_SUMMARY_VALUE = [420, 560];

export const NP_SUMMARY_PAGE = 'summary';
export const NP_DETAIL_SERVICE = 'detail_service';
export const NP_DETAIL_TARIFF = 'detail_tariff';

export function classifyNorthportPage(lines) {
  const text = lines.map((l) => l.text).join('\n').toUpperCase();
  if (text.includes('CONTAINERS/') && text.includes('SUB-TOTAL')) return NP_DETAIL_SERVICE;
  if (text.includes('TARIFF') && text.includes('SUB-TOTAL')) return NP_DETAIL_TARIFF;
  if (text.includes('DUE DATE') || (text.includes('REFERENCE') && text.includes('AMOUNT (RM)'))) {
    return NP_SUMMARY_PAGE;
  }
  return '';
}

/** The service banner is the last left-margin line above the table header. */
function serviceType(lines, headerIndex) {
  const found = [];
  for (const line of lines.slice(0, headerIndex)) {
    const text = cell(line, [20, 300]).trim();
    if (!text) continue;
    if (!line.words.some((w) => w.x0 < 60)) continue;   // skip the label column
    const upper = text.toUpperCase();
    if (upper.includes('SDN BHD') || upper.startsWith('SIZE') || upper.startsWith('CONTAINERS')) continue;
    found.push(text);
  }
  return found.length ? found[found.length - 1] : '';
}

/* --- summary page --------------------------------------------------------- */

export function parseNorthportSummary(lines, source, pageNo) {
  const header = labelled(lines, NP_SUMMARY_LABEL, NP_SUMMARY_VALUE);
  const start = findHeader(lines, 'REFERENCE', 'AMOUNT');
  const rows = [];
  let total = null;
  const to = northportBillTo(lines);
  if (start < 0) return { header, rows, total, billTo: to };

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
  return { header, rows, total, billTo: to };
}

function northportBillTo(lines) {
  const first = lines.find((l) =>
    l.text.toUpperCase().includes('SDN BHD') && l.words.some((w) => w.x0 < 120));
  return first ? cell(first, [40, 340]) : '';
}

/* --- service detail page -------------------------------------------------- */

export function parseNorthportServiceDetail(lines, source, pageNo) {
  const header = labelled(lines, NP_DETAIL_LABEL, NP_DETAIL_VALUE);
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

    const sno = cell(line, NP_SNO);
    const containerCell = cell(line, NP_CONTAINER);
    const sizeCell = cell(line, NP_SIZE);
    const statusCell = cell(line, NP_STATUS);
    const desc = cell(line, NP_DESC);
    const service = cell(line, NP_SERVICE);
    const amount = toAmount(cell(line, NP_AMOUNT));
    const subTotal = toAmount(cell(line, NP_SUBTOTAL));

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

export function parseNorthportTariffDetail(lines, source, pageNo) {
  const header = labelled(lines, NP_TARIFF_LABEL, NP_TARIFF_VALUE);
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
    const description = cell(line, NT_DESC);
    const amount = toAmount(cell(line, NT_AMOUNT));
    const code = cell(line, NT_CODE);
    if (description && !code && amount === null) { groupRef = description; continue; }
    if (!description && amount === null) continue;
    if (!code) continue;   // the page total row
    rows.push({
      ...common, group_ref: groupRef, tariff_description: description, tariff_code: code,
      no_days: cell(line, NT_DAYS), tariff_unit: cell(line, NT_UNIT),
      rate: toAmount(cell(line, NT_RATE)), amount, sub_total: toAmount(cell(line, NT_SUBTOTAL)),
    });
  }
  return rows;
}
