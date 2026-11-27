from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import AnalysisRecord, RoadmapCompletion, RoadmapRecord
from app.deps import get_client_id
from app.models.schemas import (
    CompletionUpdate, EvaluationResponse, LegacyRoadmapOutput, RoadmapLLMOutput, RoadmapResponse,
)
from app.services.roadmap import build_response, generate_roadmap_plan, read_plan

router = APIRouter(prefix="/api/roadmap", tags=["Roadmap"])
EVALUATION_NOT_FOUND = "Qiymətləndirmə tapılmadı."


def load_evaluation(db: Session, client_id: str, evaluation_id: int) -> EvaluationResponse:
    raw = db.scalar(select(AnalysisRecord.result_json).where(
        AnalysisRecord.id == evaluation_id,
        AnalysisRecord.client_id == client_id,
        AnalysisRecord.kind == "evaluation",
    ))
    if raw is None:
        raise HTTPException(404, EVALUATION_NOT_FOUND)
    try:
        return EvaluationResponse.model_validate_json(raw)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Bu qiymətləndirmənin formatı köhnədir. CV-ni yenidən analiz et.",
        )


def _find_record(db: Session, client_id: str, evaluation_id: int) -> RoadmapRecord | None:
    return db.scalar(
        select(RoadmapRecord).where(
            RoadmapRecord.client_id == client_id,
            RoadmapRecord.evaluation_id == evaluation_id,
        ).order_by(RoadmapRecord.id.desc()).limit(1)
    )


def _completed_ids(db: Session, roadmap_id: int) -> list[str]:
    return list(db.scalars(select(RoadmapCompletion.task_id).where(
        RoadmapCompletion.roadmap_id == roadmap_id,
    ).order_by(RoadmapCompletion.task_id)))


def _saved_response(db: Session, evaluation: EvaluationResponse, record: RoadmapRecord,
                    plan: RoadmapLLMOutput | LegacyRoadmapOutput | None = None) -> RoadmapResponse:
    if plan is None:
        plan = read_plan(record.llm_json)
    return build_response(record.evaluation_id, evaluation, plan, _completed_ids(db, record.id))


def load_saved_roadmap(db: Session, client_id: str, evaluation_id: int,
                       evaluation: EvaluationResponse) -> RoadmapResponse:
    record = _find_record(db, client_id, evaluation_id)
    if record is None:
        return build_response(evaluation_id, evaluation, None)
    return _saved_response(db, evaluation, record)


@router.get("/{evaluation_id}", response_model=RoadmapResponse)
def get_roadmap(
    evaluation_id: int,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    evaluation = load_evaluation(db, client_id, evaluation_id)
    return load_saved_roadmap(db, client_id, evaluation_id, evaluation)


@router.post("/{evaluation_id}", response_model=RoadmapResponse)
async def create_roadmap(
    evaluation_id: int,
    request: Request,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    bind = db.get_bind()
    db.rollback()

    async def generate() -> RoadmapResponse:
        with Session(bind=bind) as writer:
            return await _generate_roadmap(writer, client_id, evaluation_id)

    return await request.app.state.roadmaps.run((bind, client_id, evaluation_id), generate)


async def _generate_roadmap(db: Session, client_id: str, evaluation_id: int) -> RoadmapResponse:
    evaluation = load_evaluation(db, client_id, evaluation_id)
    record = _find_record(db, client_id, evaluation_id)
    if record is not None and (plan := read_plan(record.llm_json)) is not None:
        return _saved_response(db, evaluation, record, plan)
    db.rollback()
    llm = await generate_roadmap_plan(evaluation)

    # Lock the SQLite writer before checking for a plan made by a concurrent request.
    _lock_evaluation(db, client_id, evaluation_id)
    record = _find_record(db, client_id, evaluation_id)
    if record is not None and (plan := read_plan(record.llm_json)) is not None:
        return _saved_response(db, evaluation, record, plan)
    if record is None:
        record = RoadmapRecord(client_id=client_id, evaluation_id=evaluation_id)
        db.add(record)
    record.llm_json = llm.model_dump_json()
    db.commit()
    return build_response(evaluation_id, evaluation, llm)


def _lock_evaluation(db: Session, client_id: str, evaluation_id: int) -> None:
    cursor = db.execute(update(AnalysisRecord).where(
        AnalysisRecord.id == evaluation_id,
        AnalysisRecord.client_id == client_id,
        AnalysisRecord.kind == "evaluation",
    ).values(id=AnalysisRecord.id))
    if not cursor.rowcount:
        raise HTTPException(404, EVALUATION_NOT_FOUND)


@router.put("/{evaluation_id}/tasks/{task_id}", response_model=RoadmapResponse)
def set_completion(evaluation_id: int, task_id: str, payload: CompletionUpdate,
                   client_id: str = Depends(get_client_id), db: Session = Depends(get_db)):
    # Serialize progress updates with history deletion before resolving ownership and task IDs.
    _lock_evaluation(db, client_id, evaluation_id)
    evaluation = load_evaluation(db, client_id, evaluation_id)
    record = _find_record(db, client_id, evaluation_id)
    if record is None:
        raise HTTPException(404, "Tapşırıq tapılmadı.")
    response = build_response(evaluation_id, evaluation, read_plan(record.llm_json))
    task_ids = {f"{phase.key}-{i}" for phase in response.roadmap for i in range(len(phase.tasks))}
    if task_id not in task_ids:
        raise HTTPException(404, "Tapşırıq tapılmadı.")
    if payload.completed:
        db.execute(insert(RoadmapCompletion).values(roadmap_id=record.id, task_id=task_id).on_conflict_do_nothing())
    else:
        db.execute(delete(RoadmapCompletion).where(
            RoadmapCompletion.roadmap_id == record.id, RoadmapCompletion.task_id == task_id,
        ))
    response.completed_task_ids = _completed_ids(db, record.id)
    db.commit()
    return response
