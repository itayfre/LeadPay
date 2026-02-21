from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from typing import Optional
from uuid import UUID

from ..models.tenant import OwnershipType, LanguagePreference


class TenantBase(BaseModel):
    name: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    language: LanguagePreference = LanguagePreference.HEBREW
    ownership_type: OwnershipType
    is_committee_member: bool = False
    has_standing_order: bool = False
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class TenantCreate(TenantBase):
    apartment_id: UUID


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    language: Optional[LanguagePreference] = None
    ownership_type: Optional[OwnershipType] = None
    is_committee_member: Optional[bool] = None
    has_standing_order: Optional[bool] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class TenantResponse(TenantBase):
    id: UUID
    apartment_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TenantImportRow(BaseModel):
    """Schema for importing a tenant from Excel"""
    apartment_number: int
    floor: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    ownership_type: str
    expected_payment: Optional[float] = None
