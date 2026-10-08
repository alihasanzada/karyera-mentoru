from app.models.schemas import SkillCheck
from app.services.matcher import compute_score, readiness_for


def sc(status):
    return SkillCheck(skill="x", status=status, evidence="")


def test_all_has():
    assert compute_score([sc("has")] * 3, [sc("has")] * 2) == 100


def test_all_missing():
    assert compute_score([sc("missing")] * 3, [sc("missing")] * 2) == 0


def test_partial_and_weights():
    # required 0.5 * 0.75 + preferred 1.0 * 0.25 = 0.625 -> 63 (62.5 rounds off to 63)
    assert compute_score([sc("partial")] * 2, [sc("has")]) in (62, 63)


def test_readiness():
    assert readiness_for(80) == "ready"
    assert readiness_for(60) == "almost_ready"
    assert readiness_for(10) == "needs_work"