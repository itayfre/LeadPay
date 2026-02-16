from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from ..database import Base


class MessageType(str, enum.Enum):
    REMINDER = "reminder"
    CONFIRMATION = "confirmation"
    CUSTOM = "custom"


class DeliveryStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"


class Message(Base):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    building_id = Column(UUID(as_uuid=True), ForeignKey("buildings.id"), nullable=False)
    message_type = Column(SQLEnum(MessageType), default=MessageType.REMINDER)
    message_text = Column(String, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    delivery_status = Column(SQLEnum(DeliveryStatus), default=DeliveryStatus.PENDING)
    period_month = Column(Integer, nullable=True)
    period_year = Column(Integer, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="messages")
    building = relationship("Building", back_populates="messages")
