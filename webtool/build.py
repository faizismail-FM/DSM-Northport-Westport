#!/usr/bin/env python3
"""Bundle the extractor into single self-contained HTML files.

Produces two outputs from the same source:

  dist/northport-extractor.html  a complete HTML document, for opening from disk
  dist/artifact.html             body content only, for publishing as an Artifact

pdf.js and its worker are inlined, so neither file needs a network connection
(bar the Google Fonts link, which degrades to the fallback stack offline).
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
VENDOR = ROOT / "vendor"

MODULES = ["parser.js", "xlsx.js", "schema.js", "app.js"]


def strip_module_syntax(source: str) -> str:
    """Flatten ES modules into one script: drop imports, unwrap exports."""
    source = re.sub(r"^\s*import\s+.*?;\s*$", "", source, flags=re.M | re.S)
    source = re.sub(r"^export\s+(const|function|class|let)\b", r"\1", source, flags=re.M)
    return source


def build() -> None:
    pdfjs = (VENDOR / "pdfjs3.min.js").read_text(encoding="utf-8")
    worker = (VENDOR / "pdfjs3.worker.min.js").read_text(encoding="utf-8")
    page = (SRC / "page.html").read_text(encoding="utf-8")
    app = "\n".join(strip_module_syntax((SRC / m).read_text(encoding="utf-8")) for m in MODULES)

    # The worker runs from a blob URL, so the whole tool works from file:// with
    # no network and no separate worker file to ship.
    boot = f"""
<script>{pdfjs}</script>
<script id="pdfjs-worker" type="text/plain">{worker}</script>
<script>
(function () {{
  var source = document.getElementById('pdfjs-worker').textContent;
  var blob = new Blob([source], {{ type: 'application/javascript' }});
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
}})();
</script>
<script>
{app}
start();
</script>
"""

    DIST.mkdir(exist_ok=True)
    body = page + boot
    (DIST / "artifact.html").write_text(body, encoding="utf-8")
    (DIST / "northport-extractor.html").write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "</head>\n<body>\n" + body + "\n</body>\n</html>\n",
        encoding="utf-8",
    )
    for name in ("northport-extractor.html", "artifact.html"):
        size = (DIST / name).stat().st_size
        print(f"{name}: {size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    build()
