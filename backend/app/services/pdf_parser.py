import io
import pdfplumber
import logging

logging.getLogger("pdfminer").setLevel(logging.ERROR)

class PDFParseError(Exception):
    """PDF oxunarkən yaranan xətalar üçün."""

def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, int]:
    """PDF baytlarından mətn çıxarır. (mətn, səhifə_sayı) qaytarır."""
    pages_text = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            page_count = len(pdf.pages)
            for page in pdf.pages:
                pages_text.append(page.extract_text() or "")
    except Exception as e:
        raise PDFParseError("PDF faylını oxumaq mümkün olmadı.") from e

    full_text = "\n".join(pages_text).strip()
    if not full_text:
        raise PDFParseError(
            "PDF-dən mətn çıxarıla bilmədi. Fayl skan edilmiş şəkil ola bilər."
        )
    return full_text, page_count