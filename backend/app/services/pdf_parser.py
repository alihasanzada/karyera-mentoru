import io
import logging
import re

import pdfplumber

logging.getLogger("pdfminer").setLevel(logging.ERROR)

PAGE_MARKER = re.compile(
    r"^\s*(?:Səhifə|Page|Seite|Стр\.?)\s*\d+\s*(?:/|of|из)\s*\d+\s*$", re.IGNORECASE
)


class PDFParseError(Exception):
    """For errors encountered while reading PDFs."""


def _clean(text: str) -> str:
    """'Deletes lines like 'Page 1 / 1'."""
    kept = [ln for ln in text.splitlines() if not PAGE_MARKER.match(ln)]
    return "\n".join(kept).strip()


def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, int]:
    """Extract text from PDF bytes. Returns (text, page_count)."""
    pages_text = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                pages_text.append(page.extract_text() or "")
    except Exception as e:
        raise PDFParseError("PDF faylını oxumaq mümkün olmadı.") from e

    full_text = _clean("\n".join(pages_text))
    if not full_text:
        raise PDFParseError(
            "PDF-dən mətn çıxarıla bilmədi. Fayl skan edilmiş şəkil ola bilər."
        )
    return full_text, page_count