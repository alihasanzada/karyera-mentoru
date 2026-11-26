from app.services import login_otp


def verify_login(client, credentials):
    challenge = client.post("/api/auth/login", json=credentials)
    assert challenge.status_code == 202
    assert "session" not in challenge.cookies
    recipient, code = login_otp.send_login_code.call_args.args
    assert recipient == credentials["email"].strip().lower()
    response = client.post("/api/auth/otp/verify", json={"code": code})
    assert response.status_code == 200
    return response
