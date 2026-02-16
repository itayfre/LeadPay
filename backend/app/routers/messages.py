from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from ..database import get_db
from ..models import (
    Message, MessageType, DeliveryStatus,
    Building, Tenant, Apartment
)
from ..services.whatsapp_service import WhatsAppService
from ..routers.payments import get_payment_status

router = APIRouter(
    prefix="/api/v1/messages",
    tags=["messages"]
)


@router.post("/{building_id}/generate-reminders")
def generate_payment_reminders(
    building_id: UUID,
    month: Optional[int] = None,
    year: Optional[int] = None,
    only_unpaid: bool = True,
    db: Session = Depends(get_db)
):
    """
    Generate WhatsApp payment reminder messages for tenants.
    Returns wa.me links that can be clicked to send via WhatsApp Web.
    """
    # Verify building exists
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    # Get payment status for all tenants
    payment_status = get_payment_status(building_id, month, year, db)

    # Filter for unpaid tenants if requested
    tenants_data = payment_status['tenants']
    if only_unpaid:
        tenants_data = [t for t in tenants_data if t['status'] == 'unpaid']

    # Initialize WhatsApp service
    whatsapp = WhatsAppService()

    # Generate messages
    messages = []
    for tenant_data in tenants_data:
        tenant_id = UUID(tenant_data['tenant_id'])
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

        if not tenant or not tenant.phone:
            continue

        # Validate phone number
        if not whatsapp.validate_phone_number(tenant.phone):
            messages.append({
                'tenant_id': str(tenant_id),
                'tenant_name': tenant_data['tenant_name'],
                'error': 'Invalid phone number',
                'phone': tenant.phone
            })
            continue

        # Get language preference
        language = tenant.language.value if tenant.language else 'he'

        # Determine message type based on payment status
        message_type = whatsapp.get_message_type(
            tenant_data['paid_amount'],
            tenant_data['expected_amount']
        )

        # Generate appropriate message
        if message_type == 'payment_reminder':
            message_text = whatsapp.generate_payment_reminder(
                tenant_name=tenant_data['tenant_name'],
                building_name=building.name,
                apartment_number=tenant_data['apartment_number'],
                amount=tenant_data['expected_amount'],
                period=payment_status['period'],
                language=language
            )
        elif message_type == 'partial_payment':
            message_text = whatsapp.generate_partial_payment(
                tenant_name=tenant_data['tenant_name'],
                apartment_number=tenant_data['apartment_number'],
                paid_amount=tenant_data['paid_amount'],
                expected_amount=tenant_data['expected_amount'],
                period=payment_status['period'],
                language=language
            )
        elif message_type == 'overpayment':
            message_text = whatsapp.generate_overpayment(
                tenant_name=tenant_data['tenant_name'],
                apartment_number=tenant_data['apartment_number'],
                paid_amount=tenant_data['paid_amount'],
                expected_amount=tenant_data['expected_amount'],
                period=payment_status['period'],
                language=language
            )
        else:
            # Payment received - skip reminder
            continue

        # Create wa.me link
        whatsapp_link = whatsapp.create_whatsapp_link(
            phone_number=tenant.phone,
            message=message_text
        )

        # Save message to database (as pending)
        db_message = Message(
            tenant_id=tenant_id,
            building_id=building_id,
            message_type=MessageType.REMINDER,
            message_text=message_text,
            delivery_status=DeliveryStatus.PENDING,
            period_month=month or payment_status['period'].split('/')[0],
            period_year=year or payment_status['period'].split('/')[1]
        )
        db.add(db_message)

        messages.append({
            'message_id': None,  # Will be set after commit
            'tenant_id': str(tenant_id),
            'tenant_name': tenant_data['tenant_name'],
            'apartment_number': tenant_data['apartment_number'],
            'phone': tenant.phone,
            'language': language,
            'message_type': message_type,
            'amount_due': tenant_data['expected_amount'] - tenant_data['paid_amount'],
            'whatsapp_link': whatsapp_link,
            'message_preview': message_text[:100] + '...' if len(message_text) > 100 else message_text
        })

    # Commit all messages
    db.commit()

    return {
        'building_id': str(building_id),
        'building_name': building.name,
        'period': payment_status['period'],
        'total_messages': len(messages),
        'messages': messages,
        'instructions': 'Click on the whatsapp_link to open WhatsApp Web with pre-filled message. You just need to click Send!'
    }


@router.post("/message/{message_id}/mark-sent")
def mark_message_sent(
    message_id: UUID,
    db: Session = Depends(get_db)
):
    """Mark a message as sent (after user clicks Send in WhatsApp)"""
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Message with id {message_id} not found"
        )

    message.delivery_status = DeliveryStatus.SENT
    message.sent_at = datetime.utcnow()

    db.commit()

    return {
        'message_id': str(message_id),
        'status': 'sent',
        'sent_at': message.sent_at.isoformat()
    }


@router.get("/{building_id}/history")
def get_message_history(
    building_id: UUID,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get message history for a building"""
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    messages = db.query(Message, Tenant).join(Tenant).filter(
        Message.building_id == building_id
    ).order_by(Message.id.desc()).limit(limit).all()

    return {
        'building_id': str(building_id),
        'message_count': len(messages),
        'messages': [
            {
                'id': str(msg.id),
                'tenant_name': tenant.name,
                'message_type': msg.message_type.value,
                'delivery_status': msg.delivery_status.value,
                'sent_at': msg.sent_at.isoformat() if msg.sent_at else None,
                'period': f"{msg.period_month:02d}/{msg.period_year}" if msg.period_month else None,
                'message_preview': msg.message_text[:100] + '...' if len(msg.message_text) > 100 else msg.message_text
            }
            for msg, tenant in messages
        ]
    }


@router.get("/tenant/{tenant_id}/history")
def get_tenant_message_history(
    tenant_id: UUID,
    db: Session = Depends(get_db)
):
    """Get message history for a specific tenant"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )

    messages = db.query(Message).filter(
        Message.tenant_id == tenant_id
    ).order_by(Message.id.desc()).all()

    return {
        'tenant_id': str(tenant_id),
        'tenant_name': tenant.name,
        'message_count': len(messages),
        'messages': [
            {
                'id': str(msg.id),
                'message_type': msg.message_type.value,
                'delivery_status': msg.delivery_status.value,
                'sent_at': msg.sent_at.isoformat() if msg.sent_at else None,
                'period': f"{msg.period_month:02d}/{msg.period_year}" if msg.period_month else None,
                'message_text': msg.message_text
            }
            for msg in messages
        ]
    }


@router.post("/test-message")
def generate_test_message(
    tenant_name: str = "ישראל ישראלי",
    building_name: str = "בניין לדוגמה",
    apartment_number: int = 1,
    amount: float = 190.0,
    period: str = "01/2026",
    language: str = "he"
):
    """Generate a test WhatsApp message to preview formatting"""
    whatsapp = WhatsAppService()

    message = whatsapp.generate_payment_reminder(
        tenant_name=tenant_name,
        building_name=building_name,
        apartment_number=apartment_number,
        amount=amount,
        period=period,
        language=language
    )

    # Create test link
    test_phone = "+972501234567"
    whatsapp_link = whatsapp.create_whatsapp_link(test_phone, message)

    return {
        'message': message,
        'whatsapp_link': whatsapp_link,
        'note': 'This is a test message. Use the link format for actual tenant messages.'
    }
