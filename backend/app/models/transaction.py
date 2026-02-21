from sqlalchemy import Column, String, DateTime, Numeric, Boolean, ForeignKey, Enum as SQLEnum, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from ..database import Base


class TransactionType(str, enum.Enum):
    PAYMENT = "payment"
    FEE = "fee"
    TRANSFER = "transfer"
    OTHER = "other"


class MatchMethod(str, enum.Enum):
    EXACT = "exact"
    FUZZY = "fuzzy"
    MANUAL = "manual"
    AMOUNT = "amount"
    REVERSED_NAME = "reversed_name"


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id = Column(UUID(as_uuid=True), ForeignKey("bank_statements.id"), nullable=False)
    activity_date = Column(DateTime, nullable=False)
    reference_number = Column(String, nullable=True)
    description = Column(String, nullable=False, comment="Original Hebrew text from bank")
    credit_amount = Column(Numeric(10, 2), nullable=True)
    debit_amount = Column(Numeric(10, 2), nullable=True)
    balance = Column(Numeric(10, 2), nullable=True)
    transaction_type = Column(SQLEnum(TransactionType, values_callable=lambda x: [e.value for e in x]), default=TransactionType.OTHER)
    matched_tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    match_confidence = Column(Float, nullable=True, comment="Confidence score 0-1")
    match_method = Column(SQLEnum(MatchMethod, values_callable=lambda x: [e.value for e in x]), nullable=True)
    is_confirmed = Column(Boolean, default=False, comment="User verified this match")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    statement = relationship("BankStatement", back_populates="transactions")
    tenant = relationship("Tenant", back_populates="transactions")
