"""
Shared pytest configuration.

Overrides the get_current_user FastAPI dependency with a fixture that returns a
stub MANAGER user, so integration tests can call authenticated endpoints without
spinning up the full auth stack (JWTs, DB user lookup).
"""
import uuid
import pytest
from app.main import app
from app.dependencies.auth import get_current_user
from app.models.user import User, UserRole, UserStatus


_MANAGER_USER = User(
    id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
    email="test@leadpay.local",
    full_name="Test Manager",
    role=UserRole.MANAGER,
    status=UserStatus.ACTIVE,
)


def _stub_current_user() -> User:
    return _MANAGER_USER


@pytest.fixture(autouse=True, scope="session")
def override_auth():
    app.dependency_overrides[get_current_user] = _stub_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)
