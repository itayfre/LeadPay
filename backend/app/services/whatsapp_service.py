"""
WhatsApp Message Service
Generates payment reminder messages and wa.me links for sending via WhatsApp.
"""

from typing import Dict, Optional
from datetime import datetime
import urllib.parse


class WhatsAppService:
    """Service for generating WhatsApp messages and links"""

    # Default message templates
    TEMPLATES = {
        'he': {
            'payment_reminder': """
שלום {tenant_name},

תזכורת ידידותית לתשלום דמי הבית עבור {building_name}.

🏠 דירה: {apartment_number}
💰 סכום לתשלום: {amount}₪
📅 תקופה: {period}

אנא העבירו את התשלום בהקדם האפשרי.

תודה רבה!
            """.strip(),
            'payment_received': """
שלום {tenant_name},

קיבלנו את תשלומך עבור דמי הבית!

🏠 דירה: {apartment_number}
💰 סכום שהתקבל: {amount}₪
📅 תקופה: {period}

תודה רבה!
            """.strip(),
            'partial_payment': """
שלום {tenant_name},

קיבלנו תשלום חלקי עבור דמי הבית.

🏠 דירה: {apartment_number}
💰 סכום שהתקבל: {paid_amount}₪
💰 סכום צפוי: {expected_amount}₪
📊 יתרה לתשלום: {remaining}₪
📅 תקופה: {period}

אנא השלימו את היתרה בהקדם האפשרי.

תודה!
            """.strip(),
            'overpayment': """
שלום {tenant_name},

קיבלנו תשלום עבור דמי הבית.

🏠 דירה: {apartment_number}
💰 סכום שהתקבל: {paid_amount}₪
💰 סכום צפוי: {expected_amount}₪
📊 תשלום יתר: {overpayment}₪
📅 תקופה: {period}

התשלום היתר יקוזז מהחודש הבא.

תודה רבה!
            """.strip()
        },
        'en': {
            'payment_reminder': """
Hello {tenant_name},

Friendly reminder for building maintenance payment for {building_name}.

🏠 Apartment: {apartment_number}
💰 Amount due: ₪{amount}
📅 Period: {period}

Please transfer the payment as soon as possible.

Thank you!
            """.strip(),
            'payment_received': """
Hello {tenant_name},

We received your building maintenance payment!

🏠 Apartment: {apartment_number}
💰 Amount received: ₪{amount}
📅 Period: {period}

Thank you!
            """.strip(),
            'partial_payment': """
Hello {tenant_name},

We received a partial payment for building maintenance.

🏠 Apartment: {apartment_number}
💰 Amount received: ₪{paid_amount}
💰 Expected amount: ₪{expected_amount}
📊 Balance due: ₪{remaining}
📅 Period: {period}

Please complete the balance as soon as possible.

Thank you!
            """.strip(),
            'overpayment': """
Hello {tenant_name},

We received your building maintenance payment.

🏠 Apartment: {apartment_number}
💰 Amount received: ₪{paid_amount}
💰 Expected amount: ₪{expected_amount}
📊 Overpayment: ₪{overpayment}
📅 Period: {period}

The overpayment will be credited to next month.

Thank you!
            """.strip()
        }
    }

    def __init__(self):
        pass

    def generate_payment_reminder(
        self,
        tenant_name: str,
        building_name: str,
        apartment_number: int,
        amount: float,
        period: str,
        language: str = 'he',
        custom_message: Optional[str] = None
    ) -> str:
        """
        Generate a payment reminder message.

        Args:
            tenant_name: Tenant's name
            building_name: Building name
            apartment_number: Apartment number
            amount: Amount to pay
            period: Payment period (e.g., "01/2026")
            language: Message language ('he' or 'en')
            custom_message: Custom template (overrides default)

        Returns:
            Formatted message text
        """
        template = custom_message or self.TEMPLATES.get(language, self.TEMPLATES['he'])['payment_reminder']

        return template.format(
            tenant_name=tenant_name,
            building_name=building_name,
            apartment_number=apartment_number,
            amount=f"{amount:.0f}",
            period=period
        )

    def generate_payment_received(
        self,
        tenant_name: str,
        apartment_number: int,
        amount: float,
        period: str,
        language: str = 'he'
    ) -> str:
        """Generate a payment confirmation message"""
        template = self.TEMPLATES.get(language, self.TEMPLATES['he'])['payment_received']

        return template.format(
            tenant_name=tenant_name,
            apartment_number=apartment_number,
            amount=f"{amount:.0f}",
            period=period
        )

    def generate_partial_payment(
        self,
        tenant_name: str,
        apartment_number: int,
        paid_amount: float,
        expected_amount: float,
        period: str,
        language: str = 'he'
    ) -> str:
        """Generate a partial payment notification"""
        remaining = expected_amount - paid_amount
        template = self.TEMPLATES.get(language, self.TEMPLATES['he'])['partial_payment']

        return template.format(
            tenant_name=tenant_name,
            apartment_number=apartment_number,
            paid_amount=f"{paid_amount:.0f}",
            expected_amount=f"{expected_amount:.0f}",
            remaining=f"{remaining:.0f}",
            period=period
        )

    def generate_overpayment(
        self,
        tenant_name: str,
        apartment_number: int,
        paid_amount: float,
        expected_amount: float,
        period: str,
        language: str = 'he'
    ) -> str:
        """Generate an overpayment notification"""
        overpayment = paid_amount - expected_amount
        template = self.TEMPLATES.get(language, self.TEMPLATES['he'])['overpayment']

        return template.format(
            tenant_name=tenant_name,
            apartment_number=apartment_number,
            paid_amount=f"{paid_amount:.0f}",
            expected_amount=f"{expected_amount:.0f}",
            overpayment=f"{overpayment:.0f}",
            period=period
        )

    def create_whatsapp_link(
        self,
        phone_number: str,
        message: str
    ) -> str:
        """
        Create a wa.me link for opening WhatsApp with pre-filled message.

        Args:
            phone_number: Phone number in international format (e.g., +972501234567)
            message: Pre-filled message text

        Returns:
            WhatsApp wa.me URL
        """
        # Clean phone number (remove spaces, dashes, etc.)
        clean_phone = ''.join(filter(str.isdigit, phone_number.replace('+', '')))

        # URL-encode the message
        encoded_message = urllib.parse.quote(message)

        # Create wa.me link
        return f"https://wa.me/{clean_phone}?text={encoded_message}"

    def validate_phone_number(self, phone: str) -> bool:
        """Validate that phone number is in correct format"""
        if not phone:
            return False

        # Should start with +972 or be a valid Israeli number
        clean = ''.join(filter(str.isdigit, phone))

        # Israeli mobile numbers are 9-10 digits (with country code)
        return len(clean) >= 9 and (phone.startswith('+972') or phone.startswith('972'))

    def get_message_type(
        self,
        paid_amount: float,
        expected_amount: float
    ) -> str:
        """
        Determine the appropriate message type based on payment status.

        Returns:
            'payment_reminder', 'payment_received', 'partial_payment', or 'overpayment'
        """
        if paid_amount == 0:
            return 'payment_reminder'
        elif paid_amount < expected_amount - 1.0:  # Allow 1 shekel tolerance
            return 'partial_payment'
        elif paid_amount > expected_amount + 1.0:
            return 'overpayment'
        else:
            return 'payment_received'
