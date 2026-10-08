from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.deps import get_client_id
from app.models.schemas import EvaluationResponse
from app.routers.cv import read_pdf
from app.services.ai_analyzer import AIAnalysisError
from app.services.evaluator import evaluate_cv
from app.services.history import save_record
from app.services.matcher import ROLES

router = APIRouter(prefix="/api/evaluate", tags=["Evaluate"])


@router.post("", response_model=EvaluationResponse)
async def evaluate_endpoint(
    file: UploadFile = File(...),
    field_id: str = Form(...),
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    if field_id not in ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Naməlum sahə. Mövcud sahələr: {', '.join(ROLES.keys())}",
        )

    text, pages = await read_pdf(file)
    try:
        result = await evaluate_cv(text, field_id, file.filename, pages)
    except AIAnalysisError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    save_record(db, client_id, "evaluation", file.filename, result,
                field_id=field_id, score=result.overall_score)
    return result