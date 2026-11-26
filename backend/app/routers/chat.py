from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import User
from app.deps import current_user
from app.models.schemas import ChatRequest, ChatResponse, MentorRequest
from app.routers.mentor import ask_mentor

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(body: ChatRequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Earlier designs submit the full conversation. The account's saved history is authoritative.
    reply = await ask_mentor(MentorRequest(question=body.messages[-1].text), user, db)
    return ChatResponse(reply=reply.answer)
