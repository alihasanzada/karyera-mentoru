from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import AnalysisRecord, RoadmapRecord
from app.deps import get_client_id
from app.models.schemas import EvaluationResponse, RoadmapLLMOutput, RoadmapResponse
from app.services.ai_analyzer import AIAnalysisError
from app.services.roadmap import build_response, generate_roadmap_plan

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
        )
    )


@router.get("/{evaluation_id}", response_model=RoadmapResponse)
def get_roadmap(
    evaluation_id: int,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    evaluation = _load_evaluation(db, client_id, evaluation_id)
    record = _find_record(db, client_id, evaluation_id)
    llm = None
    if record:
        try:
            llm = RoadmapLLMOutput.model_validate_json(record.llm_json)
        except ValueError:
            llm = None
    return build_response(evaluation_id, evaluation, llm)


@router.post("/{evaluation_id}", response_model=RoadmapResponse)
async def create_roadmap(
    evaluation_id: int,
    client_id: str = Depends(get_client_id),
    db: Session = Depends(get_db),
):
    evaluation = _load_evaluation(db, client_id, evaluation_id)
    try:
        llm = await generate_roadmap_plan(evaluation)
    except AIAnalysisError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    record = _find_record(db, client_id, evaluation_id)
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