import os
from pathlib import Path
import subprocess
import sys

import pytest

from test_api import api


@pytest.mark.parametrize(("path", "payload", "field", "error_type"), [
    ("/api/auth/signup", {"password": "short"}, "password", "string_too_short"),
    ("/api/auth/login", {"password": {"nested": "fictional-password"}}, "password", "string_type"),
    ("/api/auth/otp/verify", {"code": ["987654"]}, "code", "string_type"),
    ("/api/auth/signup", ["fictional-password", "987654"], None, "model_attributes_type"),
])
def test_validation_never_returns_submitted_input(api, caplog, path, payload, field, error_type):
    client, _ = api
    response = client.post(path, json=payload)
    assert response.status_code == 422
    assert response.headers["Cache-Control"] == "no-store"
    errors = response.json()["detail"]
    error = next(e for e in errors if e["loc"][-1] == (field or "body"))
    assert error["type"] == error_type
    assert error["msg"]
    assert all("input" not in entry for entry in errors)
    if error_type == "string_too_short":
        assert error["ctx"] == {"min_length": 8}
    for submitted in ("fictional-password", "987654", '"input"', '"ctx":{"error"'):
        assert submitted not in response.text
        assert submitted not in caplog.text


def test_malformed_json_does_not_echo_body(api):
    client, _ = api
    response = client.post("/api/auth/login", content='{"password": "fictional-password",',
                           headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "json_invalid"
    assert "fictional-password" not in response.text


@pytest.mark.parametrize("args", [
    ["-c", "from app.main import app; assert app.openapi()"],
    ["-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider", "tests/test_api.py"],
])
def test_import_and_test_collection_leave_configured_database_untouched(tmp_path, args):
    path = tmp_path / "configured.sqlite"
    backend = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-B", *args], cwd=backend, capture_output=True, text=True, timeout=60,
        env={**os.environ, "DATABASE_PATH": str(path)},
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert not path.exists()
