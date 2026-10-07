import json
from pathlib import Path

from app.models.schemas import (
    FieldInfo,
    MatchLLMOutput,
    MatchResponse,
    SkillCheck,
)
from app.services.ai_analyzer import MAX_CV_CHARS, generate_structured

APP_DIR = Path(__file__).resolve().parent.parent
ROLES_DIR = APP_DIR / "data" / "roles"
MATCH_PROMPT = (APP_DIR / "prompts" / "match_role.txt").read_text(encoding="utf-8")

STATUS_SCORE = {"has": 1.0, "partial": 0.5, "missing": 0.0}


def _load_roles() -> dict[str, dict]:
    roles = {}
    for path in sorted(ROLES_DIR.glob("*.json")):
        role = json.loads(path.read_text(encoding="utf-8"))
        roles[role["id"]] = role
    return roles


# Serverin başlanğıcında bir dəfə yüklənir. İstifadəçinin göndərdiyi field_id
# yalnız bu lüğətdə axtarılır (fayl yolu kimi istifadə olunmur, təhlükəsizlikdir).
ROLES = _load_roles()


def list_fields() -> list[FieldInfo]:
    return [
        FieldInfo(id=r["id"], name=r["name"], level=r["level"], description=r["description"])
        for r in ROLES.values()
    ]


def _align(expected: list[str], checks: list[SkillCheck]) -> list[SkillCheck]:
    """AI hansısa bacarığı buraxsa və ya adını dəyişsə də, nəticə rol faylı ilə eyni olsun."""
    by_name = {c.skill.strip().lower(): c for c in checks}
    aligned = []
    for skill in expected:
        found = by_name.get(skill.strip().lower())
        if found:
            aligned.append(SkillCheck(skill=skill, status=found.status, evidence=found.evidence))
        else:
            aligned.append(SkillCheck(skill=skill, status="missing", evidence=""))
    return aligned


def _ratio(checks: list[SkillCheck]) -> float:
    if not checks:
        return 1.0
    return sum(STATUS_SCORE[c.status] for c in checks) / len(checks)


def compute_score(required: list[SkillCheck], preferred: list[SkillCheck]) -> int:
    """Tələb olunan bacarıqlar 75%, arzuolunanlar 25% çəki ilə."""
    return round(100 * (0.75 * _ratio(required) + 0.25 * _ratio(preferred)))


def readiness_for(score: int) -> str:
    if score >= 75:
        return "ready"
    if score >= 50:
        return "almost_ready"
    return "needs_work"


async def match_cv(cv_text: str, field_id: str, filename: str, pages: int) -> MatchResponse:
    role = ROLES[field_id]

    role_block = json.dumps(
        {
            "name": role["name"],
            "level": role["level"],
            "required_skills": role["required_skills"],
            "preferred_skills": role["preferred_skills"],
        },
        ensure_ascii=False,
        indent=2,
    )
    contents = (
        f"<role>\n{role_block}\n</role>\n\n"
        f"<cv>\n{cv_text[:MAX_CV_CHARS]}\n</cv>\n\n"
        "CV-ni yuxarıdakı sahənin tələbləri ilə müqayisə et."
    )

    llm = await generate_structured(MATCH_PROMPT, contents, MatchLLMOutput)

    required = _align(role["required_skills"], llm.required)
    preferred = _align(role["preferred_skills"], llm.preferred)
    score = compute_score(required, preferred)

    return MatchResponse(
        filename=filename,
        pages=pages,
        field_id=field_id,
        field_name=role["name"],
        match_score=score,
        readiness=readiness_for(score),
        required_skills=required,
        preferred_skills=preferred,
        summary=llm.summary,
        action_plan=llm.action_plan,
    )