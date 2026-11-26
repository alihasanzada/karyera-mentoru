import asyncio
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_db
from app.db.db_models import AnalysisRecord, EvaluationCache, LoginSession, RoadmapRecord, User
from app.main import app
from app.models.schemas import EvaluationLLMOutput, MatchLLMOutput, RoadmapLLMOutput
from app.services import ai_analyzer, history
from app.services.ai_analyzer import AIAnalysisError
from app.services.inflight import InFlight
from test_api import evaluation, pdf_bytes, plan_payload


@pytest.fixture
def concurrent_api(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'concurrent.sqlite'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine)

    def get_test_db():
        with factory() as db:
            yield db

    with factory() as db:
        for user_id in (1, 2):
            db.add(User(id=user_id, email=f"user{user_id}@example.test", password_hash="unused"))
            db.add(LoginSession(
                token_hash=sha256(f"otp1.test-{user_id}".encode()).hexdigest(), user_id=user_id,
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            ))
        db.commit()
    app.dependency_overrides[get_db] = get_test_db
    try:
        yield factory
    finally:
        app.dependency_overrides.pop(get_db)
        engine.dispose()


def cookie(user_id):
    return {"Cookie": f"session=otp1.test-{user_id}"}


async def overlap(request, flight, release, monkeypatch, other_request=None):
    joined = asyncio.Event()
    calls = 0
    run = flight.run

    async def observe(key, work):
        nonlocal calls
        calls += 1
        if calls == 2:
            joined.set()
        return await run(key, work)

    with monkeypatch.context() as patch:
        patch.setattr(flight, "run", observe)
        first = asyncio.create_task(request())
        second = asyncio.create_task((other_request or request)())
        await asyncio.wait_for(joined.wait(), timeout=5)
        release.set()
        return await asyncio.gather(first, second)


def test_evaluation_deduplicates_provider_and_history_but_keeps_refresh_and_owners(
    concurrent_api, pdf_bytes, monkeypatch,
):
    async def scenario():
        release = asyncio.Event()

        async def provider(model, prompt, contents, schema):
            await release.wait()
            if schema is EvaluationLLMOutput:
                return schema(summary="Sınaq", detected_skills=[], verdicts=[])
            assert schema is MatchLLMOutput
            return schema(required=[], preferred=[], summary="Sınaq", action_plan=[])

        calls = AsyncMock(side_effect=provider)
        monkeypatch.setattr(ai_analyzer, "get_client", lambda: object())
        monkeypatch.setattr(ai_analyzer, "_call", calls)
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver",
        ) as client:
            async def upload(owner=1, filename="fictional.pdf", refresh=False):
                return await client.post("/api/evaluate", params={"refresh": str(refresh).lower()},
                                         data={"field_id": "cybersecurity"}, headers=cookie(owner),
                                         files={"file": (filename, pdf_bytes, "application/pdf")})

            first, duplicate = await overlap(upload, app.state.evaluations, release, monkeypatch)
            assert first.status_code == duplicate.status_code == 200
            assert first.json() == duplicate.json()
            assert calls.await_count == 2
            assert (await upload()).status_code == 200
            assert calls.await_count == 2

            release.clear()
            refreshed, renamed = await overlap(
                lambda: upload(refresh=True), app.state.evaluations, release, monkeypatch,
                lambda: upload(filename="alternate.pdf", refresh=True),
            )
            assert refreshed.status_code == renamed.status_code == 200
            assert refreshed.json()["evaluation_id"] != renamed.json()["evaluation_id"]
            assert renamed.json()["filename"] == renamed.json()["match"]["filename"] == "alternate.pdf"
            assert calls.await_count == 4
            assert (await upload(owner=2)).status_code == 200
            assert calls.await_count == 6
            assert (await upload(refresh=True)).status_code == 200
            assert calls.await_count == 8

    asyncio.run(scenario())
    with concurrent_api() as db:
        assert db.scalar(select(func.count()).select_from(EvaluationCache)) == 2
        assert db.scalar(select(func.count()).select_from(AnalysisRecord)) == 6


def test_roadmap_deduplicates_failures_retries_and_preserves_ownership(concurrent_api, evaluation, monkeypatch):
    with concurrent_api() as db:
        evaluation_id = history.save_record(db, "user-1", "evaluation", "fictional.pdf", evaluation)

    async def scenario():
        release = asyncio.Event()
        outcomes = iter([AIAnalysisError("Sınaq xətası"), None])

        async def provider(model, prompt, contents, schema):
            error = next(outcomes)
            await release.wait()
            if error:
                raise error
            return RoadmapLLMOutput.model_validate(plan_payload("day", (1, 8, 15)))

        calls = AsyncMock(side_effect=provider)
        monkeypatch.setattr(ai_analyzer, "_call", calls)
        monkeypatch.setattr(ai_analyzer, "get_client", lambda: object())
        monkeypatch.setattr(ai_analyzer, "ROUNDS", 1)
        path = f"/api/roadmap/{evaluation_id}"
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver",
        ) as client:
            async def generate():
                return await client.post(path, headers=cookie(1))

            failed = await overlap(generate, app.state.roadmaps, release, monkeypatch)
            assert [r.status_code for r in failed] == [502, 502]
            assert calls.await_count == 1
            release.clear()
            first, duplicate = await overlap(generate, app.state.roadmaps, release, monkeypatch)
            assert first.status_code == duplicate.status_code == 200
            assert first.json() == duplicate.json()
            assert calls.await_count == 2
            assert (await client.post(path, headers=cookie(2))).status_code == 404
            assert (await generate()).status_code == 200
            assert calls.await_count == 2

    asyncio.run(scenario())
    with concurrent_api() as db:
        assert db.scalar(select(func.count()).select_from(RoadmapRecord)) == 1


def test_cancelling_a_waiter_keeps_shared_work_alive():
    async def scenario():
        flight = InFlight[int]()
        started = asyncio.Event()
        release = asyncio.Event()

        async def work():
            started.set()
            await release.wait()
            return 42

        generate = AsyncMock(side_effect=work)
        first = asyncio.create_task(flight.run("same", generate))
        await started.wait()
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        second = asyncio.create_task(flight.run("same", generate))
        release.set()
        assert await second == 42
        generate.assert_awaited_once()
        await flight.close()

    asyncio.run(scenario())
