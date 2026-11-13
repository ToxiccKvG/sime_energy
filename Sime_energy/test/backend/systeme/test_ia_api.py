"""Services IA réels : DeepSeek (synthèse, Benjamin) et Bedrock Pixtral (étiquettes énergie)."""
import io
import json

import pytest
from PIL import Image, ImageDraw, ImageFont

API = "/api/V1"
POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

CONTEXTE = json.dumps({
    "projet": "Mairie de Dakar — Hôtel de ville",
    "facturation": {"categorie": "TG", "conso_annuelle_kwh": 288000, "cout_annuel_fcfa": 49_900_000, "cosphi": 0.78},
    "inventaire": {"climatiseurs": 42, "eclairage_fluo": 310},
}, ensure_ascii=False)


@pytest.mark.systeme
def test_synthese_audit_deepseek(client):
    r = client.post(API + "/ai/synthesize-audit", json={"context": CONTEXTE})
    assert r.status_code == 200, r.text
    corps = r.json()
    for champ in ["observations_generales", "inventaire", "mesures", "facturation", "recommandations", "conclusions"]:
        assert isinstance(corps[champ], str) and corps[champ].strip(), f"Section vide : {champ}"


@pytest.mark.systeme
def test_chat_benjamin_flux(client):
    r = client.post(API + "/ai/chat", json={
        "messages": [{"role": "user", "content": "En une phrase : pourquoi compenser un cos φ de 0,78 ?"}],
        "context": CONTEXTE,
    })
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert "data:" in r.text
    assert '"error"' not in r.text[:200], r.text[:200]


def etiquette_png() -> bytes:
    img = Image.new("RGB", (900, 600), "white")
    d = ImageDraw.Draw(img)
    titre, texte = ImageFont.truetype(POLICE, 48), ImageFont.truetype(POLICE, 34)
    d.text((40, 30), "ÉTIQUETTE ÉNERGIE", font=titre, fill="black")
    for i, ligne in enumerate([
        "Marque : LG", "Modèle : S12EQ", "Type : Climatiseur split",
        "Classe énergétique : A++", "Puissance : 1200 W", "Tension : 220-240 V", "Fréquence : 50 Hz",
    ]):
        d.text((40, 120 + i * 62), ligne, font=texte, fill="black")
    tampon = io.BytesIO()
    img.save(tampon, format="PNG")
    return tampon.getvalue()


@pytest.mark.systeme
def test_analyse_etiquette_energie(client):
    r = client.post(API + "/processing/process-file/analyze-energy-label",
                    files={"image": ("etiquette.png", etiquette_png(), "image/png")})
    assert r.status_code == 200, r.text
    caracteristiques = r.json()["characteristics"]
    valeurs = " ".join(str(v) for v in caracteristiques.values()).upper()
    assert "LG" in valeurs
    assert "1200" in valeurs.replace(" ", "")


@pytest.mark.systeme
def test_analyse_etiquette_refuse_non_image(client):
    r = client.post(API + "/processing/process-file/analyze-energy-label",
                    files={"image": ("notes.txt", b"bonjour", "text/plain")})
    assert r.status_code == 400
