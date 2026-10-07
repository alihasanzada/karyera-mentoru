from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.db_models import AnalysisRecord

MAX_PER_CLIENT = 50


def save_record(
    db: Session,
    client_id: str,
    kind: str,
    filename: str,
    result: BaseModel,
    field_id: str | None = None,
    score: int | None = None,
) -> None:
    db.add(
        AnalysisRecord(
            client_id=client_id,
            kind=kind,
            field_id=field_id,
            filename=filename,
            score=score,
            result_json=result.model_dump_json(),
        )
    )
    db.commit()

    # Hər istifadəçi üçün yalnız son 50 nəticəni saxla
    old_ids = db.scalars(
        select(AnalysisRecord.id)
        .where(AnalysisRecord.client_id == client_id)
        .order_by(AnalysisRecord.id.desc())
        .offset(MAX_PER_CLIENT)
    ).all()
    if old_ids:
        db.execute(delete(AnalysisRecord).where(AnalysisRecord.id.in_(old_ids)))
        db.commit()