import asyncio
import json
import re
from dataclasses import dataclass
from pathlib import Path

from app.models.schemas import (
    CategoryResult,
    CriterionResult,
    EvaluationLLMOutput,
    EvaluationResponse,
    MatchResponse,
    Recommendation,
)
from app.services.ai_analyzer import MAX_CV_CHARS, generate_structured
from app.services.matcher import ROLES, match_cv, readiness_for
from app.services.rubric import (
    CRITERIA,
    Criterion,
    has_phrase,
    norm,
    quote_supported,
    run_code_checks,
)

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "evaluate_cv.txt"
EVAL_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")

LABELS = {
    "structure": "CV Strukturu və Formatlaşdırma",
    "ats": "ATS Uyğunluğu",
    "impact": "Təcrübə və Nailiyyətlərin Metrikası",
    "field_fit": "Hədəf Sahə/Bazar Bacarıqlarına Uyğunluq",
}

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
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    kept = [s for s in sentences if not _is_artifact(s)]
    return " ".join(kept) if kept else text


def _clamp(n: int) -> int:
    return max(0, min(100, int(n)))


def compute_overall(scores: list[int]) -> int:
    return round(sum(scores) / len(scores)) if scores else 0


def career_score(match_score: int, quality_scores: list[int]) -> int:
    """Role fit is the foundation; CV quality adjusts it by at most 30%."""
    quality = compute_overall(quality_scores)
    return _clamp(round(match_score * (0.7 + 0.3 * quality / 100)))


@dataclass
class Scored:
    criterion: Criterion
    ratio: float
    evidence: str = ""
    fix_extra: str = ""

    @property
    def status(self) -> str:
        if self.ratio >= 0.999:
            return "has"
        return "partial" if self.ratio > 0 else "missing"

    @property
    def fix_text(self) -> str:
        return f"{self.criterion.fix} {self.fix_extra}".strip()

    @property
    def lost(self) -> float:
        return self.criterion.weight * (1 - self.ratio)


def _verdict_ratio(verdict, cv_tokens: set[str]) -> tuple[float, str]:
    if verdict is None or verdict.status == "no":
        return 0.0, ""
    ratio = 1.0 if verdict.status == "yes" else 0.5
    if quote_supported(verdict.quote, cv_tokens):
        return ratio, verdict.quote.strip()
    return (0.5 if ratio == 1.0 else 0.0), ""


def _build_category(key: str, items: list[Scored]) -> CategoryResult:
    total = sum(i.criterion.weight for i in items)
    score = _clamp(round(100 * sum(i.criterion.weight * i.ratio for i in items) / total)) if total else 0
    full = [i for i in items if i.status == "has"]
    partial = [i for i in items if i.status == "partial"]
    missing = [i for i in items if i.status == "missing"]
    weak = sorted((i for i in items if i.ratio < 0.999), key=lambda i: i.lost, reverse=True)
    strong = sorted(full, key=lambda i: i.criterion.weight, reverse=True)

    return CategoryResult(
        key=key,
        label=LABELS[key],
        score=score,
        reasoning=(
            f"{len(full)} meyar tam, {len(partial)} meyar qismən ödənilib, {len(missing)} meyar ödənilməyib. "
            "Bal meyarların çəkisinə görə hesablanır."
        ),
        positives=[i.criterion.label for i in strong[:6]],
        issues=[i.criterion.label for i in weak[:6]],
        fixes=[i.fix_text for i in weak[:4]],
        criteria=[
            CriterionResult(
                id=i.criterion.id,
                label=i.criterion.label,
                status=i.status,
                weight=i.criterion.weight,
                evidence=i.evidence,
            )
            for i in items
        ],
    )


def field_fit_category(match: MatchResponse) -> CategoryResult:
    """Fourth category: computed from the matcher result, not by the AI."""
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
    criteria = [
        CriterionResult(id=f"field_{i}", label=c.skill, status=c.status, evidence=c.evidence)
        for i, c in enumerate(req + pref)
    ]

    return CategoryResult(
        key="field_fit",
        label=LABELS["field_fit"],
        score=_clamp(match.match_score),
        reasoning=reasoning,
        positives=positives,
        issues=issues,
        fixes=fixes,
        criteria=criteria,
    )


def assemble_evaluation(
    cv_text: str,
    field_id: str,
    filename: str,
    pages: int,
    llm: EvaluationLLMOutput,
    match: MatchResponse,
) -> EvaluationResponse:
    """Pure function: identical inputs always produce identical output."""
    role = ROLES[field_id]
    code = run_code_checks(cv_text, pages, role.get("ats_keywords", []))
    n_text = norm(cv_text)
    cv_tokens = set(n_text.split())
    verdicts = {v.id: v for v in llm.verdicts}

    scored: list[Scored] = []
    for c in CRITERIA:
        if c.kind == "code":
            chk = code[c.id]
            scored.append(Scored(c, chk.ratio, chk.evidence, chk.fix_extra))
        else:
            ratio, evidence = _verdict_ratio(verdicts.get(c.id), cv_tokens)
            scored.append(Scored(c, ratio, evidence))

    categories = [
        _build_category(key, [s for s in scored if s.criterion.category == key])
        for key in ("structure", "ats", "impact")
    ]
    categories.append(field_fit_category(match))
    overall = career_score(match.match_score, [c.score for c in categories[:3]])

    strong = sorted((s for s in scored if s.status == "has"), key=lambda s: s.criterion.weight, reverse=True)
    weak = sorted((s for s in scored if s.ratio < 0.999), key=lambda s: s.lost, reverse=True)

    recommendations = []
    for s in weak[:4]:
        priority = "high" if s.lost >= 12 else "medium" if s.lost >= 6 else "low"
        recommendations.append(Recommendation(title=s.criterion.label, details=s.fix_text, priority=priority))
    for c in [c for c in match.required_skills if c.status == "missing"][:3]:
        recommendations.append(
            Recommendation(
                title=f"Bacarıq boşluğu: {c.skill}",
                details="Bu bacarıq hədəf sahədə tələb olunur, lakin CV-də görünmür. Yol Xəritəsi bölməsində öyrənmə planına bax.",
                priority="high",
            )
        )

    skills = [
        s for s in dict.fromkeys(x.strip() for x in llm.detected_skills)
        if s and has_phrase(n_text, norm(s))
    ][:30]

    return EvaluationResponse(
        filename=filename,
        pages=pages,
        field_id=field_id,
        field_name=role["name"],
        overall_score=overall,
        readiness=readiness_for(overall),
        summary=_clean_text(llm.summary),
        categories=categories,
        detected_skills=skills,
        strengths=[s.criterion.label for s in strong[:5]],
        weaknesses=[s.criterion.label for s in weak[:5]],
        recommendations=recommendations,
        match=match,
    )


async def evaluate_cv(cv_text: str, field_id: str, filename: str, pages: int) -> EvaluationResponse:
    criteria_block = json.dumps(
        [{"id": c.id, "question": c.question} for c in CRITERIA if c.kind == "llm"],
        ensure_ascii=False,
        indent=2,
    )
    contents = (
        f"<criteria>\n{criteria_block}\n</criteria>\n\n"
        f"<cv>\n{cv_text[:MAX_CV_CHARS]}\n</cv>\n\n"
        "Evaluate the CV."
    )

    results = await asyncio.gather(
        generate_structured(EVAL_PROMPT, contents, EvaluationLLMOutput),
        match_cv(cv_text, field_id, filename, pages),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, BaseException):
            raise r
    llm, match = results
    return assemble_evaluation(cv_text, field_id, filename, pages, llm, match)
