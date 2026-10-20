"""_parse_trp sur une vraie réponse AWS Textract (facture synthétique, capturée une fois dans fixtures/).

Rejoue l'étape OCR sans appel payant : Textract → formulaires + tableaux → champs clés de la facture.
"""
import json
from pathlib import Path

import pytest

from app.core.llm import _parse_trp
from app.core.utils import _strip_coordinates_for_mistral, extract_invoice_fields


CAPTURE = Path(__file__).resolve().parents[1] / "fixtures" / "textract_facture.json"


@pytest.fixture(scope="module")
def capture():
    return json.loads(CAPTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def page(capture):
    return _parse_trp(capture["response"], capture["width"], capture["height"])


def test_paires_cle_valeur(page):
    formulaire = {f["Key"].strip(): f["Value"].strip() for f in page["forms"]}
    assert formulaire["Raison sociale"] == "SENELEC"
    assert formulaire["Date facture"] == "15/03/2024"
    assert formulaire["TOTAL FACTURE"] == "38 759"
    assert formulaire["Puissance souscrite"] == "6"


def test_coordonnees_dans_l_image(page, capture):
    largeur, hauteur = capture["width"], capture["height"]
    boites = [f["box"] for f in page["forms"]] + [t["box"] for t in page["tables"]]
    boites += [c["box"] for t in page["tables"] for r in t["rows"] for c in r if "box" in c]
    assert boites
    for x1, y1, x2, y2 in boites:
        assert 0 <= x1 < x2 <= largeur and 0 <= y1 < y2 <= hauteur


def test_tableaux(page):
    textes = [[[c["text"].strip() for c in r] for r in t["rows"]] for t in page["tables"]]
    assert len(textes) == 3
    tranches = next(t for t in textes if t[0][0] == "Tranches")
    assert tranches[1][0] == "1ère tranche" and tranches[3][3] == "7 968"
    totaux = next(t for t in textes if t[-1][0] == "TOTAL FACTURE")
    assert totaux[-1][1] == "38 759"


def test_payload_llm_sans_coordonnees(page):
    propre = _strip_coordinates_for_mistral(page)
    assert all(set(f) == {"Key", "Value"} for f in propre["forms"])
    assert all(isinstance(cellule, str) for t in propre["tables"] for r in t for cellule in r)


def test_champs_cles_sans_llm(page):
    """Chemin de secours quand Bedrock est indisponible : l'extraction marche sur Textract seul."""
    champs = extract_invoice_fields(page["forms"], page["tables"])
    assert champs["supplier"].strip() == "SENELEC"
    assert champs["invoice_date"] == "2024-03-15"
    assert champs["amount"] == 38759.0
    assert champs["confidence_score"] == 100
