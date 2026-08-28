/* UI glue: queue files, read them with pdf.js, render the grid, hand back files. */

import { extractDocument, validate } from './extract.js';
import { buildWorkbook, buildCsv } from './xlsx.js';
import { TABLES, PORTS, DEFAULT_PORT } from './schema.js';

const $ = (id) => document.getElementById(id);
let queue = [];
let docs = [];             // everything read, whichever terminal it came from
let activeTab = 'wp_charges';
let port = DEFAULT_PORT;   // the terminal the tool is set to

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
      markFile(i, 'reading', 'Reading…');
      try {
        const pages = await readPdf(file);
        documents.push(extractDocument(pages, file.name));
      } catch (error) {
        documents.push(errorDocument(file.name, error.message));
      }
      docs = documents;
      drawQueue();
      // Let the browser paint between files so progress is visible.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    docs = documents;
    drawPorts();
    drawQueue();
    render();
    reportSkipped();
  } finally {
    setBusy(false);
  }
}

function errorDocument(name, message) {
  return {
    fields: { source_file: name, issuer: '', layout: 'unreadable', invoice_no: '',
              invoice_date: '', due_date: '', total_amount: null,
              pages: 0, detail_pages: 0, line_items: 0 },
    np_charges: [], np_tariff: [], np_summary: [],
    wp_charges: [], wp_storage: [], warnings: [message],
  };
}

/** Documents belonging to the selected terminal. */
function selected() {
  return docs.filter((d) => d.fields.issuer === port);
}

/** Documents that were read but belong to the other terminal. */
function otherPort() {
  return docs.filter((d) => d.fields.issuer && d.fields.issuer !== port);
}

/* --- the terminal selector ------------------------------------------------ */

/** The selected terminal's tables. Nothing from the other terminal appears. */
function visibleTables() {
  const mine = selected();
  const out = {};
  for (const table of TABLES) {
    if (table.port && table.port !== port) { out[table.id] = []; continue; }
    out[table.id] =
      table.id === 'fields' ? mine.map((d) => d.fields)
      : table.id === 'validation' ? mine.flatMap((d) => validate(d))
      : mine.flatMap((d) => d[table.id] || []);
  }
  return out;
}

/** The tables this terminal has - the strip never shows the other's. */
function stripFor(which) {
  return TABLES.filter((t) => !t.port || t.port === which);
}

function drawPorts() {
  $('ports').innerHTML = PORTS.map((p) => {
    const current = p.id === port ? ' aria-pressed="true"' : ' aria-pressed="false"';
    const count = docs.filter((d) => d.fields.issuer === p.id).length;
    const badge = count ? `<span class="count">${count}</span>` : '';
    return `<button class="port" data-port="${p.id}"${current}>${p.label}${badge}</button>`;
  }).join('');
}

/** Switching terminal re-renders what was already read - nothing is re-parsed. */
function switchPort(next) {
  if (next === port) return;
  port = next;
  const strip = stripFor(port);
  if (!strip.some((t) => t.id === activeTab)) {
    activeTab = (strip.find((t) => t.port) || { id: 'fields' }).id;
  }
  drawPorts();
  drawQueue();
  if (docs.length) { render(); reportSkipped(); }
}

/** Say plainly when bills were read but belong to the other terminal. */
function reportSkipped() {
  const skipped = otherPort();
  const mine = selected().length;
  if (!skipped.length) {
    setStatus(`Read ${mine} ${port} bill${mine === 1 ? '' : 's'}.`);
    return;
  }
  const other = skipped[0].fields.issuer;
  setStatus(`Read ${mine} ${port} bill${mine === 1 ? '' : 's'}. ` +
            `${skipped.length} ${other} bill${skipped.length === 1 ? '' : 's'} not shown — ` +
            `switch to ${other} to see ${skipped.length === 1 ? 'it' : 'them'}.`);
}

/* --- rendering ------------------------------------------------------------ */

function render() {
  const shown = visibleTables();
  const fields = shown.fields || [];
  // Nothing for this terminal - the status line carries the explanation, so
  // there is no point showing an empty grid under it.
  if (!fields.length) { $('results').hidden = true; return; }
  const lineItems = fields.reduce((sum, f) => sum + (f.line_items || 0), 0);
  const total = fields.reduce((sum, f) => sum + (f.total_amount || 0), 0);
  const flagged = (shown.validation || []).filter((v) => v.status !== 'OK').length;

  $('stats').innerHTML = [
    tile(`${port} bills`, fields.length),
    tile('Line items', lineItems),
    tile('Total billed', `RM ${money(total)}`),
    tile('Needs review', flagged, flagged ? 'flag' : 'ok'),
  ].join('');

  // A tab with no rows is dropped, not greyed out - the strip only ever shows
  // tables this pile actually produced, for the selected terminal.
  const strip = stripFor(port).filter((t) => (shown[t.id] || []).length);
  $('tabs').innerHTML = strip.map((t) => {
    const count = (shown[t.id] || []).length;
    const current = t.id === activeTab ? ' aria-selected="true"' : ' aria-selected="false"';
    return `<button role="tab" class="tab" data-tab="${t.id}"${current}>
      ${t.tab}<span class="count">${count}</span></button>`;
  }).join('');

  if (!(shown[activeTab] || []).length && strip.length) {
    activeTab = strip[0].id;
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
  const rows = visibleTables()[activeTab] || [];
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
  $('csv').textContent = `Download ${table.tab} as CSV`;
  $('xlsx').textContent = `Download ${port} workbook`;
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
  $('queue').innerHTML = queue.map((file, i) => {
    const { state, text } = queueState(i, file);
    return `<li class="qrow" data-i="${i}">
      <span class="qname">${escapeHtml(file.name)}</span>
      <span class="qsize">${(file.size / 1024).toFixed(0)} KB</span>
      <span class="qstate" data-state="${state}">${escapeHtml(text)}</span>
    </li>`;
  }).join('');
  const has = queue.length > 0;
  $('run').disabled = !has;
  $('clear').disabled = !has;
  $('queue').hidden = !has;
}

/**
 * A file's line in the queue. Once read, it says whether the bill belongs to
 * the selected terminal - a Northport bill dropped in Westports mode is named
 * as such rather than silently contributing nothing.
 */
function queueState(index, file) {
  const doc = docs.find((d) => d.fields.source_file === file.name);
  if (!doc) return { state: 'queued', text: 'Queued' };
  const { issuer, line_items: lines } = doc.fields;
  if (!issuer) return { state: 'error', text: doc.warnings[0] ? 'Not a port bill' : 'Unreadable' };
  if (issuer !== port) return { state: 'other', text: `${issuer} — not shown` };
  if (doc.warnings.length) return { state: 'warn', text: `${lines} lines — check` };
  return { state: 'done', text: `${lines} line${lines === 1 ? '' : 's'}` };
}

function markFile(index, state, text) {
  const el = $('queue').querySelector(`.qrow[data-i="${index}"] .qstate`);
  if (!el) return;
  el.dataset.state = state;
  el.textContent = text;
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
  const shown = visibleTables();
  // Only sheets with rows, so a Westports-only download has no empty Northport tabs.
  const sheets = TABLES
    .filter((t) => (shown[t.id] || []).length)
    .map((t) => ({ name: t.sheet, columns: t.columns, rows: shown[t.id] }));
  if (!sheets.length) { setStatus('Nothing to download for this selection.'); return; }
  const bills = (shown.fields || []).map((f) => f.invoice_no).filter(Boolean);
  const stem = port.toLowerCase();
  const name = bills.length === 1 ? `${stem}_${bills[0]}.xlsx` : `${stem}_extract.xlsx`;
  save(buildWorkbook(sheets), name);
  setStatus(`Downloaded ${name}`);
}

function downloadCsv() {
  const table = TABLES.find((t) => t.id === activeTab);
  const stem = port.toLowerCase();
  save(buildCsv(table.columns, visibleTables()[activeTab] || []), `${stem}_${table.id}.csv`);
  setStatus(`Downloaded ${stem}_${table.id}.csv`);
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
    queue = []; docs = []; drawQueue(); drawPorts();
    $('results').hidden = true; setStatus('');
  });
  $('ports').addEventListener('click', (e) => {
    const button = e.target.closest('.port');
    if (button) switchPort(button.dataset.port);
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
  drawPorts();
  drawQueue();
}
