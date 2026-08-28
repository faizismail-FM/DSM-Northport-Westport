/* Structural checks on the built single-file tool.

   These guard the things unit tests on src/ cannot see: that the bundle is
   genuinely self-contained, and that nothing overrides the `hidden` attribute
   (an inline `display:flex` on #results once made it impossible to hide). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const BUILT = fs.readFileSync(path.join(DIST, 'portklang-extractor.html'), 'utf8');
const ARTIFACT = fs.readFileSync(path.join(DIST, 'artifact.html'), 'utf8');

test('the hidden attribute is not overridable', () => {
  assert.match(BUILT, /\[hidden\]\{display:none!important\}/);
});

test('no element that gets hidden carries an inline display', () => {
  // `hidden` is a UA-stylesheet rule, so any inline display would beat it.
  for (const id of ['results', 'queue', 'ports']) {
    const tag = new RegExp(`<[a-z]+[^>]*id="${id}"[^>]*>`).exec(BUILT);
    assert.ok(tag, `#${id} present`);
    assert.doesNotMatch(tag[0], /style="[^"]*display/, `#${id} must not set display inline`);
  }
});

test('the bundle is self-contained', () => {
  // Google Fonts is the one permitted external reference; it degrades to the
  // fallback stack offline. Nothing else may be fetched at runtime.
  const externals = [...BUILT.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  for (const url of externals) {
    assert.match(url, /^https:\/\/fonts\.(googleapis|gstatic)\.com(\/|$)/, `unexpected external: ${url}`);
  }
});

test('pdf.js and its worker are inlined', () => {
  assert.match(BUILT, /pdfjsLib/);
  assert.match(BUILT, /id="pdfjs-worker"/);
  assert.match(BUILT, /GlobalWorkerOptions\.workerSrc = URL\.createObjectURL/);
});

test('the standalone file is a complete document, the artifact body-only', () => {
  assert.match(BUILT, /^<!doctype html>/i);
  assert.match(BUILT, /<meta charset="utf-8">/);
  assert.doesNotMatch(ARTIFACT, /^<!doctype/i);
  assert.doesNotMatch(ARTIFACT, /<html[\s>]/i);
});

test('both outputs carry the same page content', () => {
  const marker = '<div class="shell">';
  assert.equal(BUILT.slice(BUILT.indexOf(marker)).replace(/\n<\/body>\n<\/html>\n$/, ''),
               ARTIFACT.slice(ARTIFACT.indexOf(marker)));
});

test('the page is titled', () => {
  assert.match(BUILT, /<title>Port Klang Bill Extractor<\/title>/);
});

test('dist is in step with src', () => {
  // A stale dist is the easiest mistake to ship, since dist is committed.
  const app = fs.readFileSync(path.join(HERE, '..', 'src', 'app.js'), 'utf8');
  const marker = app.match(/function reportSkipped\(\) \{/);
  assert.ok(marker, 'src has reportSkipped');
  assert.ok(BUILT.includes('function reportSkipped()'), 'built file has it too');
});
