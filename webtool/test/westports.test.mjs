/* Regression tests for the Westports parser, pinned to the ten sample bills. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(HERE, '..', '..', 'Westport');
const SRC = path.join(HERE, '..', 'src');

const { extractDocument, validate, detectIssuer, WESTPORTS } =
  await import(path.join(SRC, 'extract.js'));
const { splitContainer } = await import(path.join(SRC, 'westports.js'));

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

async function pagesOf(name) {
  const data = new Uint8Array(fs.readFileSync(path.join(SAMPLES, name)));
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
  return pages;
}

const read = async (name) => extractDocument(await pagesOf(name), name);

// invoice no, charge lines, total
const EXPECTED = {
  '702510390.pdf': ['702510390', 2, 88],
  '727657457.pdf': ['727657457', 10, 1754],
  '727737521.pdf': ['727737521', 7, 35],
  '727739883.pdf': ['727739883', 6, 180],
  '727739885.pdf': ['727739885', 18, 90],
  '727740957.pdf': ['727740957', 3, 90],
  '727741225.pdf': ['727741225', 2, 210],
  '727741687.pdf': ['727741687', 4, 420],
  '780027139.pdf': ['780027139', 1, 350],
  'REEFER MONITOR - WESTPORT.PDF': ['727623765', 5, 1809],
};

for (const [name, [invoiceNo, lineItems, total]] of Object.entries(EXPECTED)) {
  test(`${name}: fields and totals`, async () => {
    const doc = await read(name);
    assert.equal(doc.fields.issuer, WESTPORTS);
    assert.equal(doc.fields.invoice_no, invoiceNo);
    assert.equal(doc.fields.total_amount, total);
    assert.equal(doc.wp_charges.length, lineItems);
    assert.deepEqual(doc.warnings, []);
    const summed = doc.wp_charges.reduce((s, r) => s + (r.amount || 0), 0);
    assert.equal(Math.round(summed * 100) / 100, total);
  });

  test(`${name}: every check reconciles`, async () => {
    const rows = validate(await read(name));
    assert.ok(rows.length > 0, 'something was checked');
    assert.deepEqual(rows.filter((r) => r.status !== 'OK'), []);
  });
}

test('the issuer is detected from the page text', async () => {
  assert.equal(detectIssuer(await pagesOf('727657457.pdf')), WESTPORTS);
});

test('the container header fills down over its charges', async () => {
  // One container, five charges billed against it.
  const doc = await read('REEFER MONITOR - WESTPORT.PDF');
  assert.equal(new Set(doc.wp_charges.map((r) => r.container_no)).size, 1);
  for (const row of doc.wp_charges) {
    assert.equal(row.container_no, 'FBIU5554359');
    assert.equal(row.type, 'RE');
    assert.equal(row.size, '40');
    assert.equal(row.operator, 'IAL');
  }
  assert.deepEqual(doc.wp_charges.map((r) => r.tariff_code),
                   ['G80104', 'G82202', 'G83202', 'G85402', 'G85501']);
  assert.equal(doc.wp_charges[2].quantity, 22);
  assert.equal(doc.wp_charges[2].rate, 62);
  assert.equal(doc.wp_charges[2].amount, 1364);
});

test('a new container header starts a new group', async () => {
  const doc = await read('727739885.pdf');
  // 18 charges, each against its own container.
  assert.equal(new Set(doc.wp_charges.map((r) => r.container_no)).size, 18);
  assert.equal(doc.wp_charges[0].container_no, 'DFSU2874755');
  assert.equal(doc.wp_charges[17].container_no, 'OCGU2077889');
});

test('charges continue across a page break', async () => {
  const doc = await read('727739885.pdf');
  assert.deepEqual([...new Set(doc.wp_charges.map((r) => r.page))], [1, 2]);
  assert.equal(doc.fields.pages, 2);
});

test('detail lines attach to their charge, not to a new row', async () => {
  const doc = await read('727740957.pdf');
  assert.equal(doc.wp_charges.length, 3);
  assert.match(doc.wp_charges[0].detail, /Shipper: 0 kg Terminal: 14,300 kg/);
});

test('the storage annex is read as its own table', async () => {
  const doc = await read('702510390.pdf');
  assert.equal(doc.fields.layout, 'invoice + storage annex');
  assert.equal(doc.wp_storage.length, 4);
  const first = doc.wp_storage[0];
  assert.equal(first.container_no, 'ANBU9326880');
  assert.equal(first.vessel_name, 'MOL EARNEST');
  assert.equal(first.voyage, '0101W');
  assert.equal(first.days, '2');
  assert.equal(first.charged_days, '2');
  assert.equal(first.amount, 16);
  assert.match(first.caption, /Export storage for SWN between period/);
  // The annex Total row must not be read as a container.
  assert.equal(doc.wp_storage.reduce((s, r) => s + r.amount, 0), 88);
});

test('a call number printed inside the voyage is split out', async () => {
  const doc = await read('702510390.pdf');   // prints "0101W (24B1MF)"
  assert.equal(doc.fields.voyage, '0101W');
  assert.equal(doc.fields.call_no, '24B1MF');
});

test('an invoice with no vessel still reads', async () => {
  const doc = await read('727739885.pdf');
  assert.equal(doc.fields.vessel, '');
  assert.equal(doc.fields.voyage, '');
  assert.equal(doc.fields.line_items, 18);
});

test('a non-container service invoice still reads', async () => {
  const doc = await read('780027139.pdf');
  assert.equal(doc.wp_charges.length, 1);
  assert.equal(doc.wp_charges[0].container_no, '');
  assert.equal(doc.wp_charges[0].amount, 350);
  assert.equal(doc.fields.terms, '30 Days');
  assert.equal(doc.fields.due_date, '02/03/2025');
});

test('remarks are picked up', async () => {
  assert.equal((await read('REEFER MONITOR - WESTPORT.PDF')).fields.remarks,
               '7580347 /BL No:A15EX13350');
  assert.equal((await read('727741225.pdf')).fields.remarks, 'AGR20250117185346');
});

test('splitContainer handles every form seen on the samples', () => {
  assert.deepEqual(splitContainer('FBIU5554359-RE- 40-IAL'),
    { container_no: 'FBIU5554359', type: 'RE', size: '40', operator: 'IAL' });
  assert.deepEqual(splitContainer('MTMU2892985-DV-20-MTM'),
    { container_no: 'MTMU2892985', type: 'DV', size: '20', operator: 'MTM' });
  assert.deepEqual(splitContainer('DAHU9100904'),
    { container_no: 'DAHU9100904', type: '', size: '', operator: '' });
  assert.equal(splitContainer('Shipper: 0 kg Terminal: 26,650 kg'), null);
});
