"""Command line entry point.

    python -m portbill_extractor Northport/*.pdf -o northport.xlsx
    python -m portbill_extractor --serve
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .excel import write_workbook
from .northport import extract


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="portbill_extractor", description=__doc__)
    parser.add_argument("pdfs", nargs="*", type=Path, help="PDF files or directories to extract")
    parser.add_argument("-o", "--output", type=Path, default=Path("extracted.xlsx"),
                        help="workbook to write (default: extracted.xlsx)")
    parser.add_argument("--serve", action="store_true", help="run the upload web app instead")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args(argv)

    if args.serve:
        from .webapp import create_app
        create_app().run(host=args.host, port=args.port)
        return 0

    paths: list[Path] = []
    for target in args.pdfs:
        if target.is_dir():
            paths.extend(sorted(target.glob("*.pdf")) + sorted(target.glob("*.PDF")))
        else:
            paths.append(target)
    if not paths:
        parser.error("no PDFs given (pass files, a directory, or --serve)")

    documents = []
    for path in paths:
        document = extract(path)
        documents.append(document)
        print(f"{path.name}: {document.fields.line_items} line items, "
              f"{len(document.summary_rows)} summary rows, "
              f"total RM {document.fields.total_amount}")
        for warning in document.warnings:
            print(f"  ! {warning}", file=sys.stderr)

    write_workbook(documents, args.output)
    print(f"\nWrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
