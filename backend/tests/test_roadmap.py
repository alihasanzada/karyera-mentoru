from types import SimpleNamespace

from app.models.schemas import DailyTask, GapInsight, LegacyPhasePlan, LegacyWeeklyTask, PhasePlan, SkillCheck
from app.services.roadmap import PHASES, _phase, _priority, build_career_gap


def test_priority():
    assert _priority("required", "missing") == "critical"
    assert _priority("required", "partial") == "important"
    assert _priority("preferred", "missing") == "nice_to_have"
    assert _priority("required", "has") is None


def test_phase_clamps_days():
    plan = PhasePlan(
        goal="g",
        milestone="m",
        tasks=[
            DailyTask(day=9, title="a", details="d", deliverable="x"),
            DailyTask(day=0, title="b", details="d", deliverable="x"),
        ],
    )
    assert [t.day for t in _phase("foundation", plan).tasks] == [1, 7]
    assert [t.day for t in _phase("interview", plan).tasks] == [15, 15]


def test_phases_cover_7_14_21_days():
    assert [PHASES[k][1] for k in ("foundation", "practice", "interview")] == ["1-7", "8-14", "15-21"]
    assert PHASES["interview"][3] == 21


def test_phase_clamps_and_orders_legacy_weeks_without_changing_stored_tasks():
    plan = LegacyPhasePlan(
        goal="g", milestone="m", tasks=[
            LegacyWeeklyTask(week=99, title="Later", details="d", deliverable="x"),
            LegacyWeeklyTask(week=0, title="Earlier", details="d", deliverable="x"),
        ],
    )
    phase = _phase("practice", plan).model_dump()
    assert phase["days"] == "31-60"
    assert [(task["week"], task["title"]) for task in phase["tasks"]] == [(5, "Earlier"), (8, "Later")]
    assert all("day" not in task for task in phase["tasks"])
    assert [task.week for task in plan.tasks] == [99, 0]


def test_career_gap_merges_insights():
    match = SimpleNamespace(
        required_skills=[
            SkillCheck(skill="A", status="missing", evidence=""),
            SkillCheck(skill="B", status="has", evidence="x"),
        ],
        preferred_skills=[SkillCheck(skill="C", status="partial", evidence="y")],
    )
    insights = [GapInsight(skill="a", why_it_matters="w", resources=[])]
    gap = build_career_gap(SimpleNamespace(match=match), insights)
    assert gap.required_coverage == 50
    assert gap.preferred_coverage == 50
    assert gap.skills[0].priority == "critical"
    assert gap.skills[0].why_it_matters == "w"
    assert gap.skills[1].priority is None
