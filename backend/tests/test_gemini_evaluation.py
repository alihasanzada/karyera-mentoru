import asyncio
import json
import sys

import httpx
import pytest
from google.genai import errors
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db.database import get_db
from app import main
from app.routers.mentor import MENTOR
from app.services.ai_analyzer import LEGACY_CV
from app.services.evaluator import CV_QUALITY
from app.services.matcher import ROLE_MATCH
from app.services.roadmap import ROADMAP
from evaluations import gemini
from evaluations.plan import MODEL, REQUESTS, plan
from evaluations.provider import HOST, ProviderRun, RequestBudget, evaluation_client


def test_offline_plan_neither_reads_a_key_nor_starts_live_mode(monkeypatch, capsys):
    monkeypatch.setattr(sys, "argv", ["gemini"])
    monkeypatch.setattr(gemini, "getpass", lambda _: pytest.fail("credential input attempted"))
    monkeypatch.setattr(gemini, "run_live", lambda _: pytest.fail("live client attempted"))
    assert gemini.main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result == {"mode": "offline-plan", **plan()}
    assert result["complete_run_requests"] == 14
    assert result["estimated_input_tokens"] == 120700
    assert result["configured_output_tokens_total"] == 50176
    assert result["estimated_paid_usd"] == "0.161650"


def test_live_requires_exact_approved_budget_before_credentials(monkeypatch, tmp_path):
    report = tmp_path / "report.json"
    monkeypatch.setattr(sys, "argv", ["gemini", "--live", "--approved-requests", "13", "--report", str(report)])
    monkeypatch.setattr(gemini, "getpass", lambda _: pytest.fail("credential input attempted"))
    monkeypatch.setattr(gemini, "run_live", lambda _: pytest.fail("live client attempted"))
    with pytest.raises(SystemExit) as error:
        gemini.main()
    assert error.value.code == 2
    assert not report.exists()


def test_approved_cli_uses_only_the_evaluation_credential(monkeypatch, tmp_path):
    report = tmp_path / "report.json"
    monkeypatch.setattr(sys, "argv", ["gemini", "--live", "--approved-requests", "14", "--report", str(report)])
    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-app-key")
    monkeypatch.setenv(gemini.EVALUATION_KEY, "synthetic-evaluation-key")
    monkeypatch.setattr(gemini, "getpass", lambda _: pytest.fail("separate key was already supplied"))

    async def fake_run(key):
        assert key == "synthetic-evaluation-key"
        return {"mode": "mock", "requests_sent": REQUESTS}

    monkeypatch.setattr(gemini, "run_live", fake_run)
    assert gemini.main() == 0
    assert json.loads(report.read_text(encoding="utf-8"))["mode"] == "mock"
    assert "synthetic" not in report.read_text(encoding="utf-8")


def test_request_budget_enforces_destination_and_counts_attempts_without_sdk_retries(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic-ambient-key")
    sent = []

    def mock(request):
        sent.append(request.url.path)
        assert request.headers["x-goog-api-key"] == "synthetic-evaluation-key"
        return httpx.Response(503, json={"error": {"message": "mock error", "status": "UNAVAILABLE"}})

    async def check():
        transport = RequestBudget(httpx.MockTransport(mock))
        sdk = evaluation_client("synthetic-evaluation-key", transport)
        try:
            with pytest.raises(errors.APIError):
                await sdk.aio.models.generate_content(model=MODEL, contents="synthetic")
            assert transport.attempts == len(sent) == 1
            with pytest.raises(RuntimeError, match="destination"):
                await transport.handle_async_request(httpx.Request("GET", f"https://{HOST}/v1beta/models"))
            transport.attempts = REQUESTS
            with pytest.raises(RuntimeError, match="limit"):
                await transport.handle_async_request(
                    httpx.Request("POST", f"https://{HOST}/v1beta/models/{MODEL}:generateContent"),
                )
            assert len(sent) == 1
        finally:
            await sdk.aio.aclose()
            sdk.close()

    asyncio.run(check())


def _mock_result(data):
    if "criteria" in data:
        return {
            "summary": "Bu, uydurma CV üçün sınaq cavabıdır.", "detected_skills": [],
            "verdicts": [{"id": row["id"], "status": "no", "quote": ""} for row in data["criteria"]],
        }
    if "role" in data and "cv" in data:
        return {
            tier: [{"skill": skill, "status": "missing", "evidence": ""}
                   for skill in data["role"][f"{tier}_skills"]]
            for tier in ("required", "preferred")
        } | {"summary": "Sınaq uyğunluğu.", "action_plan": []}
    if "skills_to_close" in data:
        resource = {"title": "Sənədlər", "kind": "docs", "provider": "Sınaq",
                    "cost": "free", "search_query": "sample documentation"}
        return {
            "summary": "Sınaq planı.",
            "gaps": [{"skill": item["skill"], "why_it_matters": "Sınaq", "resources": [resource, resource]}
                     for item in data["skills_to_close"]],
            **{phase: {"goal": "Hazırlıq", "milestone": "Nümunə", "tasks": [
                {"day": day, "title": "Məşq", "details": "Bir nümunə qur.", "deliverable": "Qeyd"}
                for day in range(first, first + 4)
            ]} for phase, first in (("foundation", 1), ("practice", 8), ("interview", 15))},
        }
    if "question" in data:
        return {"answer": "Plan üzrə bu gün bir kiçik məşq et."}
    return {"summary": "Sınaq CV-si.", "cv_score": 30, "detected_skills": [], "strengths": [],
            "weaknesses": [], "missing_skills": [], "recommendations": []}


def test_complete_suite_uses_exact_budget_through_mock_sdk_transport(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'evaluation.sqlite'}")
    monkeypatch.setattr(main, "engine", engine)

    def override_db():
        with Session(engine) as db:
            yield db

    monkeypatch.setitem(main.app.dependency_overrides, get_db, override_db)
    seen = []

    def respond(request):
        assert request.headers["x-goog-api-key"] == "synthetic-evaluation-key"
        body = json.loads(request.content)
        data = json.loads(body["contents"][0]["parts"][0]["text"])
        if "question" in data:
            assert "cv" not in data["context"]
            if data["context"].get("plan"):
                assert data["context"]["plan"]["phases"][0]["completed"] == 1
        seen.append((data, body["generationConfig"]["maxOutputTokens"]))
        return httpx.Response(200, json={
            "candidates": [{"content": {"role": "model", "parts": [
                {"text": json.dumps(_mock_result(data))},
            ]}, "finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 80, "candidatesTokenCount": 12,
                              "thoughtsTokenCount": 3, "totalTokenCount": 95},
        })

    async def check():
        transport = RequestBudget(httpx.MockTransport(respond))
        sdk = evaluation_client("synthetic-evaluation-key", transport)
        tasks = (CV_QUALITY, ROLE_MATCH, ROADMAP, MENTOR, LEGACY_CV)
        provider = ProviderRun(sdk, transport, {task.schema: task.name for task in tasks})
        try:
            rows = await gemini.run_suite(main.app, provider)
        finally:
            await sdk.aio.aclose()
            sdk.close()
            engine.dispose()
        assert len(rows) == 5 and all(row["status"] == "complete" for row in rows)
        assert all(all(row["automated_checks"].values()) for row in rows)
        report = provider.report()
        assert report["requests_sent"] == report["usage_records"] == len(seen) == 14
        assert report["recorded_billable_output_tokens"] == 14 * 15
        assert len(report["structured_outputs"]) == 14
        assert {cap for _, cap in seen} == {2048, 3072, 8192}

    asyncio.run(check())
