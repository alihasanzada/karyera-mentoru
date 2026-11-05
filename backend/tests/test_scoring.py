import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base
from app.db.db_models import EvaluationCache
from app.models.schemas import (
    CriterionVerdict,
    EvaluationLLMOutput,
    MatchResponse,
    SkillCheck,
)
from app.services.eval_cache import cache_key, get_cached, put_cached
from app.services.evaluator import assemble_evaluation, career_score
from app.services.matcher import ROLES
from app.services.rubric import CRITERIA, norm, quote_supported, run_code_checks

SAMPLE = """Murad Qasimov
murad@example.com
+994 50 123 45 67
linkedin.com/in/murad
Professional Summary
SOC analyst with 3 years of experience.
Work Experience
SOC Analyst, Acme, 2021 - 2024
- Reduced false positives by 35% using Splunk correlation rules
Education
Baku State University, 2017 - 2021
Technical Skills
Splunk, Wireshark, Python, Linux
Languages
English (C1), Azerbaijani (native)
"""
KEYWORDS = ["Splunk", "Wireshark", "Python", "Docker"]


def _match():
    return MatchResponse(
        filename="a.pdf", pages=1, field_id="cybersecurity", field_name="Cyber",
        match_score=80, readiness="ready",
        required_skills=[SkillCheck(skill="Linux", status="has", evidence="Linux")],
        preferred_skills=[], summary="s", action_plan=[],
    )


def _llm(quote):
    return EvaluationLLMOutput(
        summary="Xülasə.",
        detected_skills=["Splunk", "Kubernetes"],
        verdicts=[
            CriterionVerdict(id="i_outcomes", status="yes", quote=quote),
            CriterionVerdict(id="i_tools", status="yes", quote="using Splunk correlation rules"),
        ],
    )


def _assemble(quote="Reduced false positives by 35%"):
    return assemble_evaluation(SAMPLE, "cybersecurity", "cv.pdf", 1, _llm(quote), _match())


def _impact(result):
    return next(c for c in result.categories if c.key == "impact").score


def test_norm_folds_azerbaijani_letters():
    assert norm("Təhsil") == "tehsil"
    assert norm("İŞ TƏCRÜBƏSİ") == "is tecrubesi"


def test_quote_support():
    tokens = set(norm(SAMPLE).split())
    assert quote_supported("Reduced false positives by 35%", tokens)
    assert not quote_supported("Led a team of 40 engineers at Google", tokens)


def test_code_checks_on_sample():
    checks = run_code_checks(SAMPLE, 1, KEYWORDS)
    for key in ("s_email", "s_phone", "s_link", "s_summary", "s_experience", "s_education",
                "s_skills", "s_languages", "s_length", "a_headings", "a_dates", "a_keywords"):
        assert checks[key].ratio == 1.0, key
    assert checks["i_metrics"].ratio > 0
    assert checks == run_code_checks(SAMPLE, 1, KEYWORDS)


def test_missing_pieces():
    checks = run_code_checks("Just some text without structure", 5, KEYWORDS)
    assert checks["s_email"].ratio == 0.0
    assert checks["s_length"].ratio == 0.0
    assert checks["a_headings"].ratio == 0.0


def test_weights_sum_to_100_per_category():
    for category in ("structure", "ats", "impact"):
        assert sum(c.weight for c in CRITERIA if c.category == category) == 100


def test_roles_have_keywords():
    for role in ROLES.values():
        assert len(role.get("ats_keywords", [])) >= 15


def test_assemble_is_deterministic_and_grounded():
    a, b = _assemble(), _assemble()
    assert a == b
    assert [c.key for c in a.categories] == ["structure", "ats", "impact", "field_fit"]
    assert a.overall_score == career_score(a.match.match_score, [c.score for c in a.categories[:3]])
    assert "Splunk" in a.detected_skills
    assert "Kubernetes" not in a.detected_skills


def test_unsupported_quote_is_downgraded():
    assert _impact(_assemble("Led a team of 40 engineers at Google")) < _impact(_assemble())


def test_field_fit_is_the_ceiling_even_for_a_polished_cv():
    assert career_score(0, [100, 100, 100]) == 0
    assert career_score(15, [95, 100, 85]) <= 15
    assert career_score(90, [95, 100, 68]) == 87
    assert career_score(90, [20, 20, 20]) < career_score(90, [95, 100, 68])


def test_cache_key_depends_on_inputs():
    key = cache_key("Same text", "cybersecurity", 1)
    assert key == cache_key("Same text", "cybersecurity", 1)
    assert key != cache_key("same   TEXT", "cybersecurity", 1)
    assert cache_key("C", "frontend", 1) != cache_key("C++", "frontend", 1)
    assert cache_key("Skills\nPython", "frontend", 1) != cache_key("Skills Python", "frontend", 1)
    assert key != cache_key("Same text", "frontend", 1)
    assert key != cache_key("Same text", "cybersecurity", 2)


def test_cache_roundtrip_without_filename():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()

    result = assemble_evaluation(SAMPLE, "cybersecurity", "private-name.pdf", 1, _llm("Reduced false positives by 35%"), _match())
    put_cached(db, "k" * 64, result)
    assert "private-name" not in db.get(EvaluationCache, "k" * 64).result_json

    again = get_cached(db, "k" * 64, "other.pdf", 2)
    assert again.filename == "other.pdf" and again.match.filename == "other.pdf"
    assert again.overall_score == result.overall_score
