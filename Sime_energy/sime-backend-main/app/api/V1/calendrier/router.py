"""Jours fériés du Sénégal lus dans Google Agenda (audit de sécurité, HIGH 5).

La clé Google reste sur le serveur : avant, elle était dans le code JavaScript livré au navigateur.
Réponse mise en cache 24 h par année ; liste vide si Google est indisponible (le front prend alors
sa liste locale).
"""
import logging
import os
import threading
import time
from urllib.parse import quote

import requests
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

AGENDAS_SENEGAL = (
    "fr.sn#holiday@group.v.calendar.google.com",
    "en.sn#holiday@group.v.calendar.google.com",
)
DUREE_CACHE = 24 * 3600

_cache: dict[int, tuple[float, list[dict]]] = {}
_verrou = threading.Lock()


def _lire_google(cle: str, annee: int) -> list[dict]:
    params = {
        "key": cle,
        "timeMin": f"{annee}-01-01T00:00:00Z",
        "timeMax": f"{annee + 1}-01-01T00:00:00Z",
        "maxResults": 50,
        "singleEvents": "true",
    }
    for agenda in AGENDAS_SENEGAL:
        url = f"https://www.googleapis.com/calendar/v3/calendars/{quote(agenda, safe='')}/events"
        try:
            reponse = requests.get(url, params=params, timeout=10)
        except requests.RequestException as e:
            logger.warning("Google Agenda injoignable (%s) : %s", agenda, type(e).__name__)
            continue
        if not reponse.ok:
            logger.warning("Google Agenda : HTTP %s pour %s", reponse.status_code, agenda)
            continue
        jours = [
            {"date": ev["start"]["date"], "title": ev.get("summary", "")}
            for ev in reponse.json().get("items", [])
            if ev.get("start", {}).get("date")
        ]
        if jours:
            return jours
    return []


@router.get("/jours-feries")
def jours_feries(annee: int = Query(ge=2000, le=2100)) -> dict:
    cle = os.getenv("GOOGLE_API_KEY")
    if not cle:
        return {"source": "indisponible", "jours": []}
    with _verrou:
        en_cache = _cache.get(annee)
    if en_cache and time.monotonic() - en_cache[0] < DUREE_CACHE:
        return {"source": "google", "jours": en_cache[1]}
    jours = _lire_google(cle, annee)
    if not jours:
        return {"source": "indisponible", "jours": []}
    with _verrou:
        _cache[annee] = (time.monotonic(), jours)
    return {"source": "google", "jours": jours}
