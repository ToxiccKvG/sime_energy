from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
import uvicorn
from app.api.V1 import router as api_router
from fastapi.middleware.cors import CORSMiddleware
import os
import logging

# Configuration du logging
from logging_config import setup_logging
setup_logging(logging.INFO)

# Métadonnées de l'API
tags_metadata = [
    {
        "name": "auth",
        "description": "Endpoints d'authentification et de gestion des utilisateurs. Gestion des invitations utilisateur via Supabase.",
    },
    {
        "name": "processing",
        "description": "Endpoints de traitement de fichiers. Traitement de factures PDF, fichiers CSV de mesures, et analyse d'étiquettes énergétiques.",
    },
]

app = FastAPI(
    title="SIME Platform Backend API",
    description="""
    API Backend pour la plateforme SIME (Système d'Information pour la Maîtrise de l'Énergie).
    
    Fonctionnalités principales:
    - Authentification: Gestion des utilisateurs et invitations via Supabase
    - Traitement de fichiers: Traitement de factures PDF avec extraction de données, traitement de fichiers CSV de mesures énergétiques, analyse d'étiquettes énergétiques
    
    Authentification:
    La plupart des endpoints nécessitent un token d'authentification Supabase dans le header Authorization: Bearer <votre_token>
    """,
    version="1.0.0",
    openapi_tags=tags_metadata,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

app.include_router(api_router, prefix="/api/V1")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port)