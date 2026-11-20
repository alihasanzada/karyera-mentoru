import json
from pathlib import Path

from app.models.schemas import (
    CareerGap,
    EvaluationResponse,
    GapInsight,
    GapSkill,
    LegacyPhasePlan,
    LegacyRoadmapOutput,
    PhasePlan,
    RoadmapLLMOutput,
    RoadmapPhaseResult,
    RoadmapResponse,
    SkillCheck,
)
from app.services.ai_analyzer import generate_structured
from app.services.matcher import ROLES, STATUS_SCORE

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "roadmap.txt"
ROADMAP_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")

# 21-day plan in three 7-day phases, so the plan can be shown as 7, 14 or 21 days.
# key -> (label, day range, first day, last day)
PHASES = {
    "foundation": ("Əsaslar", "1-7", 1, 7),
    "practice": ("Təcrübə", "8-14", 8, 14),
    "interview": ("Müsahibəyə hazırlıq", "15-21", 15, 21),
}

LEGACY_PHASES = {
    "foundation": ("1-30", 1, 4),
    "practice": ("31-60", 5, 8),
    "interview": ("61-90", 9, 13),
}


def read_plan(raw: str) -> RoadmapLLMOutput | LegacyRoadmapOutput | None:
    for schema in (RoadmapLLMOutput, LegacyRoadmapOutput):
        try:
            return schema.model_validate_json(raw)
        except ValueError:
            continue
    return None


def _coverage(checks: list[SkillCheck]) -> int:
    if not checks:
        return 100
    return round(100 * sum(STATUS_SCORE[c.status] for c in checks) / len(checks))


def _priority(tier: str, status: str) -> str | None:
    if status == "has":
        return None
    if tier == "required":
        return "critical" if status == "missing" else "important"
    return "nice_to_have"


def build_career_gap(evaluation: EvaluationResponse, insights: list[GapInsight]) -> CareerGap:
    by_name = {g.skill.strip().lower(): g for g in insights}
    match = evaluation.match
    tiers = (("required", match.required_skills), ("preferred", match.preferred_skills))

    skills = []
    for tier, checks in tiers:
        for c in checks:
            insight = by_name.get(c.skill.strip().lower()) if c.status != "has" else None
            skills.append(
                GapSkill(
                    skill=c.skill,
                    tier=tier,
                    status=c.status,
                    evidence=c.evidence,
                    priority=_priority(tier, c.status),
                    why_it_matters=insight.why_it_matters if insight else "",
                    resources=insight.resources if insight else [],
                )
            )
    return CareerGap(
        required_coverage=_coverage(match.required_skills),
        preferred_coverage=_coverage(match.preferred_skills),
        skills=skills,
    )


def _phase(key: str, plan: PhasePlan) -> RoadmapPhaseResult:
    label, days, first, last = PHASES[key]
    # keep the model's days inside the phase range
    tasks = sorted(
        (t.model_copy(update={"day": max(first, min(last, t.day))}) for t in plan.tasks),
        key=lambda t: t.day,
    )
    return RoadmapPhaseResult(
        key=key, label=label, days=days, goal=plan.goal, milestone=plan.milestone, tasks=tasks
    )


def _legacy_phase(key: str, plan: LegacyPhasePlan) -> RoadmapPhaseResult:
    days, first, last = LEGACY_PHASES[key]
    tasks = sorted(
        (t.model_copy(update={"week": max(first, min(last, t.week))}) for t in plan.tasks),
        key=lambda task: task.week,
    )
    return RoadmapPhaseResult(
        key=key, label=PHASES[key][0], days=days, goal=plan.goal, milestone=plan.milestone, tasks=tasks,
    )


def build_response(
    evaluation_id: int, evaluation: EvaluationResponse,
    llm: RoadmapLLMOutput | LegacyRoadmapOutput | None,
    completed: list[str] | None = None,
) -> RoadmapResponse:
    legacy = isinstance(llm, LegacyRoadmapOutput)
    renderer = _legacy_phase if legacy else _phase
    return RoadmapResponse(
        evaluation_id=evaluation_id,
        field_id=evaluation.field_id,
        field_name=evaluation.field_name,
        generated=llm is not None,
        summary=llm.summary if llm else "",
        career_gap=build_career_gap(evaluation, llm.gaps if llm else []),
        roadmap=(
            [renderer(key, getattr(llm, key)) for key in PHASES]
            if llm
            else []
        ),
        format="legacy_weekly" if legacy else "daily",
        completed_task_ids=completed or [],
    )


async def generate_roadmap_plan(evaluation: EvaluationResponse) -> RoadmapLLMOutput:
    match = evaluation.match
    tiers = (("required", match.required_skills), ("preferred", match.preferred_skills))
    specialty = ROLES.get(evaluation.field_id, {})
    payload = {
        "field": evaluation.field_name,
        "role": specialty.get("role"),
        "level": specialty.get("level", "Junior"),
        "skills_to_close": [
            {"skill": c.skill, "tier": tier, "status": c.status}
            for tier, checks in tiers
            for c in checks
            if c.status != "has"
        ],
        "skills_already_have": [c.skill for _, checks in tiers for c in checks if c.status == "has"],
        "cv_quality": [
            {"category": c.label, "score": c.score, "issues": c.issues}
            for c in evaluation.categories
            if c.key != "field_fit"
        ],
    }
    contents = f"<profile>\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n</profile>\n\nHazırla."
    return await generate_structured(ROADMAP_PROMPT, contents, RoadmapLLMOutput)
