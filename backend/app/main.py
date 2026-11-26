from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import BASE_DIR, settings
from app.db import db_models  # noqa: F401  (registers ORM tables on Base.metadata)
from app.db.database import Base, engine
from app.db.profile_migration import backfill_design_profiles
from app.routers import applications, auth, chat, cv, evaluate, history, match, mentor, profile, roadmap
from app.services.request_limits import BetaRequestLimits

Base.metadata.create_all(bind=engine)
backfill_design_profiles(engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.request_limits = BetaRequestLimits()
    yield


app = FastAPI(title=settings.app_name, version="0.7.0", lifespan=lifespan)
app.state.request_limits = BetaRequestLimits()


@app.middleware("http")
async def limit_requests(request, call_next):
    return await app.state.request_limits(request, call_next)


app.include_router(auth.router)
app.include_router(cv.router)
app.include_router(match.router)
app.include_router(history.router)
app.include_router(evaluate.router)
app.include_router(roadmap.router)
app.include_router(applications.router)
app.include_router(profile.router)
app.include_router(mentor.router)
app.include_router(chat.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serves the `dizayn/` site (landing page + API-connected CV check) at `/dizayn/`.
# Must be mounted before `/`, which would otherwise catch these paths.
app.mount("/dizayn", StaticFiles(directory=BASE_DIR / "dizayn", html=True), name="dizayn")

# Serves the `frontend/` directory at `/`
app.mount("/", StaticFiles(directory=BASE_DIR / "frontend", html=True), name="frontend")
