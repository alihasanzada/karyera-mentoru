from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import BASE_DIR, settings
from app.db import db_models  # noqa: F401  (cədvəllərin qeydiyyatı üçün lazımdır)
from app.db.database import Base, engine
from app.routers import cv, history, match

Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name, version="0.4.0")
app.include_router(cv.router)
app.include_router(match.router)
app.include_router(history.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Mütləq sonda: frontend/ qovluğunu "/" ünvanında təqdim edir
app.mount("/", StaticFiles(directory=BASE_DIR / "frontend", html=True), name="frontend")