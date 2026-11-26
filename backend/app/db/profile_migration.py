from sqlalchemy import Connection, Engine, inspect, text
from sqlalchemy.dialects.sqlite import insert

from app.db.db_models import UserProfile
from app.models.schemas import ProfileInput


def has_legacy_design_columns(connection: Connection) -> bool:
    key = "has_legacy_design_columns"
    if key not in connection.info:
        columns = {"first_name", "last_name", "specialty_id"}
        connection.info[key] = columns.issubset(
            column["name"] for column in inspect(connection).get_columns("users")
        )
    return connection.info[key]


def backfill_design_profiles(engine: Engine) -> None:
    """Copy profiles from design-branch databases without changing their source rows."""
    with engine.begin() as connection:
        if not has_legacy_design_columns(connection):
            return
        rows = connection.execute(text(
            "SELECT users.id, first_name, last_name, specialty_id FROM users "
            "LEFT JOIN user_profiles ON users.id = user_profiles.user_id "
            "WHERE user_profiles.user_id IS NULL"
        )).mappings()
        profiles = []
        for row in rows:
            profile = ProfileInput(
                name=row["first_name"] or "",
                surname=row["last_name"] or "",
                field_id=row["specialty_id"] or "",
            )
            if profile.name or profile.surname or profile.field_id:
                profiles.append({"user_id": row["id"], "profile_json": profile.model_dump_json()})
        if profiles:
            connection.execute(insert(UserProfile).on_conflict_do_nothing(), profiles)
