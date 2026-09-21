from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="PharmGraph AI",
    description="AI-Powered Drug–Drug Interaction (DDI) Checker Using Graph Neural Networks",
    version="0.1.0",
)

# Configure CORS specifically to allow frontend development server
origins = [
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# Placeholder API routes for Commit 3
@app.get("/api/v1/drugs/search")
def search_drugs():
    return {}


@app.post("/api/v1/interactions/known")
def check_known_interactions():
    return {}


@app.post("/api/v1/interactions/predict")
def predict_interactions():
    return {}
