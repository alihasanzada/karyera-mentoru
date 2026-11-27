from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.deps import get_client_id
from app.models.schemas import FieldInfo, MatchResponse
from app.routers.cv import read_pdf
from app.services.history import save_record
from app.services.matcher import list_fields, match_cv

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
    text, pages = await read_pdf(file, field_id=field_id)
    result = await match_cv(text, field_id, file.filename, pages)
    save_record(db, client_id, "match", file.filename, result,
                field_id=field_id, score=result.match_score)
    return result
