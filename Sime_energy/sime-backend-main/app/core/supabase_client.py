"""Client Supabase service_role partagé (contourne la RLS : tout accès doit être contrôlé côté API)."""
import logging
import os

from dotenv import load_dotenv
from supabase import Client, create_client

# Ne pas dépendre de l'ordre des imports : ce module peut être chargé avant llm.py
load_dotenv()

logger = logging.getLogger(__name__)

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not supabase_url or not supabase_key:
    logger.error("[SUPABASE] ERREUR CRITIQUE: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non définis dans .env")
    raise ValueError("Configuration Supabase manquante. Vérifiez votre fichier .env")

supabase: Client = create_client(supabase_url, supabase_key)
logger.info(f"[SUPABASE] Client initialisé avec succès - URL: {supabase_url[:30]}...")
