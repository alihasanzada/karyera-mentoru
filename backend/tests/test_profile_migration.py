from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db.database import Base
from app.db.profile_migration import backfill_design_profiles
from app.models.schemas import ProfileInput
from app.routers.auth import _create_user
from app.routers.profile import load_profile, store_profile


def test_design_profile_backfill_preserves_saved_beta_profile_and_allows_new_signup():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR UNIQUE NOT NULL, "
            "password_hash VARCHAR NOT NULL, created_at DATETIME NOT NULL, first_name VARCHAR NOT NULL, "
            "last_name VARCHAR NOT NULL, specialty_id VARCHAR NOT NULL)"
        ))
        conn.execute(text(
            "INSERT INTO users VALUES "
            "(1, 'one@example.test', 'test-hash', CURRENT_TIMESTAMP, 'Aysel', 'Aliyeva', 'frontend'), "
            "(2, 'two@example.test', 'test-hash', CURRENT_TIMESTAMP, 'Ali', 'Hasanov', 'cybersecurity')"
        ))
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        store_profile(db, 2, ProfileInput(name="Existing", interests="Accessibility"))
        db.commit()
    backfill_design_profiles(engine)
    backfill_design_profiles(engine)
    with Session(engine) as db:
        assert load_profile(db, 1).field_id == "frontend"
        assert load_profile(db, 1).name == "Aysel"
        assert load_profile(db, 2).interests == "Accessibility"
        assert load_profile(db, 2).name == "Existing"
        user = _create_user(db, "new@example.test", "test-hash")
        assert user.id == 3
        store_profile(db, user.id, ProfileInput(name="New", field_id="data_science"))
        db.commit()
        assert load_profile(db, user.id).field_id == "data_science"
        assert db.execute(text("SELECT first_name FROM users WHERE id = 1")).scalar_one() == "Aysel"
    engine.dispose()
