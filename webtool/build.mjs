#!/usr/bin/env node
/**
 * Bundle the extractor into single self-contained HTML files.
 *
 *   dist/portklang-extractor.html  a complete HTML document, for opening from disk
 *   dist/artifact.html             body content only, for publishing as an Artifact
 *
 * pdf.js and its worker are inlined, so neither file needs a network connection
 * (bar the Google Fonts link, which falls back to the system stack offline).
 *
 * Run:  node webtool/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const VENDOR = path.join(ROOT, 'vendor');

// Concatenated in dependency order - the bundle is one flat scope.
const MODULES = ['geometry.js', 'northport.js', 'westports.js', 'extract.js', 'xlsx.js', 'schema.js', 'app.js'];

const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');

/** Flatten ES modules into one classic script: drop imports, unwrap exports. */
function stripModuleSyntax(source) {
  return source
    .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, '')
    .replace(/^export\s+(const|function|class|let)\b/gm, '$1');
}

const pdfjs = read(VENDOR, 'pdfjs3.min.js');
const worker = read(VENDOR, 'pdfjs3.worker.min.js');
const page = read(SRC, 'page.html');
const app = MODULES.map((m) => stripModuleSyntax(read(SRC, m))).join('\n');

// The worker runs from a blob URL, so the tool works from file:// with no
// network and no separate worker file to ship alongside it.
const boot = `
<script>${pdfjs}</script>
<script id="pdfjs-worker" type="text/plain">${worker}</script>
<script>
(function () {
  var source = document.getElementById('pdfjs-worker').textContent;
  var blob = new Blob([source], { type: 'application/javascript' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
})();
</script>
<script>
${app}
start();
</script>
`;

fs.mkdirSync(DIST, { recursive: true });
const body = page + boot;

fs.writeFileSync(path.join(DIST, 'artifact.html'), body);
fs.writeFileSync(
  path.join(DIST, 'portklang-extractor.html'),
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '</head>\n<body>\n' + body + '\n</body>\n</html>\n',
);

for (const name of ['portklang-extractor.html', 'artifact.html']) {
  const size = fs.statSync(path.join(DIST, name)).size;
  console.log(`${name}: ${(size / 1024 / 1024).toFixed(2)} MB`);
}
