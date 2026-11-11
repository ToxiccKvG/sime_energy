"""Limites des traitements coûteux et erreurs internes sans fuite (audit de sécurité, HIGH 4 et 6)."""
import io

import pytest
from fastapi import HTTPException, UploadFile

from app.core import limites
from app.core.limites import LimiteurDebit, erreur_interne, lire_fichier, verifier_image, verifier_pdf


def televersement(contenu: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(contenu), filename="f")


def test_lire_fichier_a_la_limite_accepte():
    assert lire_fichier(televersement(b"x" * 100), 100, "un test") == b"x" * 100


def test_lire_fichier_au_dela_413_sans_tout_lire():
    flux = io.BytesIO(b"x" * 1000)
    with pytest.raises(HTTPException) as e:
        lire_fichier(UploadFile(file=flux, filename="f"), 100, "un test")
    assert e.value.status_code == 413
    assert flux.tell() == 101, "la lecture doit s'arrêter un octet après la limite"


@pytest.mark.parametrize("entete", [b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff\xe0", b"GIF89a", b"RIFF\0\0\0\0WEBPVP8 "])
def test_verifier_image_accepte_les_formats_connus(entete):
    verifier_image(entete + b"\0" * 32)


@pytest.mark.parametrize("contenu", [b"<svg></svg>", b"%PDF-1.4", b"MZ\x90\x00", b""])
def test_verifier_image_refuse_le_reste(contenu):
    with pytest.raises(HTTPException) as e:
        verifier_image(contenu)
    assert e.value.status_code == 400


def test_verifier_pdf_refuse_un_autre_format():
    with pytest.raises(HTTPException) as e:
        verifier_pdf(b"PK\x03\x04 un fichier zip")
    assert e.value.status_code == 400


def test_limiteur_bloque_au_dela_du_debit_puis_libere(monkeypatch):
    horloge = [1000.0]
    monkeypatch.setattr(limites.time, "monotonic", lambda: horloge[0])
    limiteur = LimiteurDebit()
    for _ in range(3):
        limiteur.verifier("ocr", "u1", 3)
    with pytest.raises(HTTPException) as e:
        limiteur.verifier("ocr", "u1", 3)
    assert e.value.status_code == 429
    assert int(e.value.headers["Retry-After"]) >= 1

    limiteur.verifier("ocr", "u2", 3)  # un autre utilisateur n'est pas concerné
    limiteur.verifier("ia", "u1", 3)  # ni une autre catégorie

    horloge[0] += 60
    limiteur.verifier("ocr", "u1", 3)  # la fenêtre d'une minute est passée


def test_erreur_interne_ne_renvoie_pas_le_detail(caplog):
    try:
        raise RuntimeError("clé secrète sk-123 dans le message")
    except RuntimeError:
        erreur = erreur_interne("le test")
    assert erreur.status_code == 500
    assert "sk-123" not in erreur.detail
    reference = erreur.detail.rsplit("réf. ", 1)[1]
    assert reference in caplog.text and "sk-123" in caplog.text, "le détail reste dans le journal serveur"
