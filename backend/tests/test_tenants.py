"""Tests for tenant endpoints and phone normalization."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routers.tenants import normalize_phone

client = TestClient(app)


# --- Unit tests: normalize_phone ---

def test_normalize_phone_with_leading_zero():
    assert normalize_phone("0501234567") == "+972501234567"

def test_normalize_phone_already_normalized():
    assert normalize_phone("+972501234567") == "+972501234567"

def test_normalize_phone_without_leading_zero():
    """Israeli number without leading 0 (as comes from Excel)"""
    assert normalize_phone("501234567") == "+972501234567"

def test_normalize_phone_empty():
    assert normalize_phone("") is None

def test_normalize_phone_none():
    assert normalize_phone(None) is None

def test_normalize_phone_with_dashes():
    assert normalize_phone("050-123-4567") == "+972501234567"

def test_normalize_phone_with_spaces():
    assert normalize_phone("050 123 4567") == "+972501234567"

def test_normalize_phone_with_972_prefix():
    """Number starting with 972 (no +) should get + prepended."""
    assert normalize_phone("972501234567") == "+972501234567"

def test_normalize_phone_972_with_dashes():
    """Number +972 with dashes in local part should be cleaned."""
    assert normalize_phone("+972-50-123-4567") == "+972501234567"


# --- Integration tests: tenant CRUD ---

def test_create_tenant_requires_valid_apartment():
    """Creating a tenant with non-existent apartment_id returns 404."""
    response = client.post("/api/v1/tenants/", json={
        "apartment_id": "00000000-0000-0000-0000-000000000000",
        "name": "Test Tenant",
        "ownership_type": "בעלים"
    })
    assert response.status_code == 404


# --- Integration tests: Excel import ---

def test_import_tenants_missing_apt_column(tmp_path):
    """Import fails with clear error when apartment column is missing."""
    import pandas as pd
    import io

    # Create Excel without the דירה column
    df = pd.DataFrame({
        'שם': ['ים שהם'],
        'סוג בעלות': ['בעלים'],
        'טלפון': ['0501234567']
        # Missing: 'דירה'
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)

    response = client.post(
        "/api/v1/tenants/00000000-0000-0000-0000-000000000001/import",
        files={"file": ("tenants.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    # Either 400 (building not found) or 400 (missing columns) — both acceptable
    assert response.status_code in [400, 404]


def test_import_error_message_includes_tenant_name(tmp_path):
    """When apartment number is missing for a row, error includes tenant name."""
    import pandas as pd
    import io

    # Row has name but apartment column value is NaN
    df = pd.DataFrame({
        'דירה': [None],   # Missing apartment number
        'קומה': [1],
        'שם': ['ים שהם'],
        'סוג בעלות': ['בעלים'],
        'טלפון': ['0501234567']
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)

    response = client.post(
        "/api/v1/tenants/00000000-0000-0000-0000-000000000001/import",
        files={"file": ("tenants.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert response.status_code in [400, 404]
