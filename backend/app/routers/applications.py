from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import ApplicationRecord
from app.deps import get_client_id
from app.models.schemas import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationStatus,
    ApplicationUpdate,
)

router = APIRouter(prefix="/api/applications", tags=["Applications"])

MAX_PER_CLIENT = 200


def _out(r: ApplicationRecord) -> dict:
    return dict(
        id=r.id,
        company=r.company,
        position=r.position,
        status=r.status,
        applied_date=r.applied_date,
        notes=r.notes,
        next_step=r.next_step,
        next_step_date=r.next_step_date,
        created_at=r.created_at.isoformat() + "Z",  # UTC
        updated_at=r.updated_at.isoformat() + "Z",
    )


def _get_own(db: Session, client_id: str, application_id: int) -> ApplicationRecord:
    record = db.scalar(
        select(ApplicationRecord).where(
            ApplicationRecord.id == application_id,
            ApplicationRecord.client_id == client_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Müraciət tapılmadı.")
    return record


@router.get("", response_model=list[ApplicationOut])
def list_applications(
    status: ApplicationStatus | None = Query(None, description="Filter by status"),
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    query = select(ApplicationRecord).where(ApplicationRecord.client_id == client_id)
    if status:
        query = query.where(ApplicationRecord.status == status)
    rows = db.scalars(query.order_by(ApplicationRecord.id.desc()).limit(MAX_PER_CLIENT)).all()
    return [_out(r) for r in rows]


@router.post("", response_model=ApplicationOut, status_code=201)
def create_application(
    payload: ApplicationCreate,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    count = db.scalar(
        select(func.count())
        .select_from(ApplicationRecord)
        .where(ApplicationRecord.client_id == client_id)
    )
    if count >= MAX_PER_CLIENT:
        raise HTTPException(
            status_code=400,
            detail=f"Maksimum müraciət sayına çatdın ({MAX_PER_CLIENT}). Köhnələrini sil.",
        )

    data = payload.model_dump()
    if data["applied_date"] is None:
        data["applied_date"] = datetime.now(timezone.utc).date()

    record = ApplicationRecord(client_id=client_id, **data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return _out(record)


@router.patch("/{application_id}", response_model=ApplicationOut)
def update_application(
    application_id: int,
    payload: ApplicationUpdate,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    record = _get_own(db, client_id, application_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return _out(record)


@router.delete("/{application_id}")
def delete_application(
    application_id: int,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    record = _get_own(db, client_id, application_id)
    db.delete(record)
    db.commit()
    return {"deleted": application_id}
