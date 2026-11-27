import json

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import AnalysisRecord, MentorMessage, User
from app.deps import current_user
from app.models.schemas import MentorReply, MentorRequest, MentorTurn
from app.routers.profile import load_profile
from app.routers.roadmap import load_evaluation, load_saved_roadmap
from app.services.ai_analyzer import define_task, generate_structured
from app.services.matcher import ROLES

router = APIRouter(prefix="/api/mentor", tags=["Mentor"])
MENTOR = define_task("mentor", "mentor.txt", MentorReply)


def _history(db: Session, user_id: int, limit: int) -> list[MentorTurn]:
    recent = db.scalars(select(MentorMessage).where(MentorMessage.user_id == user_id)
                        .order_by(MentorMessage.id.desc()).limit(limit)).all()
    return [MentorTurn(question=row.question, answer=row.answer) for row in reversed(recent)]


@router.get("/history", response_model=list[MentorTurn])
def mentor_history(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return _history(db, user.id, 50)


@router.post("", response_model=MentorReply)
async def ask_mentor(payload: MentorRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user_id = user.id
    profile = load_profile(db, user_id)
    client_id = f"user-{user_id}"
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
        evaluation = load_evaluation(db, client_id, evaluation_id)
        plan = load_saved_roadmap(db, client_id, evaluation_id, evaluation)
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
    history = _history(db, user_id, 3)
    db.rollback()
    contents = json.dumps({
        "context": context, "history": [turn.model_dump() for turn in history],
        "question": payload.question,
    }, ensure_ascii=False)
    reply = await generate_structured(MENTOR, contents)
    db.add(MentorMessage(user_id=user_id, question=payload.question, answer=reply.answer))
    db.commit()
    return reply
