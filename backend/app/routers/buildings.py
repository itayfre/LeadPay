from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from typing import List
from uuid import UUID

from ..database import get_db
from ..models import Building, Apartment, Tenant
from ..schemas import BuildingCreate, BuildingUpdate, BuildingResponse

router = APIRouter(
    prefix="/api/v1/buildings",
    tags=["buildings"]
)


@router.post("/", response_model=BuildingResponse, status_code=status.HTTP_201_CREATED)
def create_building(building: BuildingCreate, db: Session = Depends(get_db)):
    """Create a new building"""
    # Check if building with same name already exists
    existing = db.query(Building).filter(Building.name == building.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Building with name '{building.name}' already exists"
        )

    try:
        db_building = Building(**building.model_dump())
        db.add(db_building)
        db.commit()
        db.refresh(db_building)
        return db_building
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Building with name '{building.name}' already exists"
        )


def _building_with_live_count(building: Building, db: Session) -> dict:
    """Serialize a Building with a live tenant count from the DB."""
    count = (
        db.query(func.count(Tenant.id))
        .join(Apartment, Tenant.apartment_id == Apartment.id)
        .filter(Apartment.building_id == building.id)
        .scalar() or 0
    )
    return {
        "id": str(building.id),
        "name": building.name,
        "address": building.address,
        "city": building.city,
        "total_units": building.total_units,
        "total_tenants": count,
        "monthly_fee": building.monthly_fee,
        "created_at": building.created_at.isoformat() if building.created_at else None,
        "updated_at": building.updated_at.isoformat() if building.updated_at else None,
    }


@router.get("/", response_model=List[dict])
def list_buildings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all buildings with live tenant counts"""
    buildings = db.query(Building).offset(skip).limit(limit).all()
    return [_building_with_live_count(b, db) for b in buildings]


@router.get("/{building_id}", response_model=dict)
def get_building(building_id: UUID, db: Session = Depends(get_db)):
    """Get a specific building by ID with live tenant count"""
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )
    return _building_with_live_count(building, db)


@router.put("/{building_id}", response_model=BuildingResponse)
def update_building(
    building_id: UUID,
    building_update: BuildingUpdate,
    db: Session = Depends(get_db)
):
    """Update a building"""
    db_building = db.query(Building).filter(Building.id == building_id).first()
    if not db_building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    # Update only provided fields
    update_data = building_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_building, field, value)

    db.commit()
    db.refresh(db_building)
    return db_building


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(building_id: UUID, db: Session = Depends(get_db)):
    """Delete a building"""
    db_building = db.query(Building).filter(Building.id == building_id).first()
    if not db_building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )

    db.delete(db_building)
    db.commit()
    return None
