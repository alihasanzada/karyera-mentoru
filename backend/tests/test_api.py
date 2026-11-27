import asyncio
import json
from unittest.mock import AsyncMock

import httpx
import pytest
from google import genai
from google.genai import types
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from auth_helpers import verify_login

from app.db.database import Base, get_db
from app.db.db_models import AnalysisRecord, RoadmapCompletion, RoadmapRecord, UserProfile
from app.main import app
from app.models.schemas import EvaluationLLMOutput, MatchResponse, MentorReply, RoadmapLLMOutput
from app.routers import cv, evaluate, mentor, roadmap
from app.services import ai_analyzer, history
from app.services.evaluator import assemble_evaluation

def signup(client, email):
    credentials = {"email": email, "password": "long-test-password"}
    response = client.post("/api/auth/signup", json={**credentials, "first_name": "Tahir", "last_name": "Məmmədov", "specialty_id": "cybersecurity", "consent": True})
    assert response.status_code == 201
    assert "session" not in response.cookies
    response = verify_login(client, credentials)
    client.cookies.clear()
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
    assert len(client.get("/api/match/fields").json()) == 122


def test_profile_signup_update_and_isolation(api):
    client, _ = api
    assert client.get("/api/profile").status_code == 401
    result = client.post("/api/auth/signup", json={
        "email": "first@example.com", "password": "long-test-password",
        "first_name": "Samir", "last_name": "Əliyev", "specialty_id": "frontend", "consent": True,
    })
    assert result.status_code == 201
    assert "session" not in result.cookies
    login = verify_login(client, {"email": "first@example.com", "password": "long-test-password"})
    first = {"session": login.cookies["session"]}
    profile = client.get("/api/profile", cookies=first).json()
    assert profile["name"] == "Samir" and profile["field_id"] == "frontend"
    profile["interests"] = "Accessibility"
    profile["skills"] = [" JavaScript "]
    assert client.put("/api/profile", cookies=first, json=profile).status_code == 200
    assert client.patch("/api/auth/me", cookies=first, json={"first_name": "Samirə"}).status_code == 200
    second = signup(client, "second@example.com")
    assert client.get("/api/profile", cookies=second).json()["interests"] == ""
    updated = client.get("/api/profile", cookies=first).json()
    assert (updated["name"], updated["interests"], updated["skills"]) == ("Samirə", "Accessibility", ["JavaScript"])
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
    login = verify_login(client, {"email": "first@example.com", "password": "long-test-password"})
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


def test_roadmap_requires_an_owned_evaluation_record(api, evaluation):
    client, factory = api
    owner = signup(client, "roadmap-owner@example.com")
    other = signup(client, "roadmap-other@example.com")
    with factory() as db:
        match_id = history.save_record(db, "user-1", "match", "cv.pdf", evaluation)
        evaluation_id = history.save_record(db, "user-1", "evaluation", "cv.pdf", evaluation)
    for record_id, cookies in ((match_id, owner), (evaluation_id, other)):
        base = f"/api/roadmap/{record_id}"
        responses = [
            client.get(base, cookies=cookies),
            client.post(base, cookies=cookies),
            client.put(f"{base}/tasks/foundation-0", cookies=cookies, json={"completed": True}),
        ]
        assert [r.status_code for r in responses] == [404, 404, 404]
        assert all(r.json() == {"detail": "Qiymətləndirmə tapılmadı."} for r in responses)


def test_empty_generated_roadmap_is_not_saved_and_can_be_retried(api, evaluation, monkeypatch):
    client, factory = api
    owner = signup(client, "roadmap-retry@example.com")
    with factory() as db:
        evaluation_id = history.save_record(db, "user-1", "evaluation", "cv.pdf", evaluation)
    url = f"/api/roadmap/{evaluation_id}"
    valid = plan_payload("day", (1, 8, 15))
    empty_phase = {**valid, "foundation": {**valid["foundation"], "tasks": []}}
    responses = iter([empty_phase, valid])

    def respond(request):
        assert request.url.path.endswith(":generateContent")
        return httpx.Response(200, json={"candidates": [{
            "content": {"role": "model", "parts": [{"text": json.dumps(next(responses))}]},
            "finishReason": "STOP",
        }]})

    transport = httpx.AsyncClient(transport=httpx.MockTransport(respond), trust_env=False)
    sdk = genai.Client(api_key="test-placeholder", vertexai=False,
                       http_options=types.HttpOptions(httpx_async_client=transport))
    monkeypatch.setattr(ai_analyzer, "_client", sdk)
    monkeypatch.setattr(ai_analyzer.settings, "gemini_models", "test-model")
    monkeypatch.setattr(ai_analyzer, "ROUNDS", 1)
    try:
        assert client.post(url, cookies=owner).status_code == 502
        assert not client.get(url, cookies=owner).json()["generated"]
        with factory() as db:
            assert db.scalar(select(RoadmapRecord)) is None
        generated = client.post(url, cookies=owner)
        assert generated.status_code == 200
        assert generated.json()["generated"]
        assert [phase["tasks"][0]["day"] for phase in generated.json()["roadmap"]] == [1, 8, 15]
        assert client.get(url, cookies=owner).json() == generated.json()
    finally:
        client.portal.call(sdk.aio.aclose)
        sdk.close()


def test_mentor_minimizes_context_and_handles_provider_errors(api, evaluation, monkeypatch):
    client, factory = api
    first = signup(client, "first@example.com")
    second = signup(client, "second@example.com")
    client.put("/api/profile", cookies=first, json={"field_id": "cybersecurity", "interests": "Python"})
    with factory() as db:
        evaluation.summary = "private quotation from CV"
        record = history.save_record(db, "user-1", "evaluation", "private.pdf", evaluation,
                                     field_id="cybersecurity")
        saved_plan = plan_payload("day", (1, 8, 15))
        saved_plan["foundation"]["tasks"][0]["title"] = "private roadmap text"
        db.add(RoadmapRecord(client_id="user-1", evaluation_id=record,
                             llm_json=json.dumps(saved_plan)))
        db.commit()
    generate = AsyncMock(return_value=MentorReply(answer="Python ilə başla."))
    monkeypatch.setattr(mentor, "generate_structured", generate)
    query = {"question": "Nəyi öyrənim?", "history": [{"question": "Salam", "answer": "Salam!"}]}
    assert client.post("/api/mentor", cookies=second, json={**query, "evaluation_id": record}).status_code == 404
    assert client.post("/api/mentor", cookies=first, json=query).json()["answer"] == "Python ilə başla."
    generate.assert_awaited_once()
    task, raw = generate.call_args.args
    context = json.loads(raw)
    assert task.schema is MentorReply
    assert context["context"]["profile"]["interests"] == "Python"
    assert context["context"]["evaluation"]["field"] == evaluation.field_name
    assert context["context"]["plan"]["phases"][0]["next_period"] == 1
    assert context["history"] == []
    assert client.get("/api/mentor/history", cookies=first).json() == [
        {"question": query["question"], "answer": "Python ilə başla."},
    ]
    assert client.get("/api/mentor/history", cookies=second).json() == []
    assert all(value not in raw for value in ("private quotation", "private roadmap text", "private.pdf", "first@example.com"))
    generate.side_effect = ai_analyzer.AIAnalysisError("AI əlçatan deyil.", 503)
    assert client.post("/api/mentor", cookies=first, json=query).status_code == 503
    assert json.loads(generate.call_args.args[1])["history"] == [
        {"question": query["question"], "answer": "Python ilə başla."},
    ]
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
    assert client.post("/api/auth/signup", json={"email": "first@example.com", "password": "long-test-password", "first_name": "Tahir", "last_name": "Məmmədov", "specialty_id": "cybersecurity", "consent": True}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "first@example.com", "password": "incorrect-pass"}).status_code == 401
    assert client.post("/api/auth/logout", cookies=cookies).status_code == 200
    client.cookies.clear()
    assert client.get("/api/auth/me", cookies=cookies).status_code == 401
    verify_login(client, {"email": "FIRST@example.com", "password": "long-test-password"})


def test_pdf_read_is_bounded(monkeypatch):
    monkeypatch.setattr(cv.settings, "max_upload_mb", 1)
    file = AsyncMock()
    file.filename = "large.pdf"
    file.read.return_value = b"x" * (1024 * 1024 + 1)
    with pytest.raises(cv.HTTPException) as exc:
        asyncio.run(cv.read_pdf(file))
    assert exc.value.status_code == 413
    file.read.assert_awaited_once_with(1024 * 1024 + 1)


@pytest.mark.parametrize("path", ["/api/cv/analyze", "/api/match/analyze", "/api/evaluate"])
def test_missing_api_key_preserves_actionable_error(api, pdf_bytes, monkeypatch, path):
    monkeypatch.setattr(ai_analyzer, "_client", None)
    monkeypatch.setattr(ai_analyzer.settings, "gemini_api_key", "")
    client, _ = api
    cookies = signup(client, "first@example.com")
    response = client.post(path, cookies=cookies,
                           data={"field_id": "cybersecurity"}, files={"file": ("cv.pdf", pdf_bytes)})
    assert response.status_code == 500
    assert response.json() == {"detail": "GEMINI_API_KEY təyin olunmayıb."}
    assert client.get("/api/history", cookies=cookies).json() == []


@pytest.mark.parametrize("path", ["/api/match/analyze", "/api/evaluate"])
def test_specialty_validation_precedes_pdf_parsing_for_authenticated_requests(api, path):
    client, _ = api
    upload = {"data": {"field_id": "unknown"}, "files": {"file": ("not-a-cv.txt", b"synthetic")}}
    assert client.post(path, **upload).status_code == 401
    cookies = signup(client, "invalid-specialty@example.com")
    rejected = client.post(path, cookies=cookies, **upload)
    assert rejected.status_code == 400
    assert rejected.json() == {"detail": "Naməlum ixtisas. Siyahıdan ixtisas seç."}


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


def test_history_projects_summaries_and_filters_before_limiting(api, evaluation):
    client, factory = api
    first = signup(client, "first@example.com")
    second = signup(client, "second@example.com")
    with factory() as db:
        own_id = history.save_record(db, "user-1", "evaluation", "fictional.pdf", evaluation)
        other_id = history.save_record(db, "user-2", "evaluation", "other.pdf", evaluation)
        db.add_all(AnalysisRecord(client_id="user-1", kind="match", filename=f"{n}.pdf",
                                  result_json='{"large":"' + ("x" * 4096) + '"}')
                   for n in range(20))
        db.commit()

    statements = []
    engine = factory.kw["bind"]

    def sql(conn, cursor, statement, parameters, context, executemany):
        if "FROM analyses" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", sql)
    try:
        unfiltered = client.get("/api/history", cookies=first).json()
        filtered = client.get("/api/history?kind=evaluation", cookies=first).json()
        other = client.get("/api/history?kind=evaluation", cookies=second).json()
    finally:
        event.remove(engine, "before_cursor_execute", sql)
    assert len(statements) == 3 and all("result_json" not in statement for statement in statements)
    assert len(unfiltered) == 20 and all(row["kind"] == "match" for row in unfiltered)
    assert [row["id"] for row in filtered] == [own_id]
    assert [row["id"] for row in other] == [other_id]
    assert client.get(f"/api/history/{own_id}", cookies=first).json()["result"] == evaluation.model_dump()


def test_signup_rules_match_the_site(api):
    client, _ = api
    base = {"email": "rules@example.com", "first_name": "Tahir", "last_name": "Məmmədov", "specialty_id": "cybersecurity", "consent": True}
    short = client.post("/api/auth/signup", json={**base, "password": "1234567"})
    assert short.status_code == 422
    assert client.post("/api/auth/signup", json={**base, "password": "12345678", "consent": False}).status_code == 422
    assert client.post("/api/auth/signup", json={**base, "password": "12345678", "specialty_id": "nope"}).status_code == 422
    assert client.post("/api/auth/signup", json={**base, "password": "12345678", "first_name": "T"}).status_code == 422
    created = client.post("/api/auth/signup", json={**base, "password": "12345678"})
    assert created.status_code == 201
    assert created.json()["first_name"] == "Tahir" and created.json()["specialty_id"] == "cybersecurity"


def test_profile_update(api):
    client, _ = api
    cookies = signup(client, "profile@example.com")
    updated = client.patch("/api/auth/me", cookies=cookies, json={"first_name": "Aysel", "specialty_id": "maliyye"})
    assert updated.status_code == 200
    assert updated.json()["first_name"] == "Aysel" and updated.json()["last_name"] == "Məmmədov"
    assert client.patch("/api/auth/me", cookies=cookies, json={"specialty_id": "nope"}).status_code == 422


def test_legacy_account_with_empty_profile_can_fill_it_and_keeps_it(api):
    client, factory = api
    cookies = signup(client, "legacy@example.com")
    with factory() as db:
        db.delete(db.get(UserProfile, 1))
        db.commit()
    assert client.get("/api/auth/me", cookies=cookies).json() == {
        "id": 1, "email": "legacy@example.com", "first_name": "", "last_name": "", "specialty_id": ""}
    filled = client.patch("/api/auth/me", cookies=cookies,
                          json={"first_name": "Tahir", "last_name": "Məmmədov", "specialty_id": "frontend"})
    assert filled.status_code == 200
    # A later request (a page reload in either frontend) reads the same values
    assert client.get("/api/auth/me", cookies=cookies).json() == filled.json()
    assert filled.json()["specialty_id"] == "frontend"
    profile = client.get("/api/profile", cookies=cookies).json()
    assert (profile["name"], profile["surname"], profile["field_id"]) == ("Tahir", "Məmmədov", "frontend")


def test_specialties_match_the_site(api):
    client, _ = api
    fields = client.get("/api/match/fields").json()
    assert len(fields) == 122
    assert len({f["group"] for f in fields}) == 7
    by_id = {f["id"]: f for f in fields}
    assert by_id["frontend"]["name"] == "Frontend proqramlaşdırma"
    assert by_id["cybersecurity"]["name"] == "İnformasiya təhlükəsizliyi"
    assert by_id["data_science"]["name"] == "Data analitika"
    assert by_id["fizika_muellimliyi"]["role"] == "Fizika müəllimi"
