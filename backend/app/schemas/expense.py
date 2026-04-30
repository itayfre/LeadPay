from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime


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
