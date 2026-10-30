from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routes import auth, checks, drugs, interactions, stats
from app.core import errors
from app.core.config import settings
from app.core.request_log import log_requests, setup_logging
from app.core.security import secure_requests

setup_logging(settings.LOG_LEVEL)

app = FastAPI(
    title="PharmGraph AI",
    description="AI-Powered Drug–Drug Interaction (DDI) Checker Using Graph Neural Networks",
    version="0.1.0",
)

# Configure CORS specifically to allow frontend development server
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)  # drug pages can list 900+ partners
app.middleware("http")(secure_requests)
app.middleware("http")(log_requests)
errors.register(app)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router, prefix="/api/v1")
app.include_router(checks.router, prefix="/api/v1")
app.include_router(drugs.router, prefix="/api/v1")
app.include_router(interactions.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
