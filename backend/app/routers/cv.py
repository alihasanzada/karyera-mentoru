from fastapi import APIRouter, File, HTTPException, UploadFile, Depends
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from app.db.database import get_db
from app.deps import get_client_id
from app.services.history import save_record
from app.config import settings
from app.models.schemas import AnalyzeResponse, UploadResponse
from app.services.ai_analyzer import analyze_cv
from app.services.matcher import ROLES
from app.services.pdf_parser import PDFParseError, extract_text_from_pdf

router = APIRouter(prefix="/api/cv", tags=["CV"])


async def read_pdf(file: UploadFile, *, field_id: str | None = None) -> tuple[str, int]:
    """Validate the requested specialty, if supplied, then read the PDF."""
    if field_id is not None and field_id not in ROLES:
        raise HTTPException(400, "Naməlum ixtisas. Siyahıdan ixtisas seç.")

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Yalnız PDF faylı qəbul olunur.")

    limit = settings.max_upload_mb * 1024 * 1024
    content = await file.read(limit + 1)

    if len(content) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Fayl çox böyükdür (maksimum {settings.max_upload_mb} MB).",
        )
    if not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Bu fayl həqiqi PDF deyil.")

    try:
        return await run_in_threadpool(extract_text_from_pdf, content)
    except PDFParseError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/upload", response_model=UploadResponse)
async def upload_cv(file: UploadFile = File(...), client_id: str = Depends(get_client_id)):
    text, pages = await read_pdf(file)
    return UploadResponse(
        filename=file.filename, pages=pages, characters=len(text), text=text
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_cv_endpoint(
    file: UploadFile = File(...),
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    text, pages = await read_pdf(file)
    analysis = await analyze_cv(text)
    result = AnalyzeResponse(filename=file.filename, pages=pages, analysis=analysis)
    save_record(db, client_id, "cv", file.filename, result, score=analysis.cv_score)
    return result
