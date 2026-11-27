from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.db_models import User, UserProfile
from app.deps import current_user
from app.models.schemas import ProfileInput
from app.services.matcher import ROLES

router = APIRouter(prefix="/api/profile", tags=["Profile"])


def load_profile(db: Session, user_id: int) -> ProfileInput:
    row = db.get(UserProfile, user_id)
    return ProfileInput.model_validate_json(row.profile_json) if row else ProfileInput()


@router.get("", response_model=ProfileInput)
def get_profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return load_profile(db, user.id)


def store_profile(db: Session, user_id: int, profile: ProfileInput) -> None:
    statement = insert(UserProfile).values(user_id=user_id, profile_json=profile.model_dump_json())
    db.execute(statement.on_conflict_do_update(
        index_elements=[UserProfile.user_id], set_={"profile_json": statement.excluded.profile_json},
    ))


@router.put("", response_model=ProfileInput)
def save_profile(profile: ProfileInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if profile.field_id and profile.field_id not in ROLES:
        raise HTTPException(422, "Hədəf sahəni siyahıdan seç.")
    store_profile(db, user.id, profile)
    db.commit()
    return profile
