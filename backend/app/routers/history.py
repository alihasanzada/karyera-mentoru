import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import AnalysisRecord, RoadmapRecord
from app.deps import get_client_id
from app.models.schemas import HistoryDetail, HistoryItem

router = APIRouter(prefix="/api/history", tags=["History"])


def _item(r: AnalysisRecord) -> dict:
    return dict(
        id=r.id,
        kind=r.kind,
        field_id=r.field_id,
        filename=r.filename,
        score=r.score,
        created_at=r.created_at.isoformat() + "Z",  # UTC
    )


def _get_own(db: Session, client_id: str, record_id: int) -> AnalysisRecord:
    record = db.scalar(
        select(AnalysisRecord).where(
            AnalysisRecord.id == record_id, AnalysisRecord.client_id == client_id
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Nəticə tapılmadı.")
    return record


@router.get("", response_model=list[HistoryItem])
def list_history(client_id: str = Depends(get_client_id), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AnalysisRecord)
        .where(AnalysisRecord.client_id == client_id)
        .order_by(AnalysisRecord.id.desc())
        .limit(20)
    ).all()
    return [_item(r) for r in rows]


@router.get("/{record_id}", response_model=HistoryDetail)
def get_history(record_id: int, client_id: str = Depends(get_client_id), db: Session = Depends(get_db)):
    r = _get_own(db, client_id, record_id)
    return {**_item(r), "result": json.loads(r.result_json)}


@router.delete("/{record_id}")
def delete_history(record_id: int, client_id: str = Depends(get_client_id), db: Session = Depends(get_db)):
    r = _get_own(db, client_id, record_id)
    db.execute(delete(RoadmapRecord).where(
        RoadmapRecord.client_id == client_id,
        RoadmapRecord.evaluation_id == record_id,
    ))
    db.delete(r)
    db.commit()
    return {"deleted": record_id}
