from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime, date
from typing import List, Optional


class CategorizeRequest(BaseModel):
    vendor_label: str
    category: str
    remember: bool = False


class VendorMappingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_id: UUID
    keyword: str
    vendor_label: str
    category: str
    created_by: str
    created_at: datetime


# ---- New (per-building user-defined expense categories) ----

class ExpenseCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_id: UUID
    name: str
    color: str
    is_default: bool
    is_active: bool


class ExpenseCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    color: str = Field(default="#4C72B0", pattern=r"^#[0-9A-Fa-f]{6}$")


class ExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ExpenseRow(BaseModel):
    transaction_id: UUID
    allocation_id: UUID
    date: date
    amount: float
    description: str
    vendor_label: Optional[str] = None
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None


class SetCategoryRequest(BaseModel):
    category_id: Optional[UUID] = None  # null = unassign


class BulkCategorizeRequest(BaseModel):
    transaction_ids: List[UUID]
    category_id: Optional[UUID] = None  # null = unassign


class BulkCategorizeResponse(BaseModel):
    updated: int
