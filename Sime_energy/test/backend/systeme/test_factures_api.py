"""Import de factures de bout en bout : AWS Textract + Bedrock Mistral + écriture Supabase réelles.

La facture PDF est synthétique (générée ici) pour ne pas envoyer de données client.
Chaque test travaille sur un projet « TEST-AUTO » de l'organisation de test, supprimé ensuite.
"""
import io

import pandas as pd
import pytest
from weasyprint import HTML

API = "/api/V1"
BASE = API + "/processing/process-file"

PAGE_FACTURE = """
<section style="page-break-after: always; font-family: DejaVu Sans; font-size: 13px">
  <h2>SENELEC — FACTURE D'ÉLECTRICITÉ</h2>
  <table border="1" cellpadding="4">
    <tr><td>Raison sociale</td><td>SENELEC</td></tr>
    <tr><td>Client</td><td>MAIRIE DE DAKAR</td></tr>
    <tr><td>Numéro facture</td><td>{numero}</td></tr>
    <tr><td>Date facture</td><td>15/03/2024</td></tr>
    <tr><td>Période du</td><td>01/01/2024</td></tr>
    <tr><td>Période au</td><td>29/02/2024</td></tr>
    <tr><td>Puissance souscrite</td><td>6</td></tr>
    <tr><td>Consommation (kWh)</td><td>300</td></tr>
  </table>
  <br>
  <table border="1" cellpadding="4">
    <tr><th>Tranches</th><th>Conso (kWh)</th><th>Tarif (FCFA/kWh)</th><th>Montant (FCFA)</th></tr>
    <tr><td>1ère tranche</td><td>150</td><td>91,17</td><td>13 676</td></tr>
    <tr><td>2ème tranche</td><td>100</td><td>136,49</td><td>13 649</td></tr>
    <tr><td>3ème tranche</td><td>50</td><td>159,36</td><td>7 968</td></tr>
  </table>
  <br>
  <table border="1" cellpadding="4">
    <tr><td>TCO (2,5%)</td><td>882</td></tr>
    <tr><td>Redevance</td><td>944</td></tr>
    <tr><td>TVA (18%)</td><td>1 640</td></tr>
    <tr><td>TOTAL FACTURE</td><td>{total}</td></tr>
  </table>
</section>
"""


def pdf(*factures) -> bytes:
    html = "".join(PAGE_FACTURE.format(numero=num, total=total) for num, total in factures)
    return HTML(string=f"<html><body>{html}</body></html>").write_pdf()


@pytest.mark.systeme
def test_facture_pdf_une_page(client, service_db, facture_vide):
    r = client.post(BASE + "/pdf-invoices",
                    files={"file": ("facture.pdf", pdf(("70001", "38 759")), "application/pdf")},
                    data={"file_name": facture_vide["file_name"], "invoice_id": facture_vide["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["processing_info"]["total_invoices"] == 1

    ligne = service_db.table("audit_invoices").select("*").eq("id", facture_vide["id"]).single().execute().data
    assert ligne["status"] == "processing"
    assert ligne["ocr_data"]["page"][0]["forms"], "Aucune paire clé/valeur extraite"
    assert ligne["amount"] == pytest.approx(38759)
    assert ligne["confidence_score"] > 0


@pytest.mark.systeme
def test_facture_pdf_plusieurs_factures(client, service_db, facture_vide):
    """Un PDF de 2 factures crée une 2e facture rattachée au même projet et à la même organisation."""
    r = client.post(BASE + "/pdf-invoices",
                    files={"file": ("lot.pdf", pdf(("70001", "38 759"), ("70002", "41 200")), "application/pdf")},
                    data={"file_name": facture_vide["file_name"], "invoice_id": facture_vide["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["processing_info"]["total_invoices"] == 2

    lignes = service_db.table("audit_invoices").select("id, amount, audit_id, organization_id") \
        .eq("audit_id", facture_vide["audit_id"]).execute().data
    assert len(lignes) == 2
    assert {l["organization_id"] for l in lignes} == {facture_vide["organization_id"]}


@pytest.mark.systeme
def test_facture_excel(client, service_db, facture_vide):
    tampon = io.BytesIO()
    pd.DataFrame([
        {"Numero Compte Contrat": "CC-001", "Numero Facture": 1001, "Montant Facture TTC": 944000},
        {"Numero Compte Contrat": "Total", "Numero Facture": None, "Montant Facture TTC": 944000},
    ]).to_excel(tampon, index=False)
    r = client.post(BASE + "/excel-invoices",
                    files={"file": ("factures.xlsx", tampon.getvalue())},
                    data={"file_name": "factures.xlsx", "invoice_id": facture_vide["id"],
                          "audit_id": facture_vide["audit_id"], "organization_id": facture_vide["organization_id"]})
    assert r.status_code == 200, r.text
    assert len(r.json()) == 1, "La ligne « Total » doit être écartée"
    ligne = service_db.table("audit_invoices").select("status, ocr_data").eq("id", facture_vide["id"]).single().execute().data
    assert ligne["status"] == "processing"
    assert ligne["ocr_data"]["rows"][0]["Numero Facture"] == 1001


@pytest.mark.systeme
def test_facture_pdf_corrompu_erreur_propre(client, facture_vide):
    r = client.post(BASE + "/pdf-invoices",
                    files={"file": ("x.pdf", b"pas un pdf", "application/pdf")},
                    data={"file_name": "x.pdf", "invoice_id": facture_vide["id"]})
    assert r.status_code in (400, 422), f"PDF illisible → HTTP {r.status_code}"
