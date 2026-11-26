from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import AnalysisRecord, RoadmapCompletion, RoadmapRecord
from app.deps import get_client_id
from app.models.schemas import CompletionUpdate, EvaluationResponse, RoadmapResponse
from app.services.ai_analyzer import AIAnalysisError
from app.services.roadmap import build_response, generate_roadmap_plan, read_plan

router = APIRouter(prefix="/api/roadmap", tags=["Roadmap"])


def _load_evaluation(db: Session, client_id: str, evaluation_id: int) -> EvaluationResponse:
    record = db.scalar(
        select(AnalysisRecord).where(
            AnalysisRecord.id == evaluation_id,
            AnalysisRecord.client_id == client_id,
            AnalysisRecord.kind == "evaluation",
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Qiymətləndirmə tapılmadı.")
    try:
        return EvaluationResponse.model_validate_json(record.result_json)
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


def saved_response(db: Session, evaluation_id: int, evaluation: EvaluationResponse,
                   record: RoadmapRecord | None) -> RoadmapResponse:
    if record is None:
        return build_response(evaluation_id, evaluation, None)
    completed = list(db.scalars(select(RoadmapCompletion.task_id).where(
        RoadmapCompletion.roadmap_id == record.id,
    ).order_by(RoadmapCompletion.task_id)))
    return build_response(evaluation_id, evaluation, read_plan(record.llm_json), completed)


@router.get("/{evaluation_id}", response_model=RoadmapResponse)
def get_roadmap(
    evaluation_id: int,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    evaluation = _load_evaluation(db, client_id, evaluation_id)
    return saved_response(db, evaluation_id, evaluation, _find_record(db, client_id, evaluation_id))


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
    evaluation = _load_evaluation(db, client_id, evaluation_id)
    existing = saved_response(db, evaluation_id, evaluation, _find_record(db, client_id, evaluation_id))
    if existing.generated:
        return existing
    db.rollback()
    try:
        llm = await generate_roadmap_plan(evaluation)
    except AIAnalysisError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    # Lock the SQLite writer before checking for a plan made by a concurrent request.
    cursor = db.execute(update(AnalysisRecord).where(
        AnalysisRecord.id == evaluation_id, AnalysisRecord.client_id == client_id,
    ).values(id=AnalysisRecord.id))
    if not cursor.rowcount:
        raise HTTPException(404, "Qiymətləndirmə tapılmadı.")
    record = _find_record(db, client_id, evaluation_id)
    if record and read_plan(record.llm_json):
        return saved_response(db, evaluation_id, evaluation, record)
    if record:
        record.llm_json = llm.model_dump_json()
    else:
        db.add(
            RoadmapRecord(
                client_id=client_id,
                evaluation_id=evaluation_id,
                llm_json=llm.model_dump_json(),
            )
        )
    db.commit()
    return build_response(evaluation_id, evaluation, llm)


@router.put("/{evaluation_id}/tasks/{task_id}", response_model=RoadmapResponse)
def set_completion(evaluation_id: int, task_id: str, payload: CompletionUpdate,
                   client_id: str = Depends(get_client_id), db: Session = Depends(get_db)):
    # Serialize progress updates with history deletion before resolving ownership and task IDs.
    db.execute(update(AnalysisRecord).where(
        AnalysisRecord.id == evaluation_id, AnalysisRecord.client_id == client_id,
    ).values(id=AnalysisRecord.id))
    evaluation = _load_evaluation(db, client_id, evaluation_id)
    record = _find_record(db, client_id, evaluation_id)
    response = saved_response(db, evaluation_id, evaluation, record)
    task_ids = {f"{phase.key}-{i}" for phase in response.roadmap for i in range(len(phase.tasks))}
    if record is None or task_id not in task_ids:
        raise HTTPException(404, "Tapşırıq tapılmadı.")
    if payload.completed:
        db.execute(insert(RoadmapCompletion).values(roadmap_id=record.id, task_id=task_id).on_conflict_do_nothing())
    else:
        db.execute(delete(RoadmapCompletion).where(
            RoadmapCompletion.roadmap_id == record.id, RoadmapCompletion.task_id == task_id,
        ))
    result = saved_response(db, evaluation_id, evaluation, record)
    db.commit()
    return result
