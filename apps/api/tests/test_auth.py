from app.auth.mock_auth import DEV_SEED_PASSWORD
from tests.conftest import login_as


async def test_login_with_seeded_email_succeeds_and_sets_cookie(client):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "alice@mnemo.dev", "password": DEV_SEED_PASSWORD}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "alice@mnemo.dev"
    assert "mnemo_session" in response.cookies


async def test_login_with_unknown_email_fails(client):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "nobody@mnemo.dev", "password": "whatever123"}
    )
    assert response.status_code == 401


async def test_login_with_wrong_password_fails(client):
    response = await client.post(
        "/api/v1/auth/login", json={"email": "alice@mnemo.dev", "password": "not-the-right-password"}
    )
    assert response.status_code == 401


async def test_signup_creates_user_and_logs_in(client):
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": "newuser@mnemo.dev", "display_name": "New User", "password": "a-secure-password"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "newuser@mnemo.dev"
    assert "mnemo_session" in response.cookies

    me_response = await client.get("/api/v1/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["user"]["email"] == "newuser@mnemo.dev"


async def test_signup_with_duplicate_email_fails(client):
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": "alice@mnemo.dev", "display_name": "Impersonator", "password": "a-secure-password"},
    )
    assert response.status_code == 400


async def test_signup_with_short_password_fails(client):
    response = await client.post(
        "/api/v1/auth/signup",
        json={"email": "shortpass@mnemo.dev", "display_name": "Short Pass", "password": "short"},
    )
    assert response.status_code == 422


async def test_me_without_session_is_unauthorized(client):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_me_with_session_returns_current_user(client):
    await login_as(client, "alice@mnemo.dev")
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "alice@mnemo.dev"
    assert body["spaces"] == []


async def test_logout_invalidates_session(client):
    await login_as(client, "alice@mnemo.dev")
    logout_response = await client.post("/api/v1/auth/logout")
    assert logout_response.status_code == 200

    me_response = await client.get("/api/v1/auth/me")
    assert me_response.status_code == 401
