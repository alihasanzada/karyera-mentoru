from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.deps import get_client_id
from app.models.schemas import EvaluationResponse
from app.routers.cv import read_pdf
from app.services.eval_cache import cache_key, for_upload, get_cached, put_cached
from app.services.evaluator import evaluate_cv
from app.services.history import save_record

router = APIRouter(prefix="/api/evaluate", tags=["Evaluate"])


def _save_evaluation(db: Session, client_id: str, result: EvaluationResponse) -> EvaluationResponse:
    result.evaluation_id = save_record(
        db, client_id, "evaluation", result.filename, result,
        field_id=result.field_id, score=result.overall_score,
    )
    return result


@router.post("", response_model=EvaluationResponse)
async def evaluate_endpoint(
    request: Request,
    file: UploadFile = File(...),
    field_id: str = Form(...),
    refresh: bool = Query(False, description="Skip the cache and re-evaluate"),
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    text, pages = await read_pdf(file, field_id=field_id)
    key = cache_key(text, field_id, pages, client_id)

    filename = file.filename
    cached = None if refresh else get_cached(db, key, filename, pages)
    if cached is not None:
        return _save_evaluation(db, client_id, cached)

    bind = db.get_bind()
    db.rollback()

    async def generate() -> EvaluationResponse:
        result = await evaluate_cv(text, field_id, filename, pages)
        # The shared work can outlive its initiating request and its DB session.
        with Session(bind=bind) as writer:
            put_cached(writer, key, result)
            return _save_evaluation(writer, client_id, result)

    result = await request.app.state.evaluations.run((bind, key), generate)
    if result.filename != filename:
        return _save_evaluation(db, client_id, for_upload(result, filename, pages))
    return result
