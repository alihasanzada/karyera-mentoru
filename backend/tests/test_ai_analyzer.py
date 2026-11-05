import asyncio
from unittest.mock import AsyncMock

import httpx
import httpx2
import pytest
from google.genai import errors
from pydantic import BaseModel

from app.services import ai_analyzer as ai


class Result(BaseModel):
    answer: str


@pytest.fixture
def model_setup(monkeypatch):
    monkeypatch.setattr(ai, "get_client", lambda: object())
    monkeypatch.setattr(ai.settings, "gemini_models", "primary,backup")
    monkeypatch.setattr(ai, "ROUNDS", 1)


@pytest.mark.parametrize("error", [httpx.ConnectError("offline"), httpx2.ConnectError("offline"),
                                   TimeoutError(), ai.AIAnalysisError("bad format")])
def test_recovers_with_backup(model_setup, monkeypatch, error):
    call = AsyncMock(side_effect=[error, Result(answer="ok")])
    monkeypatch.setattr(ai, "_call", call)
    assert asyncio.run(ai.generate_structured("system", "cv", Result)).answer == "ok"
    assert [c.args[0] for c in call.await_args_list] == ["primary", "backup"]


def test_exhausted_transport_errors_are_service_unavailable(model_setup, monkeypatch):
    monkeypatch.setattr(ai, "_call", AsyncMock(side_effect=httpx.ConnectError("private transport detail")))
    with pytest.raises(ai.AIAnalysisError) as exc:
        asyncio.run(ai.generate_structured("system", "cv", Result))
    assert exc.value.status_code == 503
    assert "private" not in str(exc.value)


def test_dead_models_are_not_retried_or_delayed(model_setup, monkeypatch):
    monkeypatch.setattr(ai, "ROUNDS", 2)
    call = AsyncMock(side_effect=errors.ClientError(404, {"error": {"message": "not found"}}))
    sleep = AsyncMock()
    monkeypatch.setattr(ai, "_call", call)
    monkeypatch.setattr(ai.asyncio, "sleep", sleep)
    with pytest.raises(ai.AIAnalysisError):
        asyncio.run(ai.generate_structured("system", "cv", Result))
    assert call.await_count == 2
    sleep.assert_not_awaited()
