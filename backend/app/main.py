from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import BASE_DIR, settings
from app.db import db_models  # noga: F401  (It is required for the registration of schedules and other models in the database)
from app.db.database import Base, engine
from app.routers import cv, evaluate, history, match, roadmap

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name, version="0.4.0")
app.include_router(cv.router)
app.include_router(match.router)
app.include_router(history.router)
app.include_router(evaluate.router)
app.include_router(roadmap.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serves the `frontend/` directory at `/`
app.mount("/", StaticFiles(directory=BASE_DIR / "frontend", html=True), name="frontend")