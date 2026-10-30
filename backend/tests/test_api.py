import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.db.db_models import AnalysisRecord, RoadmapRecord
from app.main import app
from app.models.schemas import EvaluationLLMOutput, MatchResponse
from app.routers import cv, evaluate
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
    assert generate.await_count == 1
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
