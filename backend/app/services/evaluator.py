import asyncio
import json
from pathlib import Path
import re

from app.models.schemas import (
    CategoryResult,
    EvaluationLLMOutput,
    EvaluationResponse,
    MatchResponse,
    ScoreCategory,
)
from app.services.ai_analyzer import MAX_CV_CHARS, generate_structured
from app.services.matcher import ROLES, match_cv, readiness_for

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "evaluate_cv.txt"
EVAL_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")

LABELS = {
    "structure": "CV Strukturu və Formatlaşdırma",
    "ats": "ATS Uyğunluğu",
    "impact": "Təcrübə və Nailiyyətlərin Metrikası",
    "field_fit": "Hədəf Sahə/Bazar Bacarıqlarına Uyğunluq",
}


def _clamp(n: int) -> int:
    return max(0, min(100, int(n)))


def compute_overall(scores: list[int]) -> int:
    """Overall score: average of category scores."""
    return round(sum(scores) / len(scores)) if scores else 0


def _from_llm(key: str, cat: ScoreCategory) -> CategoryResult:
    return CategoryResult(
        key=key,
        label=LABELS[key],
        score=_clamp(cat.score),
        reasoning=_clean_text(cat.reasoning),
        positives=_clean_items(cat.positives),
        issues=_clean_items(cat.issues),
        fixes=_clean_items(cat.fixes),
    )


def field_fit_category(match: MatchResponse) -> CategoryResult:
    """Category 4: Not AI; calculated via code based on matcher results."""
    req, pref = match.required_skills, match.preferred_skills
    r_has = sum(c.status == "has" for c in req)
    r_part = sum(c.status == "partial" for c in req)
    p_has = sum(c.status == "has" for c in pref)

    reasoning = (
        f"Tələb olunan {len(req)} bacarıqdan {r_has}-i tam, {r_part}-i qismən tapıldı. "
        f"Arzuolunan {len(pref)} bacarıqdan {p_has}-i tam tapıldı. "
        "Bal hesablanarkən tələb olunanlar 75%, arzuolunanlar 25% çəki daşıyır."
    )
    positives = [c.skill for c in req + pref if c.status == "has"][:6]
    issues = (
        [f"Çatışmır: {c.skill}" for c in req if c.status == "missing"]
        + [f"Qismən: {c.skill}" for c in req if c.status == "partial"]
        + [f"Arzuolunan çatışmır: {c.skill}" for c in pref if c.status == "missing"]
    )[:6]
    fixes = [step.title for step in match.action_plan][:3]

    return CategoryResult(
        key="field_fit",
        label=LABELS["field_fit"],
        score=_clamp(match.match_score),
        reasoning=reasoning,
        positives=positives,
        issues=issues,
        fixes=fixes,
    )

ARTIFACT_HINTS = (
    "avtomatik mətn", "mətn çıxar", "çıxarılma", "çıxarılarkən", "skan zamanı",
    "səhifə nömrə", "səhifə 1", "sənəd sonu", "vizual olaraq mətn daxilində",
    "ardıcıllığı qarış", "səhv yerləş", "xülasənin içinə düş",
)


def _is_artifact(text: str) -> bool:
    low = text.lower()
    return any(h in low for h in ARTIFACT_HINTS)


def _clean_items(items: list[str]) -> list[str]:
    return [i for i in items if not _is_artifact(i)]


def _clean_text(text: str) -> str:
    """Remove sentences referring to extraction errors (if all are removed, keep the original)."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    kept = [s for s in sentences if not _is_artifact(s)]
    return " ".join(kept) if kept else text

async def evaluate_cv(
    cv_text: str, field_id: str, filename: str, pages: int
) -> EvaluationResponse:
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
        "CV-ni yuxarıdakı qaydalara görə qiymətləndir."
    )

    # Two inquiries are proceeding in parallel: AI assessment and industry benchmarking
    results = await asyncio.gather(
        generate_structured(EVAL_PROMPT, contents, EvaluationLLMOutput),
        match_cv(cv_text, field_id, filename, pages),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, BaseException):
            raise r
    llm, match = results

    categories = [
        _from_llm("structure", llm.structure),
        _from_llm("ats", llm.ats),
        _from_llm("impact", llm.impact),
        field_fit_category(match),
    ]
    overall = compute_overall([c.score for c in categories])

    return EvaluationResponse(
        filename=filename,
        pages=pages,
        field_id=field_id,
        field_name=role["name"],
        overall_score=overall,
        readiness=readiness_for(overall),
        summary=_clean_text(llm.summary),
        categories=categories,
        detected_skills=llm.detected_skills,
        strengths=_clean_items(llm.strengths),
        weaknesses=_clean_items(llm.weaknesses),
        recommendations=[
            r for r in llm.recommendations
            if not (_is_artifact(r.title) or _is_artifact(r.details))
        ],
        match=match,
    )