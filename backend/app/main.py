from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.config import BASE_DIR, settings
from app.db import db_models  # noqa: F401  (registers ORM tables on Base.metadata)
from app.db.database import Base, engine
from app.routers import applications, auth, cv, evaluate, history, match, roadmap

Base.metadata.create_all(bind=engine)


def _add_missing_user_columns() -> None:
    # create_all does not alter existing tables; add profile columns to older databases.
    existing = {c["name"] for c in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        for name in ("first_name", "last_name", "specialty_id"):
            if name not in existing:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} VARCHAR NOT NULL DEFAULT ''"))


_add_missing_user_columns()

app = FastAPI(title=settings.app_name, version="0.7.0")
app.include_router(auth.router)
app.include_router(cv.router)
app.include_router(match.router)
app.include_router(history.router)
app.include_router(evaluate.router)
app.include_router(roadmap.router)
app.include_router(applications.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serves the `dizayn/` site (landing page + API-connected CV check) at `/dizayn/`.
# Must be mounted before `/`, which would otherwise catch these paths.
app.mount("/dizayn", StaticFiles(directory=BASE_DIR / "dizayn", html=True), name="dizayn")

# Serves the `frontend/` directory at `/`
app.mount("/", StaticFiles(directory=BASE_DIR / "frontend", html=True), name="frontend")
