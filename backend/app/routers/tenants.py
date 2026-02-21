from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from uuid import UUID
import pandas as pd
import io

from ..database import get_db
from ..models import Tenant, Apartment, Building, OwnershipType
from ..schemas import TenantCreate, TenantUpdate, TenantResponse

router = APIRouter(
    prefix="/api/v1/tenants",
    tags=["tenants"]
)


def normalize_phone(phone: str) -> str:
    """Normalize phone number to +972 format"""
    if not phone:
        return None

    phone_str = str(phone).strip()

    # If already in +972 format, return as-is (strip only non-digits after the +)
    if phone_str.startswith('+972'):
        digits = ''.join(filter(str.isdigit, phone_str[4:]))
        return '+972' + digits

    # Remove spaces, dashes, and other non-numeric characters
    phone_digits = ''.join(filter(str.isdigit, phone_str))

    # If it starts with 972 (country code without +), strip it
    if phone_digits.startswith('972'):
        return '+972' + phone_digits[3:]

    # If it starts with 0, replace with +972
    if phone_digits.startswith('0'):
        return '+972' + phone_digits[1:]

    # Otherwise prepend +972
    return '+972' + phone_digits


@router.post("/", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(tenant: TenantCreate, db: Session = Depends(get_db)):
    """Create a new tenant"""
    # Verify apartment exists
    apartment = db.query(Apartment).filter(Apartment.id == tenant.apartment_id).first()
    if not apartment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Apartment with id {tenant.apartment_id} not found"
        )

    # Normalize phone number
    tenant_data = tenant.model_dump()
    if tenant_data.get('phone'):
        tenant_data['phone'] = normalize_phone(tenant_data['phone'])

    db_tenant = Tenant(**tenant_data)
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.get("/", response_model=List[dict])
def list_tenants(
    building_id: UUID = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all tenants, optionally filtered by building, with apartment info."""
    if building_id:
        results = (
            db.query(Tenant, Apartment)
            .join(Apartment, Tenant.apartment_id == Apartment.id)
            .filter(Apartment.building_id == building_id)
            .offset(skip)
            .limit(limit)
            .all()
        )
        return [
            {
                "id": str(tenant.id),
                "apartment_id": str(tenant.apartment_id),
                "apartment_number": apartment.number,
                "floor": apartment.floor,
                "name": tenant.name,
                "full_name": tenant.full_name,
                "phone": tenant.phone,
                "email": tenant.email,
                "language": tenant.language.value if hasattr(tenant.language, 'value') else tenant.language,
                "ownership_type": tenant.ownership_type.value if hasattr(tenant.ownership_type, 'value') else tenant.ownership_type,
                "is_committee_member": tenant.is_committee_member,
                "has_standing_order": tenant.has_standing_order,
                "bank_name": tenant.bank_name,
                "bank_account": tenant.bank_account,
                "notes": tenant.notes,
                "is_active": tenant.is_active,
                "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
                "updated_at": tenant.updated_at.isoformat() if tenant.updated_at else None,
            }
            for tenant, apartment in results
        ]
    else:
        tenants = db.query(Tenant).offset(skip).limit(limit).all()
        return [
            {
                "id": str(t.id),
                "apartment_id": str(t.apartment_id),
                "name": t.name,
                "full_name": t.full_name,
                "phone": t.phone,
                "email": t.email,
                "language": t.language.value if hasattr(t.language, 'value') else t.language,
                "ownership_type": t.ownership_type.value if hasattr(t.ownership_type, 'value') else t.ownership_type,
                "is_committee_member": t.is_committee_member,
                "has_standing_order": t.has_standing_order,
                "bank_name": t.bank_name,
                "bank_account": t.bank_account,
                "notes": t.notes,
                "is_active": t.is_active,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in tenants
        ]


@router.get("/{tenant_id}", response_model=TenantResponse)
def get_tenant(tenant_id: UUID, db: Session = Depends(get_db)):
    """Get a specific tenant by ID"""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )
    return tenant


@router.put("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: UUID,
    tenant_update: TenantUpdate,
    db: Session = Depends(get_db)
):
    """Update a tenant"""
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )

    # Update only provided fields
    update_data = tenant_update.model_dump(exclude_unset=True)

    # Normalize phone if provided
    if 'phone' in update_data and update_data['phone']:
        update_data['phone'] = normalize_phone(update_data['phone'])

    for field, value in update_data.items():
        setattr(db_tenant, field, value)

    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(tenant_id: UUID, db: Session = Depends(get_db)):
    """Delete a tenant, cleaning up soft references first."""
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )

    try:
        # Nullify matched_tenant_id on transactions (soft reference)
        db.execute(
            text("UPDATE transactions SET matched_tenant_id = NULL WHERE matched_tenant_id = :tid"),
            {"tid": str(tenant_id)}
        )
        # Delete related messages and name_mappings (hard references)
        db.execute(
            text("DELETE FROM messages WHERE tenant_id = :tid"),
            {"tid": str(tenant_id)}
        )
        db.execute(
            text("DELETE FROM name_mappings WHERE tenant_id = :tid"),
            {"tid": str(tenant_id)}
        )
        db.delete(db_tenant)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"לא ניתן למחוק דייר זה. ייתכן שיש לו נתונים משויכים במערכת."
        )
    return None


@router.post("/{building_id}/apartments/resolve")
def resolve_apartment(
    building_id: UUID,
    data: dict,
    db: Session = Depends(get_db)
):
    """Find or create an apartment by building + number. Returns apartment_id."""
    apt_number = data.get("apt_number")
    floor = data.get("floor", 0)

    if apt_number is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="apt_number is required"
        )

    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    apartment = db.query(Apartment).filter(
        Apartment.building_id == building_id,
        Apartment.number == apt_number
    ).first()

    if not apartment:
        apartment = Apartment(
            building_id=building_id,
            number=apt_number,
            floor=floor
        )
        db.add(apartment)
        db.commit()
        db.refresh(apartment)

    return {
        "apartment_id": str(apartment.id),
        "apartment_number": apartment.number,
        "floor": apartment.floor
    }


@router.post("/{building_id}/import", status_code=status.HTTP_201_CREATED)
async def import_tenants_from_excel(
    building_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Import tenants from an Excel file for a specific building.
    Expected columns: דירה (apartment), קומה (floor), שם (name),
    טלפון (phone), דואל (email), סוג בעלות (ownership type),
    שם בנק (bank name), חשבון בנק (bank account)
    """
    # Verify building exists
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    # Read Excel file
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read Excel file: {str(e)}"
        )

    # Map Hebrew column names to English
    column_mapping = {
        'דירה': 'apartment',
        'קומה': 'floor',
        'שם': 'name',
        'טלפון': 'phone',
        'דואל': 'email',
        'סוג בעלות': 'ownership_type',
        'שם בנק': 'bank_name',
        'חשבון בנק': 'bank_account',
    }

    df = df.rename(columns=column_mapping)

    # Validate required columns
    required_columns = ['apartment', 'floor', 'name', 'ownership_type']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"חסרות עמודות נדרשות: {', '.join(missing_columns)}"
        )

    imported_count = 0
    errors = []

    for index, row in df.iterrows():
        try:
            # Get tenant name for error messages
            tenant_name_raw = row.get('name')
            tenant_name_for_error = str(tenant_name_raw).strip() if pd.notna(tenant_name_raw) else f'שורה {index + 1}'

            # Check for missing apartment number
            apt_val = row.get('apartment')
            if pd.isna(apt_val) or apt_val is None:
                errors.append(f"שורה {index + 1}: מספר דירה חסר עבור {tenant_name_for_error}. אנא הוסף ידנית.")
                continue

            # Get or create apartment
            apartment = db.query(Apartment).filter(
                Apartment.building_id == building_id,
                Apartment.number == int(row['apartment'])
            ).first()

            if not apartment:
                # Create apartment
                apartment = Apartment(
                    building_id=building_id,
                    number=int(row['apartment']),
                    floor=int(row['floor'])
                )
                db.add(apartment)
                db.flush()

            # Map ownership type
            ownership_map = {
                'בעלים': OwnershipType.OWNER,
                'משכיר': OwnershipType.LANDLORD,
                'שוכר': OwnershipType.RENTER
            }
            ownership_type = ownership_map.get(row['ownership_type'])
            if not ownership_type:
                errors.append(f"שורה {index + 1}: סוג בעלות לא חוקי '{row['ownership_type']}'. ערכים חוקיים: בעלים, משכיר, שוכר")
                continue

            # Check for existing tenant with same name in this apartment
            existing = db.query(Tenant).filter(
                Tenant.apartment_id == apartment.id,
                Tenant.name == row['name']
            ).first()
            if existing:
                errors.append(f"שורה {index + 1}: דייר '{row['name']}' כבר קיים בדירה {int(row['apartment'])}")
                continue

            # Create tenant
            phone = normalize_phone(row['phone']) if pd.notna(row.get('phone')) else None
            email = row.get('email') if pd.notna(row.get('email')) else None

            # Map optional bank columns
            bank_name = str(row.get('bank_name', '')).strip() if pd.notna(row.get('bank_name')) else None
            bank_account = str(row.get('bank_account', '')).strip() if pd.notna(row.get('bank_account')) else None

            tenant = Tenant(
                apartment_id=apartment.id,
                name=row['name'],
                full_name=row['name'],
                phone=phone,
                email=email,
                ownership_type=ownership_type,
                bank_name=bank_name,
                bank_account=bank_account,
                is_active=True
            )
            db.add(tenant)
            imported_count += 1

        except Exception as e:
            errors.append(f"Row {index + 1}: {str(e)}")
            continue

    # Commit all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save tenants: {str(e)}"
        )

    return {
        "message": f"Successfully imported {imported_count} tenants",
        "imported_count": imported_count,
        "errors": errors if errors else None
    }
