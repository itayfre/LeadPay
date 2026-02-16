from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import buildings, tenants, statements, payments, messages

app = FastAPI(
    title="LeadPay API",
    version="0.3.0",
    description="Building Management Payment Tracker API - Phase 3: WhatsApp Integration"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(buildings.router)
app.include_router(tenants.router)
app.include_router(statements.router)
app.include_router(payments.router)
app.include_router(messages.router)

@app.get("/")
def root():
    return {"message": "LeadPay API is running!", "status": "ok"}

@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy"}
