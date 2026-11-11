"""Limites des traitements coûteux (audit de sécurité, HIGH 4) et erreurs internes sans fuite (HIGH 6).

- Taille maximale par type de fichier, lue sans charger plus que la limite (413 au-delà).
- PDF : signature `%PDF` et nombre de pages plafonné (Textract et Bedrock sont facturés par page).
- Images : signature PNG, JPEG, WebP ou GIF, quel que soit le type déclaré par le client.
- Débit par utilisateur, en mémoire : suffisant tant que l'API tourne sur un seul serveur.
"""
import logging
import threading
import time
import uuid
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, UploadFile
from pdf2image import pdfinfo_from_bytes

from app.core.auth import Utilisateur, utilisateur_courant

logger = logging.getLogger(__name__)

MO = 1024 * 1024
LIMITE_PDF = 20 * MO
LIMITE_EXCEL = 20 * MO
LIMITE_MESURES = 50 * MO
LIMITE_IMAGE = 10 * MO
PAGES_MAX_PDF = 50

DEBIT_OCR_PAR_MINUTE = 10
DEBIT_IA_PAR_MINUTE = 20

SIGNATURES_IMAGE = (b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"GIF87a", b"GIF89a")


def lire_fichier(fichier: UploadFile, limite: int, nature: str) -> bytes:
    """Lit le fichier envoyé sans dépasser la limite : un octet de plus suffit à savoir qu'il est trop gros."""
    contenu = fichier.file.read(limite + 1)
    if len(contenu) > limite:
        raise HTTPException(status_code=413, detail=f"Fichier trop volumineux : {limite // MO} Mo maximum pour {nature}")
    return contenu


def verifier_pdf(contenu: bytes) -> int:
    """Vérifie que le fichier est un PDF de PAGES_MAX_PDF pages au plus ; renvoie son nombre de pages."""
    if not contenu.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Le fichier n'est pas un PDF")
    pages = int(pdfinfo_from_bytes(contenu).get("Pages", 0))
    if pages > PAGES_MAX_PDF:
        raise HTTPException(
            status_code=400,
            detail=f"PDF de {pages} pages : {PAGES_MAX_PDF} pages maximum, découpez le fichier",
        )
    return pages


def verifier_image(contenu: bytes) -> None:
    est_webp = contenu[:4] == b"RIFF" and contenu[8:12] == b"WEBP"
    if not (contenu.startswith(SIGNATURES_IMAGE) or est_webp):
        raise HTTPException(status_code=400, detail="Le fichier doit être une image (JPEG, PNG, WebP ou GIF)")


class LimiteurDebit:
    """Fenêtre glissante d'une minute par (catégorie, utilisateur). Partagé entre les threads de l'API."""

    def __init__(self):
        self._appels: dict[tuple[str, str], deque] = defaultdict(deque)
        self._verrou = threading.Lock()

    def verifier(self, categorie: str, cle: str, max_par_minute: int) -> None:
        maintenant = time.monotonic()
        with self._verrou:
            appels = self._appels[(categorie, cle)]
            while appels and maintenant - appels[0] >= 60:
                appels.popleft()
            if len(appels) >= max_par_minute:
                attente = max(1, int(60 - (maintenant - appels[0])) + 1)
                raise HTTPException(
                    status_code=429,
                    detail=f"Trop de requêtes : réessayez dans {attente} s",
                    headers={"Retry-After": str(attente)},
                )
            appels.append(maintenant)

    def reinitialiser(self) -> None:
        with self._verrou:
            self._appels.clear()


limiteur = LimiteurDebit()


def limite_debit(categorie: str, max_par_minute: int):
    """Dépendance FastAPI : par utilisateur connecté, ou par adresse IP si l'authentification est désactivée."""
    def dependance(request: Request, utilisateur: Utilisateur | None = Depends(utilisateur_courant)) -> None:
        cle = utilisateur.id if utilisateur else (request.client.host if request.client else "inconnu")
        limiteur.verifier(categorie, cle, max_par_minute)
    return dependance


def erreur_interne(contexte: str) -> HTTPException:
    """À appeler dans un `except` : journalise l'exception avec une référence, renvoie un message sans détail interne."""
    reference = uuid.uuid4().hex[:8]
    logger.exception("%s (réf. %s)", contexte, reference)
    return HTTPException(status_code=500, detail=f"Erreur interne lors de {contexte}, réf. {reference}")
