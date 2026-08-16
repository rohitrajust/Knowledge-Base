async def test_liveness(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_readiness(client):
    response = await client.get("/health/db")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
