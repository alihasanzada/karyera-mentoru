from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import BASE_DIR, settings
from app.db import db_models  # noqa: F401  (registers ORM tables on Base.metadata)
from app.db.database import Base, engine
from app.db.profile_migration import backfill_design_profiles
from app.routers import applications, auth, chat, cv, evaluate, history, match, mentor, profile, roadmap
from app.services.request_limits import BetaRequestLimits

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    backfill_design_profiles(engine)
    app.state.request_limits = BetaRequestLimits()
    yield


app = FastAPI(title=settings.app_name, version="0.7.0", lifespan=lifespan)
app.state.request_limits = BetaRequestLimits()


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # An error's input may be the entire submitted body, even for a missing field.
    details = []
    for error in exc.errors():
        detail = {key: error[key] for key in ("loc", "msg", "type")}
        bounds = {key: value for key, value in (error.get("ctx") or {}).items()
                  if key in {"min_length", "max_length", "ge", "gt", "le", "lt"}
                  and isinstance(value, (int, float))}
        if bounds:
            detail["ctx"] = bounds
        details.append(detail)
    headers = {"Cache-Control": "no-store"} if request.url.path.startswith("/api/auth/") else None
    return JSONResponse({"detail": details}, status_code=422, headers=headers)


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
