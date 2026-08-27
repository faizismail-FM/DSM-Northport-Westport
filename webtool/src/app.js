/* UI glue: queue files, read them with pdf.js, render the grid, hand back files. */

import { extractDocument, validate } from './parser.js';
import { buildWorkbook, buildCsv } from './xlsx.js';
import { TABLES } from './schema.js';

const $ = (id) => document.getElementById(id);
let queue = [];
let tables = {};
let activeTab = 'charges';

/* --- reading a PDF -------------------------------------------------------- */

async function readPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      items: content.items.map((item) => ({
        text: item.str,
        x0: item.transform[4],
        x1: item.transform[4] + item.width,
        // pdf.js measures y from the bottom; flip it so lines sort top-down.
        y: viewport.height - item.transform[5],
      })),
    });
  }
  await pdf.destroy();
  return pages;
}

/* --- running the queue ---------------------------------------------------- */

async function run() {
  if (!queue.length) return;
  setBusy(true);
  const documents = [];
  try {
    for (let i = 0; i < queue.length; i++) {
      const file = queue[i];
      setStatus(`Reading ${file.name} (${i + 1} of ${queue.length})…`);
      markFile(i, 'reading');
      try {
        const pages = await readPdf(file);
        const doc = extractDocument(pages, file.name);
        documents.push(doc);
        markFile(i, doc.warnings.length ? 'warn' : 'done', doc);
      } catch (error) {
        markFile(i, 'error', null, error.message);
        documents.push(errorDocument(file.name, error.message));
      }
      // Let the browser paint between files so progress is visible.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    collect(documents);
    render();
    setStatus(`Read ${documents.length} document${documents.length === 1 ? '' : 's'}.`);
  } finally {
    setBusy(false);
  }
}

function errorDocument(name, message) {
  return {
    fields: { source_file: name, layout: 'unreadable', bill_no: '', invoice_date: '', due_date: '',
              account_no: '', bill_to: '', total_amount: null, pages: 0, detail_pages: 0, line_items: 0 },
    summary_rows: [], charge_rows: [], tariff_rows: [], warnings: [message],
  };
}

function collect(documents) {
  tables = {
    fields: documents.map((d) => d.fields),
    charges: documents.flatMap((d) => d.charge_rows),
    tariff: documents.flatMap((d) => d.tariff_rows),
    summary: documents.flatMap((d) => d.summary_rows),
    validation: documents.flatMap((d) => validate(d)),
  };
}

/* --- rendering ------------------------------------------------------------ */

function render() {
  const fields = tables.fields || [];
  const lineItems = (tables.charges || []).length + (tables.tariff || []).length;
  const total = fields.reduce((sum, f) => sum + (f.total_amount || 0), 0);
  const flagged = (tables.validation || []).filter((v) => v.status !== 'OK').length;

  $('stats').innerHTML = [
    tile('Documents', fields.length),
    tile('Line items', lineItems),
    tile('Total billed', `RM ${money(total)}`),
    tile('Needs review', flagged, flagged ? 'flag' : 'ok'),
  ].join('');

  $('tabs').innerHTML = TABLES.map((t) => {
    const count = (tables[t.id] || []).length;
    const disabled = count === 0 ? ' disabled' : '';
    const current = t.id === activeTab ? ' aria-selected="true"' : ' aria-selected="false"';
    return `<button role="tab" class="tab" data-tab="${t.id}"${current}${disabled}>
      ${t.name}<span class="count">${count}</span></button>`;
  }).join('');

  if (!(tables[activeTab] || []).length) {
    const firstWithRows = TABLES.find((t) => (tables[t.id] || []).length);
    if (firstWithRows) activeTab = firstWithRows.id;
    $('tabs').querySelectorAll('.tab').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.tab === activeTab)));
  }

  drawGrid();
  $('results').hidden = false;
}

function tile(label, value, tone = '') {
  return `<div class="tile${tone ? ' ' + tone : ''}">
    <span class="tile-label">${label}</span>
    <span class="tile-value">${escapeHtml(String(value))}</span></div>`;
}

function drawGrid() {
  const table = TABLES.find((t) => t.id === activeTab);
  const rows = tables[activeTab] || [];
  const head = table.columns.map((c) =>
    `<th class="${cellClass(c)}" scope="col">${escapeHtml(c.label)}</th>`).join('');
  const body = rows.map((row) => '<tr>' + table.columns.map((c) => {
    const value = row[c.key];
    if (c.pill) return `<td><span class="pill ${String(value).toLowerCase()}">${escapeHtml(String(value))}</span></td>`;
    const text = c.money && typeof value === 'number' ? money(value)
      : value === null || value === undefined ? '' : String(value);
    return `<td class="${cellClass(c)}"${c.wide ? ` title="${escapeHtml(text)}"` : ''}>${escapeHtml(text)}</td>`;
  }).join('') + '</tr>').join('');

  $('grid').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  $('gridNote').textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} — ${table.sheet}`;
  $('csv').textContent = `Download ${table.name} as CSV`;
}

function cellClass(column) {
  return [column.money || column.numeric ? 'num' : '', column.mono ? 'mono' : '', column.wide ? 'wide' : '']
    .filter(Boolean).join(' ');
}

const money = (n) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --- the file queue ------------------------------------------------------- */

function addFiles(files) {
  const pdfs = [...files].filter((f) => /\.pdf$/i.test(f.name));
  const skipped = files.length - pdfs.length;
  queue = queue.concat(pdfs);
  drawQueue();
  setStatus(skipped ? `${skipped} file${skipped === 1 ? '' : 's'} ignored — PDFs only.` : '');
}

function drawQueue() {
  $('queue').innerHTML = queue.map((file, i) => `<li class="qrow" data-i="${i}">
      <span class="qname">${escapeHtml(file.name)}</span>
      <span class="qsize">${(file.size / 1024).toFixed(0)} KB</span>
      <span class="qstate" data-state="queued">Queued</span>
    </li>`).join('');
  const has = queue.length > 0;
  $('run').disabled = !has;
  $('clear').disabled = !has;
  $('queue').hidden = !has;
}

function markFile(index, state, doc, message) {
  const el = $('queue').querySelector(`.qrow[data-i="${index}"] .qstate`);
  if (!el) return;
  el.dataset.state = state;
  el.textContent =
    state === 'reading' ? 'Reading…'
    : state === 'error' ? (message || 'Failed')
    : state === 'warn' ? `${doc.fields.line_items} lines — check`
    : `${doc.fields.line_items} line${doc.fields.line_items === 1 ? '' : 's'}`;
}

const setStatus = (text) => { $('status').textContent = text; };

function setBusy(busy) {
  $('run').disabled = busy || !queue.length;
  $('clear').disabled = busy || !queue.length;
  $('run').textContent = busy ? 'Reading…' : 'Extract';
  document.body.classList.toggle('busy', busy);
}

/* --- downloads ------------------------------------------------------------ */

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadWorkbook() {
  const sheets = TABLES.map((t) => ({ name: t.sheet, columns: t.columns, rows: tables[t.id] || [] }));
  const bills = (tables.fields || []).map((f) => f.bill_no).filter(Boolean);
  const name = bills.length === 1 ? `northport_${bills[0]}.xlsx` : 'northport_extract.xlsx';
  save(buildWorkbook(sheets), name);
  setStatus(`Downloaded ${name}`);
}

function downloadCsv() {
  const table = TABLES.find((t) => t.id === activeTab);
  save(buildCsv(table.columns, tables[activeTab] || []), `northport_${table.id}.csv`);
  setStatus(`Downloaded northport_${table.id}.csv`);
}

/* --- wiring --------------------------------------------------------------- */

export function start() {
  const drop = $('drop');
  drop.addEventListener('click', () => $('picker').click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('picker').click(); }
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files);
  });
  $('picker').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });

  $('run').addEventListener('click', run);
  $('clear').addEventListener('click', () => {
    queue = []; tables = {}; drawQueue(); $('results').hidden = true; setStatus('');
  });
  $('tabs').addEventListener('click', (e) => {
    const button = e.target.closest('.tab');
    if (!button || button.disabled) return;
    activeTab = button.dataset.tab;
    $('tabs').querySelectorAll('.tab').forEach((b) =>
      b.setAttribute('aria-selected', String(b.dataset.tab === activeTab)));
    drawGrid();
  });
  $('xlsx').addEventListener('click', downloadWorkbook);
  $('csv').addEventListener('click', downloadCsv);
  drawQueue();
}
