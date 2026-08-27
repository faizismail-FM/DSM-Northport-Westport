/* Regression tests for the browser parser, pinned to the six sample bills.
   Run with:  node --test webtool/test/    (needs pdfjs-dist installed) */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');
const SAMPLES = path.join(REPO, 'Northport');

const SRC = path.join(HERE, '..', 'src');
const { extractDocument, validate, detectIssuer } = await import(path.join(SRC, 'extract.js'));
const { toAmount, groupLines, cell } = await import(path.join(SRC, 'geometry.js'));
const { splitContainer } = await import(path.join(SRC, 'westports.js'));

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

async function read(name, dir = SAMPLES) {
  const data = new Uint8Array(fs.readFileSync(path.join(dir, name)));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      items: content.items.map((i) => ({
        text: i.str, x0: i.transform[4], x1: i.transform[4] + i.width,
        y: viewport.height - i.transform[5],
      })),
    });
  }
  return extractDocument(pages, name);
}

// bill no, printed total, line items, sum of line amounts
const EXPECTED = {
  '25678723.pdf': ['25678723', 420, 1, 420],
  '25694149b.pdf': ['25694149', 560, 8, 360],  // 19 refs on the cover, 4 detail pages in the file
  '25694501.pdf': ['25694501', 3892, 39, 3892],
  '25694711.pdf': ['25694711', 1426, 1, 1426],
  '50124633.pdf': ['50124633', 122, 3, 122],
  '71977468.pdf': ['71977468', 200, 4, 200],
};

for (const [name, [billNo, total, lineItems, lineSum]] of Object.entries(EXPECTED)) {
  test(`${name}: fields and totals`, async () => {
    const doc = await read(name);
    assert.equal(doc.fields.invoice_no, billNo);
    assert.equal(doc.fields.total_amount, total);
    assert.equal(doc.fields.line_items, lineItems);
    assert.deepEqual(doc.warnings, []);
    const actual = [...doc.np_charges, ...doc.np_tariff].reduce((s, r) => s + (r.amount || 0), 0);
    assert.equal(Math.round(actual * 100) / 100, lineSum);
  });

  test(`${name}: summary rows reconcile to the printed total`, async () => {
    const doc = await read(name);
    const summed = doc.np_summary.reduce((s, r) => s + (r.amount || 0), 0);
    assert.equal(Math.round(summed * 100) / 100, doc.fields.total_amount);
  });

  test(`${name}: every row carries its page header fields`, async () => {
    const doc = await read(name);
    for (const row of [...doc.np_charges, ...doc.np_tariff]) {
      assert.ok(row.bill_no && row.reference_no && row.invoice_date, 'header fields present');
      assert.equal(row.source_file, name);
      assert.notEqual(row.amount, null);
    }
  });
}

test('each detail page keeps its own Reference No', async () => {
  const doc = await read('25694501.pdf');
  assert.equal(new Set(doc.np_charges.map((r) => r.reference_no)).size, 12);
});

test('block fields fill down to later charges in the block', async () => {
  const doc = await read('25694501.pdf');
  const rows = doc.np_charges.filter((r) => r.reference_no === 'CF2500638243');
  assert.equal(rows.length, 2);
  assert.deepEqual(new Set(rows.map((r) => r.service_description)),
                   new Set(['2 DAYS STORAGE', '1 REMOVAL']));
  for (const row of rows) {
    assert.equal(row.container_no, 'FYCU7235098');
    assert.equal(row.voyage, '24B0CA');
    assert.equal(row.size, '286GP');
    assert.equal(row.operator, 'UNL');
    assert.equal(row.sno, '1');
  }
});

test('block total rows are not billed twice', async () => {
  const doc = await read('25694501.pdf');
  const rows = doc.np_charges.filter((r) => r.reference_no === 'CF2500638243');
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), 95);  // 30 + 65, not 30 + 65 + 95
});

test('several SNOs on one page stay separate rows', async () => {
  const doc = await read('71977468.pdf');
  assert.deepEqual(doc.np_charges.map((r) => r.sno), ['1', '2', '3', '4']);
  assert.equal(new Set(doc.np_charges.map((r) => r.container_no)).size, 4);
});

test('service type is read per page', async () => {
  const vgm = await read('25694149b.pdf');
  assert.deepEqual([...new Set(vgm.np_charges.map((r) => r.service_type))],
                   ['VERIFIED GROSS MASS (VGM)']);
  const dem = await read('71977468.pdf');
  assert.equal(dem.np_charges[0].service_type, 'DEMURRAGE CHARGES');
});

test('the tariff layout routes to its own table', async () => {
  const doc = await read('50124633.pdf');
  assert.equal(doc.fields.layout, 'tariff');
  assert.equal(doc.np_charges.length, 0);
  assert.deepEqual(doc.np_tariff.map((r) => r.tariff_code), ['14006', '52110', '63602']);
  assert.ok(doc.np_tariff.every((r) => r.group_ref.startsWith('IID:A5401521')));
});

test('validation flags the bill with missing detail pages', async () => {
  const rows = validate(await read('25694149b.pdf'));
  const lineCheck = rows.find((r) => r.check.startsWith('Line items'));
  assert.equal(lineCheck.status, 'CHECK');
  assert.equal(lineCheck.variance, -200);
});

test('toAmount only accepts money', () => {
  assert.equal(toAmount('1,426.00'), 1426);
  assert.equal(toAmount('5.00'), 5);
  assert.equal(toAmount(''), null);
  assert.equal(toAmount('NA'), null);
  assert.equal(toAmount('24B2PD'), null);
});

test('touching fragments join into one number', () => {
  // Northport draws "95.00" in the total row as three separate pieces of text.
  const items = [
    { text: '95', x0: 550, x1: 559, y: 100 },
    { text: '.', x0: 559, x1: 561, y: 100 },
    { text: '00', x0: 561, x1: 570, y: 100 },
  ];
  assert.equal(cell(groupLines(items)[0], [500, 600]), '95.00');
});

test('a line splits words that are far apart', () => {
  const items = [
    { text: '1', x0: 38, x1: 42, y: 100 },
    { text: 'FYCU7235098', x0: 44, x1: 90, y: 100 },
  ];
  const line = groupLines(items)[0];
  assert.equal(cell(line, [20, 44]), '1');
  assert.equal(cell(line, [44, 111]), 'FYCU7235098');
});

test('cells a fraction of a point apart stay on one line', () => {
  // The SUB-TOTAL cell is drawn ~0.8pt off its charge row.
  const items = [
    { text: '67.00', x0: 467, x1: 484, y: 213.8 },
    { text: '67.00', x0: 554, x1: 571, y: 213.0 },
  ];
  assert.equal(groupLines(items).length, 1);
});
