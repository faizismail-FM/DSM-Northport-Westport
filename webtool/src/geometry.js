/* ---------------------------------------------------------------------------
   Shared page geometry.

   Both Northport and Westports bills are digitally generated, so every column
   sits at a fixed horizontal position. Rather than guess at a table structure,
   each piece of text is banded into a column by its left edge, and text is
   clustered into visual lines by vertical position.
   --------------------------------------------------------------------------- */

// Two pieces of text on one visual line can differ in y by a fraction of a
// point - Northport draws SUB-TOTAL cells ~0.8pt off their charge row, and
// Westports draws the line number ~0.6pt off its charge.
export const LINE_TOLERANCE = 3.0;

const MONEY = /^-?[\d,]+\.\d{2}$/;

export function toAmount(text) {
  const t = (text || '').trim();
  return MONEY.test(t) ? parseFloat(t.replace(/,/g, '')) : null;
}

/** Join words, closing up fragments that touch - "95" "." "00" is one number. */
export function joinWords(words) {
  let out = '';
  let prev = null;
  for (const word of words) {
    if (prev && word.x0 - prev.x1 > 1.0) out += ' ';
    out += word.text;
    prev = word;
  }
  return out.trim();
}

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
    line.text = joinWords(line.words);
  }
  return lines;
}

/** Text of the words whose left edge falls inside a column band. */
export function cell(line, band) {
  return joinWords(line.words.filter((w) => w.x0 >= band[0] && w.x0 < band[1]));
}

/** Index of the first line containing all the given words. */
export function findHeader(lines, ...needles) {
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase();
    if (needles.every((n) => upper.includes(n))) return i;
  }
  return -1;
}

/**
 * Read a stacked label/value header block into a dict, matching values to
 * labels by vertical alignment rather than by text-stream order - Northport
 * emits the Bill Of Lading value out of order, and only the y is trustworthy.
 */
export function labelled(lines, labelBand, valueBand) {
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

/** ISO container number, e.g. FBIU5554359. */
export const CONTAINER_RE = /^([A-Z]{4}\d{7})/;
