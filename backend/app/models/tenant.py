from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from ..database import Base


class OwnershipType(str, enum.Enum):
    OWNER = "בעלים"
    LANDLORD = "משכיר"
    RENTER = "שוכר"


class LanguagePreference(str, enum.Enum):
    HEBREW = "he"
    ENGLISH = "en"


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    apartment_id = Column(UUID(as_uuid=True), ForeignKey("apartments.id"), nullable=False)
    name = Column(String, nullable=False, comment="Display name (may be abbreviated)")
    full_name = Column(String, nullable=True, comment="Full name for bank matching")
    phone = Column(String, nullable=True, comment="Normalized to +972 format")
    email = Column(String, nullable=True)
    language = Column(SQLEnum(LanguagePreference), default=LanguagePreference.HEBREW)
    ownership_type = Column(SQLEnum(OwnershipType), nullable=False)
    is_committee_member = Column(Boolean, default=False)
    has_standing_order = Column(Boolean, default=False)
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    apartment = relationship("Apartment", back_populates="tenants")
    transactions = relationship("Transaction", back_populates="tenant")
    name_mappings = relationship("NameMapping", back_populates="tenant")
    messages = relationship("Message", back_populates="tenant")
