import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import AnalysisRecord, User
from app.deps import current_user
from app.models.schemas import MentorReply, MentorRequest
from app.routers.profile import load_profile
from app.routers.roadmap import _find_record, _load_evaluation, saved_response
from app.services.ai_analyzer import AIAnalysisError, generate_structured
from app.services.matcher import ROLES

router = APIRouter(prefix="/api/mentor", tags=["Mentor"])
PROMPT = (Path(__file__).resolve().parents[1] / "prompts" / "mentor.txt").read_text(encoding="utf-8")


@router.post("", response_model=MentorReply)
async def ask_mentor(payload: MentorRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    profile = load_profile(db, user.id)
    client_id = f"user-{user.id}"
    evaluation_id = payload.evaluation_id
    if evaluation_id is None:
        query = select(AnalysisRecord.id).where(
            AnalysisRecord.client_id == client_id, AnalysisRecord.kind == "evaluation",
        )
        if profile.field_id:
            query = query.where(AnalysisRecord.field_id == profile.field_id)
        evaluation_id = db.scalar(query.order_by(AnalysisRecord.id.desc()).limit(1))

    specialty = ROLES.get(profile.field_id, {})
    context = {
        "profile": {
            "field": specialty.get("name"),
            "role": specialty.get("role"),
            "education": profile.education,
            "interests": profile.interests,
            "skills": profile.skills,
        },
    }
    if evaluation_id is not None:
        evaluation = _load_evaluation(db, client_id, evaluation_id)
        plan = saved_response(db, evaluation_id, evaluation, _find_record(db, client_id, evaluation_id))
        context["evaluation"] = {
            "field": evaluation.field_name,
            "categories": {item.key: item.score for item in evaluation.categories},
            "skills": [{"skill": gap.skill, "status": gap.status, "tier": gap.tier}
                       for gap in plan.career_gap.skills[:24]],
        }
        checked = set(plan.completed_task_ids)
        phases = []
        for phase in plan.roadmap:
            pending = [task for index, task in enumerate(phase.tasks)
                       if f"{phase.key}-{index}" not in checked]
            first = pending[0] if pending else None
            phases.append({
                "name": phase.label,
                "days": phase.days,
                "total": len(phase.tasks),
                "completed": len(phase.tasks) - len(pending),
                # Saved plan text may contain a model-quoted excerpt; send timing only.
                "next_period": getattr(first, "day", None) or getattr(first, "week", None),
            })
        context["plan"] = {
            "format": plan.format,
            "phases": phases,
        }
    db.rollback()
    contents = json.dumps({
        "context": context, "history": [turn.model_dump() for turn in payload.history],
        "question": payload.question,
    }, ensure_ascii=False)
    try:
        return await generate_structured(PROMPT, contents, MentorReply)
    except AIAnalysisError as error:
        raise HTTPException(error.status_code, str(error)) from error
