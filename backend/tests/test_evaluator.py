from app.models.schemas import ActionStep, MatchResponse, SkillCheck
from app.services.evaluator import compute_overall, field_fit_category, _clean_items, _clean_text


def test_compute_overall():
    assert compute_overall([80, 60, 70, 90]) == 75
    assert compute_overall([]) == 0


def test_field_fit_category():
    match = MatchResponse(
        filename="cv.pdf", pages=1, field_id="x", field_name="X",
        match_score=60, readiness="almost_ready",
        required_skills=[
            SkillCheck(skill="A", status="has", evidence="..."),
            SkillCheck(skill="B", status="partial", evidence="..."),
            SkillCheck(skill="C", status="missing", evidence=""),
        ],
        preferred_skills=[SkillCheck(skill="D", status="has", evidence="...")],
        summary="s",
        action_plan=[ActionStep(title="C-ni öyrən", details="d", timeframe="2 həftə")],
    )
    cat = field_fit_category(match)
    assert cat.score == 60 and cat.key == "field_fit"
    assert "Çatışmır: C" in cat.issues and "Qismən: B" in cat.issues
    assert cat.fixes == ["C-ni öyrən"]


def test_artifact_filter():
    assert _clean_items(["Səhifə 1 / 1 qeydi", "Real problem"]) == ["Real problem"]
    assert (
        _clean_text("Yaxşı CV. Avtomatik mətn çıxarılması qarışıb. Bacarıqlar güclüdür.")
        == "Yaxşı CV. Bacarıqlar güclüdür."
    )