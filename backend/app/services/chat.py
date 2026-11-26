from pathlib import Path

from app.models.schemas import ChatLLMOutput, ChatMessage
from app.services.ai_analyzer import generate_structured

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "chat.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8")
MAX_REPLY_CHARS = 2500

_SPEAKER = {"user": "İstifadəçi", "assistant": "Mentor"}


def build_conversation(messages: list[ChatMessage]) -> str:
    lines = [f"{_SPEAKER[m.role]}: {m.text}" for m in messages]
    return "<conversation>\n" + "\n\n".join(lines) + "\n</conversation>"


async def chat_reply(messages: list[ChatMessage]) -> str:
    result = await generate_structured(SYSTEM_PROMPT, build_conversation(messages), ChatLLMOutput)
    return result.reply.strip()[:MAX_REPLY_CHARS]
