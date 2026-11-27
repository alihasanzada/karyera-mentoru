import json
from pathlib import Path

from app.models.schemas import FieldInfo, MatchLLMOutput, MatchResponse, SkillCheck
from app.services.ai_analyzer import MAX_CV_CHARS, define_task, encode_context, generate_structured
from app.services.rubric import norm, quote_supported

APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
ROLE_MATCH = define_task("role_match", "match_role.txt", MatchLLMOutput)

STATUS_SCORE = {"has": 1.0, "partial": 0.5, "missing": 0.0}


def _role_title(specialty: str, profile: dict) -> str:
    # "Fizika müəllimliyi" -> "Fizika müəllimi" (same rule as the site)
    if specialty.endswith("müəllimliyi"):
        return specialty.removesuffix("müəllimliyi") + "müəllimi"
    return profile["role"]


def _load_roles() -> dict[str, dict]:
    """One entry per specialty: specialties.json links each to a skill profile."""
    profiles = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in sorted((DATA_DIR / "profiles").glob("*.json"))
    }
    groups = json.loads((DATA_DIR / "specialties.json").read_text(encoding="utf-8"))
    roles = {}
    for g in groups:
        for item in g["items"]:
            profile = profiles[item["profile"]]
            roles[item["id"]] = {
                **profile,
                "id": item["id"],
                "name": item["name"],
                "group": g["group"],
                "role": _role_title(item["name"], profile),
            }
    return roles


ROLES = _load_roles()


def list_fields() -> list[FieldInfo]:
    return [
        FieldInfo(id=r["id"], name=r["name"], group=r["group"], role=r["role"],
                  level=r["level"], description=r["description"])
        for r in ROLES.values()
    ]


def _verify(status: str, evidence: str, normalized_cv: str) -> tuple[str, str]:
    """A verdict without a quote found in the CV is downgraded by one level."""
    if status == "missing":
        return "missing", ""
    if quote_supported(evidence, normalized_cv):
        return status, evidence.strip()
    return ("partial" if status == "has" else "missing"), ""


def _align(expected: list[str], checks: list[SkillCheck], normalized_cv: str) -> list[SkillCheck]:
    by_name = {c.skill.strip().lower(): c for c in checks}
    aligned = []
    for skill in expected:
        found = by_name.get(skill.strip().lower())
        if not found:
            aligned.append(SkillCheck(skill=skill, status="missing", evidence=""))
            continue
        status, evidence = _verify(found.status, found.evidence, normalized_cv)
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

    contents = encode_context({
        "role": {
            "specialty": role["name"],
            "position": role["role"],
            "level": role["level"],
            "required_skills": role["required_skills"],
            "preferred_skills": role["preferred_skills"],
        },
        "cv": cv_text[:MAX_CV_CHARS],
    })
    llm = await generate_structured(ROLE_MATCH, contents)

    visible_text = norm(cv_text[:MAX_CV_CHARS])
    required = _align(role["required_skills"], llm.required, visible_text)
    preferred = _align(role["preferred_skills"], llm.preferred, visible_text)
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
