"""Extraction des champs clés d'une facture OCR (fournisseur, date, montant)."""
import json

import pytest

from app.core.documents import (
    _strip_coordinates_for_mistral,
    extract_and_parse_json,
    pdf_to_base64_url,
)
from app.core.invoices import extract_invoice_fields, normaliser_date


class TestExtractInvoiceFields:
    def test_champs_llm_prioritaires(self):
        r = extract_invoice_fields(
            [{"Key": "MONTANT_TTC", "Value": "1"}], [],
            llm_fields={"supplier": " SENELEC ", "invoice_date": "2024-03-15", "amount": "1 234 567"},
        )
        assert r == {"supplier": "SENELEC", "invoice_date": "2024-03-15", "amount": 1234567.0, "confidence_score": 100}

    def test_repli_sur_les_formulaires(self):
        r = extract_invoice_fields([
            {"Key": "RAISON_SOCIALE", "Value": "SENELEC"},
            {"Key": "DATE_FACTURE", "Value": "15/03/2024"},
            {"Key": "MONTANT_TTC", "Value": "125 000 FCFA"},
        ], [])
        assert r["supplier"] == "SENELEC"
        assert r["invoice_date"] == "2024-03-15"
        assert r["amount"] == 125000.0
        assert r["confidence_score"] == 100

    def test_montant_llm_illisible_repli_formulaire(self):
        r = extract_invoice_fields([{"Key": "NET_A_PAYER", "Value": "98 500"}], [], llm_fields={"amount": "N/A"})
        assert r["amount"] == 98500.0

    def test_montants_partiels_et_arrieres_exclus(self):
        r = extract_invoice_fields([
            {"Key": "TOTAL_TVA", "Value": "18 000"},
            {"Key": "MONTANT_TOTAL_HT", "Value": "100 000"},
            {"Key": "SOLDE_GLOBAL", "Value": "500 000"},
            {"Key": "TOTAL_FACTURE", "Value": "118 000"},
        ], [])
        assert r["amount"] == 118000.0

    def test_montant_aberrant_rejete(self):
        r = extract_invoice_fields([{"Key": "MONTANT_TTC", "Value": "99999999999"}], [])
        assert r["amount"] is None

    def test_date_facture_preferee_a_la_date_de_periode(self):
        """La date de facture (ou comptable) doit primer sur une date de début de période lue avant."""
        r = extract_invoice_fields([
            {"Key": "DATE_DEBUT_PERIODE", "Value": "01/02/2024"},
            {"Key": "DATE_FACTURE", "Value": "15/03/2024"},
        ], [])
        assert r["invoice_date"] == "2024-03-15"

    def test_confiance_proportionnelle(self):
        assert extract_invoice_fields([], [])["confidence_score"] == 0
        assert extract_invoice_fields([{"Key": "FOURNISSEUR", "Value": "SENELEC"}], [])["confidence_score"] == 33


class TestUtilitaires:
    def test_json_dans_bloc_markdown(self):
        assert extract_and_parse_json('Voici:\n```json\n{"forms": []}\n```') == {"forms": []}

    def test_json_brut(self):
        assert extract_and_parse_json('{"a": [1, 2]}') == {"a": [1, 2]}

    def test_json_invalide(self):
        with pytest.raises(json.JSONDecodeError):
            extract_and_parse_json("pas du json")

    def test_coordonnees_retirees_avant_llm(self):
        parsed = {
            "forms": [{"Key": "A", "Value": "1", "box": [0, 0, 1, 1]}],
            "tables": [{"rows": [[{"text": "x", "box": [1, 2, 3, 4]}, {"text": "y"}]], "box": [0, 0, 9, 9]}],
        }
        assert _strip_coordinates_for_mistral(parsed) == {
            "forms": [{"Key": "A", "Value": "1"}],
            "tables": [[["x", "y"]]],
        }

    def test_pdf_base64(self):
        assert pdf_to_base64_url(b"%PDF") == "data:application/pdf;base64,JVBERg=="


class TestNormaliserDate:
    @pytest.mark.parametrize("valeur,attendu", [
        ("15/03/2024", "2024-03-15"),
        ("5-3-2024", "2024-03-05"),
        ("15.03.2024 10:30", "2024-03-15"),
        ("2024-03-15", "2024-03-15"),
        ("2024-03-15T08:00:00", "2024-03-15"),
        ("31/02/2024", None),
        ("mars 2024", None),
        ("", None),
        (None, None),
    ])
    def test_formats(self, valeur, attendu):
        assert normaliser_date(valeur) == attendu

    def test_objets_date(self):
        import pandas as pd
        from datetime import date
        assert normaliser_date(date(2024, 3, 15)) == "2024-03-15"
        assert normaliser_date(pd.Timestamp("2024-03-15 08:00")) == "2024-03-15"
        assert normaliser_date(pd.NaT) is None

    def test_date_de_facture_toujours_iso(self):
        r = extract_invoice_fields([{"Key": "DATE_FACTURE", "Value": "15/03/2024"}], [],
                                   llm_fields={"invoice_date": "15/03/2024"})
        assert r["invoice_date"] == "2024-03-15"

    def test_date_limite_de_paiement_ignoree(self):
        r = extract_invoice_fields([{"Key": "DATE_LIMITE_PAIEMENT", "Value": "30/04/2024"}], [])
        assert r["invoice_date"] is None
