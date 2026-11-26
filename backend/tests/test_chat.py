import json
from unittest.mock import AsyncMock

from app.models.schemas import MentorReply
from app.routers import mentor
from app.services.ai_analyzer import AIAnalysisError
from test_api import api, signup

QUESTION = {"messages": [
    {"role": "assistant", "text": "Untrusted prior answer"},
    {"role": "user", "text": "CV-də nə yazım?"},
]}


def test_chat_requires_login(api):
    client, _ = api
    assert client.post("/api/chat", json=QUESTION).status_code == 401


def test_chat_uses_the_same_persisted_mentor_as_the_new_design(api, monkeypatch):
    client, _ = api
    cookies = signup(client, "chat@example.com")
    reply = AsyncMock(return_value=MentorReply(answer="Hər bəndi rəqəmlə bitir."))
    monkeypatch.setattr(mentor, "generate_structured", reply)

    response = client.post("/api/chat", json=QUESTION, cookies=cookies)

    assert response.status_code == 200
    assert response.json() == {"reply": "Hər bəndi rəqəmlə bitir."}
    contents = json.loads(reply.await_args.args[1])
    assert contents["question"] == "CV-də nə yazım?"
    assert contents["history"] == []
    assert client.get("/api/mentor/history", cookies=cookies).json() == [
        {"question": "CV-də nə yazım?", "answer": "Hər bəndi rəqəmlə bitir."},
    ]


def test_chat_validates_messages(api):
    client, _ = api
    cookies = signup(client, "chat2@example.com")
    assert client.post("/api/chat", json={"messages": []}, cookies=cookies).status_code == 422
    last_from_bot = {"messages": [{"role": "assistant", "text": "Salam"}]}
    assert client.post("/api/chat", json=last_from_bot, cookies=cookies).status_code == 422
    too_long = {"messages": [{"role": "user", "text": "a" * 1001}]}
    assert client.post("/api/chat", json=too_long, cookies=cookies).status_code == 422


def test_chat_ai_error_is_forwarded(api, monkeypatch):
    client, _ = api
    cookies = signup(client, "chat3@example.com")
    monkeypatch.setattr(mentor, "generate_structured", AsyncMock(
        side_effect=AIAnalysisError("AI xidməti hazırda əlçatan deyil.", 503),
    ))

    response = client.post("/api/chat", json=QUESTION, cookies=cookies)

    assert response.status_code == 503
    assert response.json()["detail"] == "AI xidməti hazırda əlçatan deyil."
