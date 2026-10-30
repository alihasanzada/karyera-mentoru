import hashlib
import json

from sqlalchemy.orm import Session

from app.db.db_models import EvaluationCache
from app.models.schemas import EvaluationResponse
from app.services.rubric import SCORING_VERSION


def cache_key(cv_text: str, field_id: str, pages: int) -> str:
    # Preserve punctuation, case and line breaks: they can change CV scoring.
    payload = json.dumps([SCORING_VERSION, field_id, pages, cv_text], ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_cached(db: Session, key: str, filename: str, pages: int) -> EvaluationResponse | None:
    row = db.get(EvaluationCache, key)
    if row is None:
        return None
    try:
        result = EvaluationResponse.model_validate_json(row.result_json)
    except ValueError:
        return None
    match = result.match.model_copy(update={"filename": filename, "pages": pages})
    return result.model_copy(update={"evaluation_id": None, "filename": filename, "pages": pages, "match": match})


def put_cached(db: Session, key: str, result: EvaluationResponse) -> None:
    anonymous = result.model_copy(
        update={"evaluation_id": None, "filename": "", "match": result.match.model_copy(update={"filename": ""})}
    )
    data = anonymous.model_dump_json()
    row = db.get(EvaluationCache, key)
    if row:
        row.result_json = data
    else:
        db.add(EvaluationCache(key=key, result_json=data))
    db.commit()
