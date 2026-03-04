import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .routers import buildings, tenants, statements, payments, messages, auth, users

APP_ENV = os.getenv("APP_ENV", "development")

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="LeadPay API",
    version="0.3.0",
    description="Building Management Payment Tracker API - Phase 3: WhatsApp Integration",
    docs_url=None if APP_ENV == "production" else "/docs",
    redoc_url=None if APP_ENV == "production" else "/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("FRONTEND_URL", "http://localhost:5173,http://localhost:5174,http://localhost:5175").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# Include routers
app.include_router(auth.router)
app.include_router(users.router)
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
