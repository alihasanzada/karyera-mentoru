from fastapi import APIRouter, Depends, HTTPException

from app.db.db_models import User
from app.deps import current_user
from app.models.schemas import ChatRequest, ChatResponse
from app.services.ai_analyzer import AIAnalysisError
from app.services.chat import chat_reply

router = APIRouter(prefix="/api/chat", tags=["Chat"])


# Login is required so anonymous visitors cannot spend the Gemini quota.
@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest, _user: User = Depends(current_user)):
    try:
        reply = await chat_reply(body.messages)
    except AIAnalysisError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    if not reply:
        raise HTTPException(status_code=502, detail="AI boş cavab qaytardı. Yenidən cəhd et.")
    return ChatResponse(reply=reply)
