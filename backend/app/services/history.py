from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.db_models import AnalysisRecord, RoadmapCompletion, RoadmapRecord

MAX_PER_CLIENT = 50


def delete_roadmaps(db: Session, client_id: str, evaluation_ids: list[int]) -> None:
    plans = select(RoadmapRecord.id).where(
        RoadmapRecord.client_id == client_id, RoadmapRecord.evaluation_id.in_(evaluation_ids),
    )
    db.execute(delete(RoadmapCompletion).where(RoadmapCompletion.roadmap_id.in_(plans)))
    db.execute(delete(RoadmapRecord).where(RoadmapRecord.id.in_(plans)))


def save_record(
    db: Session,
    client_id: str,
    kind: str,
    filename: str,
    result: BaseModel,
    field_id: str | None = None,
    score: int | None = None,
) -> int:
    record = AnalysisRecord(
        client_id=client_id,
        kind=kind,
        field_id=field_id,
        filename=filename,
        score=score,
        result_json=result.model_dump_json(),
    )
    db.add(record)
    db.flush()
    record_id = record.id

    # Keep only the last 50 results for each user
    old_ids = db.scalars(
        select(AnalysisRecord.id)
        .where(AnalysisRecord.client_id == client_id)
        .order_by(AnalysisRecord.id.desc())
        .offset(MAX_PER_CLIENT)
    ).all()
    if old_ids:
        delete_roadmaps(db, client_id, old_ids)
        db.execute(delete(AnalysisRecord).where(AnalysisRecord.id.in_(old_ids)))
    db.commit()
    return record_id
