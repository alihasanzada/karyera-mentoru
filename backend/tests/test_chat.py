from unittest.mock import AsyncMock

from app.models.schemas import ChatMessage
from app.routers import chat as chat_router
from app.services.ai_analyzer import AIAnalysisError
from app.services.chat import build_conversation
from tests.test_api import api, signup  # noqa: F401  (pytest fixture)

QUESTION = {"messages": [{"role": "user", "text": "CV-də nə yazım?"}]}


def test_conversation_marks_speakers():
    text = build_conversation([
        ChatMessage(role="user", text="Salam"),
        ChatMessage(role="assistant", text="Salam! Necə kömək edim?"),
        ChatMessage(role="user", text="Staj"),
    ])
    assert text.startswith("<conversation>") and text.endswith("</conversation>")
    assert "İstifadəçi: Salam" in text and "Mentor: Salam! Necə kömək edim?" in text


def test_chat_requires_login(api):
    client, _ = api
    assert client.post("/api/chat", json=QUESTION).status_code == 401


def test_chat_returns_reply(api, monkeypatch):
    client, _ = api
    cookies = signup(client, "chat@example.com")
    reply = AsyncMock(return_value="Hər bəndi rəqəmlə bitir.")
    monkeypatch.setattr(chat_router, "chat_reply", reply)

    response = client.post("/api/chat", json=QUESTION, cookies=cookies)

    assert response.status_code == 200
    assert response.json() == {"reply": "Hər bəndi rəqəmlə bitir."}
    assert reply.await_args.args[0][0].text == "CV-də nə yazım?"


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
    monkeypatch.setattr(chat_router, "chat_reply", AsyncMock(side_effect=AIAnalysisError("AI xidməti hazırda əlçatan deyil.", 503)))

    response = client.post("/api/chat", json=QUESTION, cookies=cookies)

    assert response.status_code == 503
    assert response.json()["detail"] == "AI xidməti hazırda əlçatan deyil."
