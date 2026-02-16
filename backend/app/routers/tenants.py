from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
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

    # Remove spaces, dashes, and other non-numeric characters
    phone = ''.join(filter(str.isdigit, str(phone)))

    # If it starts with 0, replace with +972
    if phone.startswith('0'):
        phone = '+972' + phone[1:]
    # If it doesn't start with +, add +972
    elif not phone.startswith('+'):
        phone = '+972' + phone

    return phone


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


@router.get("/", response_model=List[TenantResponse])
def list_tenants(
    building_id: UUID = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all tenants, optionally filtered by building"""
    query = db.query(Tenant)

    if building_id:
        # Filter tenants by building through apartment relationship
        query = query.join(Apartment).filter(Apartment.building_id == building_id)

    tenants = query.offset(skip).limit(limit).all()
    return tenants


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
    """Delete a tenant"""
    db_tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not db_tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant with id {tenant_id} not found"
        )

    db.delete(db_tenant)
    db.commit()
    return None


@router.post("/{building_id}/import", status_code=status.HTTP_201_CREATED)
async def import_tenants_from_excel(
    building_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Import tenants from an Excel file for a specific building.
    Expected columns: דירה (apartment), קומה (floor), שם (name),
    טלפון (phone), דואל (email), סוג בעלות (ownership type)
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
        'סוג בעלות': 'ownership_type'
    }

    df = df.rename(columns=column_mapping)

    # Validate required columns
    required_columns = ['apartment', 'floor', 'name', 'ownership_type']
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )

    imported_count = 0
    errors = []

    for index, row in df.iterrows():
        try:
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
                errors.append(f"Row {index + 1}: Invalid ownership type '{row['ownership_type']}'")
                continue

            # Create tenant
            phone = normalize_phone(row['phone']) if pd.notna(row.get('phone')) else None
            email = row.get('email') if pd.notna(row.get('email')) else None

            tenant = Tenant(
                apartment_id=apartment.id,
                name=row['name'],
                full_name=row['name'],  # Use same for now, can be updated later
                phone=phone,
                email=email,
                ownership_type=ownership_type,
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
