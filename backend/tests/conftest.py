"""
Shared pytest configuration.

Provides:
- Default MANAGER auth stub (session-scoped, autouse).
- `as_role` fixture that temporarily swaps the stub to another role within a single test.
"""
import uuid
import pytest
from app.main import app
from app.dependencies.auth import get_current_user
from app.models.user import User, UserRole, UserStatus


def _user_with_role(role: UserRole) -> User:
    return User(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        email="test@leadpay.local",
        full_name=f"Test {role.value}",
        role=role,
        status=UserStatus.ACTIVE,
    )


_MANAGER_USER = _user_with_role(UserRole.MANAGER)


def _stub_current_user() -> User:
    return _MANAGER_USER


@pytest.fixture(autouse=True, scope="session")
def override_auth():
    app.dependency_overrides[get_current_user] = _stub_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def as_role():
    """
    Use within a test to temporarily flip the stub user's role:

        def test_workers_blocked(as_role):
            with as_role(UserRole.WORKER):
                r = client.delete(...)
                assert r.status_code == 403
    """
    from contextlib import contextmanager

    @contextmanager
    def _swap(role: UserRole):
        original = app.dependency_overrides[get_current_user]
        app.dependency_overrides[get_current_user] = lambda: _user_with_role(role)
        try:
            yield
        finally:
            app.dependency_overrides[get_current_user] = original

    return _swap
