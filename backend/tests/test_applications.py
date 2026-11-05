from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.database import Base, get_db
from app.main import app
from app.routers import applications

BODY = {"company": "Acme", "position": "Junior SOC Analyst"}


def _signed_in(email):
    c = TestClient(app)
    r = c.post("/api/auth/signup", json={"email": email, "password": "long-test-password"})
    assert r.status_code == 201
    return c


@pytest.fixture()
def clients():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False)

    def override_get_db():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield _signed_in("a@example.com"), _signed_in("b@example.com"), TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.fixture()
def client(clients):
    return clients[0]


def _create(client, **extra):
    return client.post("/api/applications", json={**BODY, **extra})


def test_create_defaults_and_list(client):
    r = _create(client)
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "applied"
    assert data["applied_date"] == datetime.now(timezone.utc).date().isoformat()
    assert data["notes"] == "" and data["next_step_date"] is None

    listed = client.get("/api/applications").json()
    assert [x["id"] for x in listed] == [data["id"]]


def test_list_is_newest_first(client):
    first = _create(client, company="First").json()["id"]
    second = _create(client, company="Second").json()["id"]
    ids = [x["id"] for x in client.get("/api/applications").json()]
    assert ids == [second, first]


def test_login_required(clients):
    anon = clients[2]
    assert anon.get("/api/applications").status_code == 401
    assert anon.post("/api/applications", json=BODY).status_code == 401


@pytest.mark.parametrize(
    "bad",
    [
        {"company": ""},
        {"company": "   "},
        {"position": ""},
        {"company": "x" * 121},
        {"status": "hired"},
        {"notes": "n" * 2001},
        {"applied_date": "not-a-date"},
    ],
)
def test_create_validation(client, bad):
    assert _create(client, **bad).status_code == 422


def test_text_is_stripped(client):
    data = _create(client, company="  Acme  ", position=" Dev ").json()
    assert data["company"] == "Acme" and data["position"] == "Dev"


def test_users_cannot_touch_each_others_applications(clients):
    a, b, _ = clients
    app_id = _create(a).json()["id"]

    assert b.get("/api/applications").json() == []
    assert b.patch(f"/api/applications/{app_id}", json={"status": "offer"}).status_code == 404
    assert b.delete(f"/api/applications/{app_id}").status_code == 404

    still = a.get("/api/applications").json()
    assert len(still) == 1 and still[0]["status"] == "applied"


def test_patch_changes_only_sent_fields(client):
    app_id = _create(client, notes="keep me", next_step="Send portfolio").json()["id"]

    r = client.patch(f"/api/applications/{app_id}", json={"status": "interview"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "interview"
    assert data["notes"] == "keep me" and data["next_step"] == "Send portfolio"
    assert data["company"] == "Acme"


def test_patch_empty_body_changes_nothing(client):
    created = _create(client).json()
    r = client.patch(f"/api/applications/{created['id']}", json={})
    assert r.status_code == 200
    assert r.json()["company"] == created["company"]


def test_patch_can_set_and_clear_next_step_date(client):
    app_id = _create(client).json()["id"]
    url = f"/api/applications/{app_id}"

    r = client.patch(url, json={"next_step_date": "2026-11-15"})
    assert r.json()["next_step_date"] == "2026-11-15"

    r = client.patch(url, json={"next_step_date": None})
    assert r.status_code == 200 and r.json()["next_step_date"] is None


@pytest.mark.parametrize("field", ["company", "position", "status", "applied_date", "notes", "next_step"])
def test_patch_rejects_null_for_required_fields(client, field):
    app_id = _create(client).json()["id"]
    r = client.patch(f"/api/applications/{app_id}", json={field: None})
    assert r.status_code == 422


def test_patch_validates_values(client):
    app_id = _create(client).json()["id"]
    url = f"/api/applications/{app_id}"
    assert client.patch(url, json={"status": "hired"}).status_code == 422
    assert client.patch(url, json={"company": "  "}).status_code == 422


def test_patch_unknown_id_is_404(client):
    assert client.patch("/api/applications/9999", json={"status": "offer"}).status_code == 404


def test_delete(client):
    app_id = _create(client).json()["id"]
    r = client.delete(f"/api/applications/{app_id}")
    assert r.status_code == 200 and r.json() == {"deleted": app_id}
    assert client.get("/api/applications").json() == []
    assert client.delete(f"/api/applications/{app_id}").status_code == 404


def test_status_filter(client):
    _create(client, company="One")
    _create(client, company="Two", status="interview")
    _create(client, company="Three", status="interview")

    interviews = client.get("/api/applications", params={"status": "interview"}).json()
    assert sorted(x["company"] for x in interviews) == ["Three", "Two"]
    assert client.get("/api/applications", params={"status": "bogus"}).status_code == 422


def test_per_client_limit(clients, monkeypatch):
    a, b, _ = clients
    monkeypatch.setattr(applications, "MAX_PER_CLIENT", 2)
    assert _create(a).status_code == 201
    assert _create(a).status_code == 201
    assert _create(a).status_code == 400
    assert _create(b).status_code == 201
