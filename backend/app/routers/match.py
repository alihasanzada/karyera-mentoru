from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.deps import get_client_id
from app.models.schemas import FieldInfo, MatchResponse
from app.routers.cv import read_pdf
from app.services.ai_analyzer import AIAnalysisError
from app.services.history import save_record
from app.services.matcher import ROLES, list_fields, match_cv

router = APIRouter(prefix="/api/match", tags=["Match"])


@router.get("/fields", response_model=list[FieldInfo])
def get_fields():
    return list_fields()


@router.post("/analyze", response_model=MatchResponse)
async def match_endpoint(
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
        result = await match_cv(text, field_id, file.filename, pages)
    except AIAnalysisError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    save_record(db, client_id, "match", file.filename, result,
                field_id=field_id, score=result.match_score)
    return result