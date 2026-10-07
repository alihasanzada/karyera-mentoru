import re

from fastapi import Header, HTTPException

CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def get_client_id(x_client_id: str = Header(default="")) -> str:
    if not CLIENT_ID_RE.match(x_client_id):
        raise HTTPException(status_code=400, detail="Etibarsız və ya çatışmayan X-Client-Id başlığı.")
    return x_client_id