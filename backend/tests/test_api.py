import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.db.db_models import AnalysisRecord, RoadmapCompletion, RoadmapRecord
from app.main import app
from app.models.schemas import EvaluationLLMOutput, MatchResponse, MentorReply, RoadmapLLMOutput
from app.routers import cv, evaluate, mentor, roadmap
from app.services import ai_analyzer, history
from app.services.evaluator import assemble_evaluation

def signup(client, email):
    response = client.post("/api/auth/signup", json={"email": email, "password": "long-test-password"})
    assert response.status_code == 201
    return {"session": response.cookies["session"]}


@pytest.fixture
def api():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)

    def test_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    try:
        with TestClient(app) as client:
            yield client, factory
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.fixture
def pdf_bytes():
    # A real, small text PDF to exercise extraction as well as HTTP upload.
    stream = b"BT /F1 12 Tf 20 100 Td (Skills: Python Linux) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    data = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    start = len(data)
    data += b"xref\n0 6\n0000000000 65535 f \n"
    data += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    return data + f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF".encode()


@pytest.fixture
def evaluation():
    match = MatchResponse(filename="cv.pdf", pages=1, field_id="cybersecurity",
                          field_name="Cybersecurity", match_score=0, readiness="needs_work",
                          required_skills=[], preferred_skills=[], summary="s", action_plan=[])
    return assemble_evaluation("Skills: Python Linux", "cybersecurity", "cv.pdf", 1,
                               EvaluationLLMOutput(summary="s", detected_skills=[], verdicts=[]), match)


def test_health_frontend_and_fields(api):
    client, _ = api
    assert client.get("/health").json() == {"status": "ok"}
    assert "Karyera Mentoru" in client.get("/").text
    assert len(client.get("/api/match/fields").json()) == 3


def test_profile_signup_update_and_isolation(api):
    client, _ = api
    assert client.get("/api/profile").status_code == 401
    result = client.post("/api/auth/signup", json={
        "email": "first@example.com", "password": "long-test-password",
        "profile": {"name": "Samir", "field_id": "frontend", "skills": [" JavaScript "]},
    })
    assert result.status_code == 201
    first = {"session": result.cookies["session"]}
    profile = client.get("/api/profile", cookies=first).json()
    assert profile["skills"] == ["JavaScript"]
    profile["interests"] = "Accessibility"
    assert client.put("/api/profile", cookies=first, json=profile).status_code == 200
    second = signup(client, "second@example.com")
    assert client.get("/api/profile", cookies=second).json()["interests"] == ""
    assert client.get("/api/profile", cookies=first).json()["interests"] == "Accessibility"
    assert client.put("/api/profile", cookies=first, json={"field_id": "unknown"}).status_code == 422


def plan_payload(period, ranges):
    return {
        "summary": "Fərdi plan", "gaps": [],
        **{key: {"goal": "Hazırlıq", "milestone": "Nümunə", "tasks": [
            {period: value, "title": f"Tapşırıq {value}", "details": "Məşq et", "deliverable": "Qeyd"},
        ]} for key, value in zip(("foundation", "practice", "interview"), ranges)},
    }


def test_plan_progress_isolation_and_legacy_preservation(api, evaluation, monkeypatch):
    client, factory = api
    first = signup(client, "first@example.com")
    second = signup(client, "second@example.com")
    with factory() as db:
        daily_id = history.save_record(db, "user-1", "evaluation", "cv.pdf", evaluation)
        legacy_id = history.save_record(db, "user-1", "evaluation", "old.pdf", evaluation)
        db.add(RoadmapRecord(client_id="user-1", evaluation_id=legacy_id,
                             llm_json=json.dumps(plan_payload("week", (1, 5, 9)))))
        db.commit()
    generate = AsyncMock(return_value=RoadmapLLMOutput.model_validate(plan_payload("day", (1, 8, 15))))
    monkeypatch.setattr(roadmap, "generate_roadmap_plan", generate)
    base = f"/api/roadmap/{daily_id}"
    generated = client.post(base, cookies=first).json()
    assert [phase["tasks"][0]["day"] for phase in generated["roadmap"]] == [1, 8, 15]
    assert [phase["days"] for phase in generated["roadmap"]] == ["1-7", "8-14", "15-21"]
    task = f"{base}/tasks/foundation-0"
    assert client.put(task, cookies=second, json={"completed": True}).status_code == 404
    assert client.put(f"{base}/tasks/foundation-9", cookies=first, json={"completed": True}).status_code == 404
    for _ in range(2):
        assert client.put(task, cookies=first, json={"completed": True}).json()["completed_task_ids"] == ["foundation-0"]
    client.post("/api/auth/logout", cookies=first)
    login = client.post("/api/auth/login", json={"email": "first@example.com", "password": "long-test-password"})
    first = {"session": login.cookies["session"]}
    assert client.get(base, cookies=first).json()["completed_task_ids"] == ["foundation-0"]
    assert client.post(base, cookies=first).json()["completed_task_ids"] == ["foundation-0"]
    legacy = client.post(f"/api/roadmap/{legacy_id}", cookies=first).json()
    assert legacy["format"] == "legacy_weekly"
    assert [phase["days"] for phase in legacy["roadmap"]] == ["1-30", "31-60", "61-90"]
    assert legacy["roadmap"][2]["tasks"][0]["week"] == 9
    generate.assert_awaited_once()
    assert client.delete(f"/api/history/{daily_id}", cookies=first).status_code == 200
    with factory() as db:
        assert db.scalars(select(RoadmapCompletion)).all() == []


def test_mentor_minimizes_context_and_handles_provider_errors(api, evaluation, monkeypatch):
    client, factory = api
    first = signup(client, "first@example.com")
    second = signup(client, "second@example.com")
    client.put("/api/profile", cookies=first, json={"field_id": "cybersecurity", "interests": "Python"})
    with factory() as db:
        evaluation.summary = "private quotation from CV"
        record = history.save_record(db, "user-1", "evaluation", "private.pdf", evaluation,
                                     field_id="cybersecurity")
        db.add(RoadmapRecord(client_id="user-1", evaluation_id=record,
                             llm_json=json.dumps(plan_payload("day", (1, 8, 15)))))
        db.commit()
    generate = AsyncMock(return_value=MentorReply(answer="Python ilə başla."))
    monkeypatch.setattr(mentor, "generate_structured", generate)
    query = {"question": "Nəyi öyrənim?", "history": [{"question": "Salam", "answer": "Salam!"}]}
    assert client.post("/api/mentor", cookies=second, json={**query, "evaluation_id": record}).status_code == 404
    assert client.post("/api/mentor", cookies=first, json=query).json()["answer"] == "Python ilə başla."
    generate.assert_awaited_once()
    _, raw, schema = generate.call_args.args
    context = json.loads(raw)
    assert schema is MentorReply
    assert context["context"]["profile"]["interests"] == "Python"
    assert context["context"]["evaluation"]["field"] == evaluation.field_name
    assert context["context"]["plan"]["phases"][0]["tasks"] == ["Tapşırıq 1"]
    assert context["history"] == query["history"]
    assert all(value not in raw for value in ("private quotation", "private.pdf", "first@example.com"))
    generate.side_effect = ai_analyzer.AIAnalysisError("AI əlçatan deyil.", 503)
    assert client.post("/api/mentor", cookies=first, json=query).status_code == 503
    assert client.post("/api/mentor", cookies=first, json={"question": " "}).status_code == 422


def test_request_limits_and_origin(api):
    client, _ = api
    assert client.post("/api/auth/login", headers={"Origin": "https://other.example"}, json={}).status_code == 403
    for _ in range(12):
        assert client.post("/api/auth/login", json={}).status_code == 422
    response = client.post("/api/auth/login", json={})
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    for _ in range(10):
        assert client.post("/api/mentor", json={"question": "Salam"}).status_code == 401
    assert client.post("/api/mentor", json={"question": "Salam"}).status_code == 429


def test_dizayn_site_is_served(api):
    client, _ = api
    page = client.get("/dizayn/")
    assert page.status_code == 200
    assert "Karyera Mentoru" in page.text
    assert client.get("/dizayn/js/script.js").status_code == 200
    assert client.get("/dizayn/css/style.css").status_code == 200


def test_pdf_upload_and_validation(api, pdf_bytes):
    client, _ = api
    cookies = signup(client, "first@example.com")
    response = client.post("/api/cv/upload", cookies=cookies, files={"file": ("cv.pdf", pdf_bytes)})
    assert response.status_code == 200
    assert response.json()["text"] == "Skills: Python Linux"
    for name, data, status in [("cv.txt", pdf_bytes, 400), ("cv.pdf", b"fake", 400),
                               ("cv.pdf", b"%PDF broken", 422)]:
        assert client.post("/api/cv/upload", cookies=cookies, files={"file": (name, data)}).status_code == status


def test_authentication_and_logout(api):
    client, _ = api
    assert client.get("/api/auth/me").status_code == 401
    cookies = signup(client, "first@example.com")
    assert client.get("/api/auth/me", cookies=cookies).json()["email"] == "first@example.com"
    assert client.post("/api/auth/signup", json={"email": "first@example.com", "password": "long-test-password"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "first@example.com", "password": "incorrect-pass"}).status_code == 401
    assert client.post("/api/auth/logout", cookies=cookies).status_code == 200
    client.cookies.clear()
    assert client.get("/api/auth/me", cookies=cookies).status_code == 401
    assert client.post("/api/auth/login", json={"email": "FIRST@example.com", "password": "long-test-password"}).status_code == 200


def test_pdf_read_is_bounded(monkeypatch):
    monkeypatch.setattr(cv.settings, "max_upload_mb", 1)
    file = AsyncMock()
    file.filename = "large.pdf"
    file.read.return_value = b"x" * (1024 * 1024 + 1)
    with pytest.raises(cv.HTTPException) as exc:
        asyncio.run(cv.read_pdf(file))
    assert exc.value.status_code == 413
    file.read.assert_awaited_once_with(1024 * 1024 + 1)


def test_missing_api_key_preserves_actionable_error(api, pdf_bytes, monkeypatch):
    monkeypatch.setattr(ai_analyzer, "_client", None)
    monkeypatch.setattr(ai_analyzer.settings, "gemini_api_key", "")
    client, _ = api
    cookies = signup(client, "first@example.com")
    response = client.post("/api/evaluate", cookies=cookies,
                           data={"field_id": "cybersecurity"}, files={"file": ("cv.pdf", pdf_bytes)})
    assert response.status_code == 500
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_evaluation_id_cache_and_client_isolation(api, pdf_bytes, evaluation, monkeypatch):
    generate = AsyncMock(return_value=evaluation)
    monkeypatch.setattr(evaluate, "evaluate_cv", generate)
    client, _ = api
    first_cookie = signup(client, "first@example.com")
    second_cookie = signup(client, "second@example.com")
    payload = {"data": {"field_id": "cybersecurity"}, "files": {"file": ("cv.pdf", pdf_bytes)}}
    first = client.post("/api/evaluate", cookies=first_cookie, **payload)
    second = client.post("/api/evaluate", cookies=second_cookie, **payload)
    assert first.status_code == second.status_code == 200
    first_id = first.json()["evaluation_id"]
    second_id = second.json()["evaluation_id"]
    assert isinstance(first_id, int) and first_id != second_id
    assert generate.await_count == 2
    assert client.post("/api/evaluate", cookies=first_cookie, **payload).status_code == 200
    assert generate.await_count == 2
    assert client.get(f"/api/history/{first_id}", cookies=first_cookie).status_code == 200
    assert client.get(f"/api/history/{first_id}", cookies=second_cookie).status_code == 404
    assert client.get(f"/api/roadmap/{first_id}", cookies=second_cookie).status_code == 404
    assert client.delete(f"/api/history/{first_id}", cookies=second_cookie).status_code == 404
    client.cookies.clear()
    assert client.get("/api/history").status_code == 401


def test_delete_and_retention_remove_dependent_plans(api, evaluation, monkeypatch):
    client, factory = api
    first_cookie = signup(client, "first@example.com")
    signup(client, "second@example.com")
    with factory() as db:
        first_id = history.save_record(db, "user-1", "evaluation", "cv.pdf", evaluation)
        other_id = history.save_record(db, "user-2", "evaluation", "cv.pdf", evaluation)
        db.add_all([RoadmapRecord(client_id="user-1", evaluation_id=first_id, llm_json="{}"),
                    RoadmapRecord(client_id="user-2", evaluation_id=other_id, llm_json="{}")])
        db.commit()
    assert client.delete(f"/api/history/{first_id}", cookies=first_cookie).status_code == 200
    with factory() as db:
        assert [r.evaluation_id for r in db.scalars(select(RoadmapRecord))] == [other_id]
        keep_id = history.save_record(db, "user-1", "evaluation", "cv.pdf", evaluation)
        db.add(RoadmapRecord(client_id="user-1", evaluation_id=keep_id, llm_json="{}"))
        db.commit()
        monkeypatch.setattr(history, "MAX_PER_CLIENT", 1)
        newest_id = history.save_record(db, "user-1", "evaluation", "cv.pdf", evaluation)
        assert db.get(AnalysisRecord, keep_id) is None
        assert db.get(AnalysisRecord, newest_id) is not None
        assert [r.evaluation_id for r in db.scalars(select(RoadmapRecord))] == [other_id]
