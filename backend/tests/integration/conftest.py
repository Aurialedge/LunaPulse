from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_settings(tmp_path, gemini_api_key: str = "") -> Settings:
    # _env_file=None: tests never read backend/.env, so they never see a real key.
    return Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'test.db'}", gemini_api_key=gemini_api_key)


@pytest.fixture
def client(tmp_path) -> Iterator[TestClient]:
    with TestClient(create_app(make_settings(tmp_path))) as test_client:
        yield test_client
