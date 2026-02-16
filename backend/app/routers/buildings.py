from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from uuid import UUID

from ..database import get_db
from ..models import Building
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


@router.get("/", response_model=List[BuildingResponse])
def list_buildings(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all buildings"""
    buildings = db.query(Building).offset(skip).limit(limit).all()
    return buildings


@router.get("/{building_id}", response_model=BuildingResponse)
def get_building(building_id: UUID, db: Session = Depends(get_db)):
    """Get a specific building by ID"""
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Building with id {building_id} not found"
        )
    return building


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
