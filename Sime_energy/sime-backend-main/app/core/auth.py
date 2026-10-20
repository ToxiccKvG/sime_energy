"""Authentification (jeton Supabase) et contrôle d'appartenance aux organisations.

Le backend écrit avec la clé service_role, donc sans RLS : chaque endpoint qui touche une
facture, un projet ou un dictionnaire doit vérifier que l'utilisateur appartient à son organisation.

Les jetons sont validés par Supabase Auth (et non avec un secret JWT local) : la vérification
reste juste après une rotation des clés de signature. Résultat mis en cache quelques secondes.

AUTH_REQUIRED=false désactive les deux contrôles (transition de déploiement uniquement).
"""
import hashlib
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.supabase_client import supabase

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

CACHE_TTL_S = 60
_CACHE_MAX = 1000
_cache: dict[str, tuple["Utilisateur", float]] = {}


def auth_requise() -> bool:
    return os.getenv("AUTH_REQUIRED", "true").strip().lower() not in ("false", "0", "no", "non")


@dataclass(frozen=True)
class Utilisateur:
    id: str
    email: Optional[str] = None


def _non_autorise(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


def decoder_jeton(jeton: str) -> Utilisateur:
    cle = hashlib.sha256(jeton.encode()).hexdigest()
    maintenant = time.monotonic()
    en_cache = _cache.get(cle)
    if en_cache and en_cache[1] > maintenant:
        return en_cache[0]

    try:
        reponse = supabase.auth.get_user(jeton)
    except Exception as e:
        # Supabase Auth répond 401/403 pour un jeton expiré, révoqué ou falsifié
        statut = getattr(e, "status", None)
        if statut in (401, 403) or "jwt" in str(e).lower() or "token" in str(e).lower():
            raise _non_autorise("Jeton expiré ou invalide")
        logger.error(f"[AUTH] Supabase Auth injoignable : {e}")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Service d'authentification indisponible")

    user = getattr(reponse, "user", None)
    if not user or not user.id:
        raise _non_autorise("Jeton invalide")

    utilisateur = Utilisateur(id=user.id, email=user.email)
    if len(_cache) >= _CACHE_MAX:
        _cache.clear()
    _cache[cle] = (utilisateur, maintenant + CACHE_TTL_S)
    return utilisateur


async def utilisateur_courant(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[Utilisateur]:
    """Dépendance appliquée à tous les routeurs : exige un jeton Supabase valide."""
    if not auth_requise():
        return None
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise",
                            headers={"WWW-Authenticate": "Bearer"})
    return decoder_jeton(credentials.credentials)


def verifier_membre(utilisateur: Optional[Utilisateur], organization_id: Optional[str]) -> None:
    """403 si l'utilisateur n'appartient pas à l'organisation."""
    if not auth_requise():
        return
    if utilisateur is None or not organization_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès refusé")
    lien = (
        supabase.table("organization_users").select("id")
        .eq("user_id", utilisateur.id).eq("organization_id", organization_id)
        .limit(1).execute()
    )
    if not lien.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès refusé à cette organisation")


def _organisation_de(table: str, identifiant: str, libelle: str) -> str:
    try:
        lignes = supabase.table(table).select("organization_id").eq("id", identifiant).limit(1).execute().data
    except Exception:
        # Identifiant mal formé (ex. pas un UUID) : traité comme introuvable
        lignes = []
    if not lignes:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{libelle} introuvable")
    return lignes[0]["organization_id"]


def organisation_de_facture(invoice_id: str) -> str:
    return _organisation_de("audit_invoices", invoice_id, "Facture")


def controler_facture(utilisateur: Optional[Utilisateur], invoice_id: str) -> str | None:
    """Vérifie l'accès à une facture et renvoie son organisation (None si l'auth est désactivée)."""
    if not auth_requise():
        return None
    organization_id = organisation_de_facture(invoice_id)
    verifier_membre(utilisateur, organization_id)
    return organization_id

