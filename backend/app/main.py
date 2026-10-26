from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import drugs, interactions
from app.core import errors
from app.core.config import settings
from app.core.request_log import log_requests, setup_logging

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
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(log_requests)
errors.register(app)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(drugs.router, prefix="/api/v1")
app.include_router(interactions.router, prefix="/api/v1")
