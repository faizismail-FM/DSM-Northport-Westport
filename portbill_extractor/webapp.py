"""Upload PDFs in a browser, get the workbook back.

Nothing is persisted: files are parsed in memory and the workbook is streamed
straight to the download.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file

from .excel import workbook_bytes
from .northport import extract

MAX_UPLOAD_BYTES = 32 * 1024 * 1024


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.post("/extract")
    def extract_route():
        uploads = [f for f in request.files.getlist("files") if f.filename]
        if not uploads:
            return jsonify(error="No PDF uploaded."), 400

        documents, preview = [], []
        with tempfile.TemporaryDirectory() as tmp:
            for upload in uploads:
                if not upload.filename.lower().endswith(".pdf"):
                    return jsonify(error=f"{upload.filename} is not a PDF."), 400
                # Parse from a temp copy under the upload's own name so the
                # Source File column matches what the user sent.
                path = Path(tmp) / Path(upload.filename).name
                upload.save(path)
                try:
                    document = extract(path)
                except Exception as exc:  # noqa: BLE001 - surfaced to the user
                    return jsonify(error=f"{upload.filename}: could not read ({exc})"), 400
                documents.append(document)
                preview.append({
                    "file": document.fields.source_file,
                    "layout": document.fields.layout,
                    "bill_no": document.fields.bill_no,
                    "invoice_date": document.fields.invoice_date,
                    "total": document.fields.total_amount,
                    "line_items": document.fields.line_items,
                    "warnings": document.warnings,
                })
            payload = workbook_bytes(documents)

        if request.form.get("mode") == "preview":
            return jsonify(documents=preview)

        return send_file(
            _as_stream(payload),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=_download_name(documents),
        )

    return app


def _as_stream(payload: bytes):
    from io import BytesIO

    return BytesIO(payload)


def _download_name(documents) -> str:
    if len(documents) == 1 and documents[0].fields.bill_no:
        return f"northport_{documents[0].fields.bill_no}.xlsx"
    return "northport_extract.xlsx"
