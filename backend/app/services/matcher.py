import json
from pathlib import Path

from app.models.schemas import FieldInfo, MatchLLMOutput, MatchResponse, SkillCheck
from app.services.ai_analyzer import MAX_CV_CHARS, generate_structured
from app.services.rubric import norm, quote_supported

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


ROLES = _load_roles()


def list_fields() -> list[FieldInfo]:
    return [
        FieldInfo(id=r["id"], name=r["name"], level=r["level"], description=r["description"])
        for r in ROLES.values()
    ]


def _verify(status: str, evidence: str, cv_tokens: set[str]) -> tuple[str, str]:
    """A verdict without a quote found in the CV is downgraded by one level."""
    if status == "missing":
        return "missing", ""
    if quote_supported(evidence, cv_tokens):
        return status, evidence.strip()
    return ("partial" if status == "has" else "missing"), ""


def _align(expected: list[str], checks: list[SkillCheck], cv_tokens: set[str]) -> list[SkillCheck]:
    by_name = {c.skill.strip().lower(): c for c in checks}
    aligned = []
    for skill in expected:
        found = by_name.get(skill.strip().lower())
        if not found:
            aligned.append(SkillCheck(skill=skill, status="missing", evidence=""))
            continue
        status, evidence = _verify(found.status, found.evidence, cv_tokens)
        aligned.append(SkillCheck(skill=skill, status=status, evidence=evidence))
    return aligned


def _ratio(checks: list[SkillCheck]) -> float:
    if not checks:
        return 1.0
    return sum(STATUS_SCORE[c.status] for c in checks) / len(checks)


def compute_score(required: list[SkillCheck], preferred: list[SkillCheck]) -> int:
    """Required skills weigh 75%, preferred skills 25%."""
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

    cv_tokens = set(norm(cv_text).split())
    required = _align(role["required_skills"], llm.required, cv_tokens)
    preferred = _align(role["preferred_skills"], llm.preferred, cv_tokens)
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