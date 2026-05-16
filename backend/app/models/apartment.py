from sqlalchemy import Column, String, Integer, Numeric, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from ..database import Base


class Apartment(Base):
    __tablename__ = "apartments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    building_id = Column(UUID(as_uuid=True), ForeignKey("buildings.id"), nullable=False)
    number = Column(Integer, nullable=False)
    floor = Column(Integer, nullable=False)
    expected_payment = Column(Numeric(10, 2), nullable=True, comment="Overrides building default if set")

    standing_order_active = Column(Boolean, nullable=False, default=False, server_default="false")
    standing_order_start_month = Column(Integer, nullable=True)
    standing_order_start_year = Column(Integer, nullable=True)

    # Relationships
    building = relationship("Building", back_populates="apartments")
    tenants = relationship("Tenant", back_populates="apartment", cascade="all, delete-orphan")
