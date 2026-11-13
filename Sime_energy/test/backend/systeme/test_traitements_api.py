"""Hiérarchie, tableaux de facture (JSON / Excel) — appels HTTP réels."""
import io
import uuid

import pandas as pd
import pytest

API = "/api/V1"

BASE = API + "/processing/process-file"


def cellules(*lignes):
    return [[{"text": c} for c in ligne] for ligne in lignes]


FACTURE = {
    "fileName": "facture.pdf",
    "pages": [{
        "fileName": "facture.pdf",
        "page_number": 1,
        "tables": [
            {"table_name": "infos", "rows": cellules(["Client", "Mairie de Dakar"], ["Consommation kWh", "6 000"], ["Montant TTC", "944 000"])},
        ],
    }],
}


@pytest.mark.systeme
def test_hierarchie(client):
    r = client.post(BASE + "/process-hierarchy", json={"hierarchy": {"hierarchy": [
        {"name": "Site", "averageConsumption": 100, "children": [{"name": "A", "averageConsumption": 70}, {"name": "B"}]},
    ]}})
    assert r.status_code == 200
    assert r.json()["hierarchy"]["hierarchy"][0]["children"][1]["averageConsumption"] == 30


@pytest.mark.systeme
def test_tableaux_vers_json(client):
    r = client.post(BASE + "/invoice-tables-to-json", json=FACTURE)
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["unifiedData"]["CLIENT"] == "Mairie de Dakar"
    assert corps["processingInfo"]["totalConsumption"] == 6000
    assert corps["processingInfo"]["totalAmount"] == 944000


@pytest.mark.systeme
def test_tableaux_vers_json_dictionnaire_inconnu(client):
    """Supabase réel : un dictionnaire introuvable ne bloque pas le traitement."""
    r = client.post(BASE + "/invoice-tables-to-json", json={**FACTURE, "dictionary_id": str(uuid.uuid4())})
    assert r.status_code == 200
    assert r.json()["processingInfo"]["hasTemplates"] is False


@pytest.mark.systeme
def test_tableaux_vers_json_sans_page_400(client):
    assert client.post(BASE + "/invoice-tables-to-json", json={"pages": []}).status_code == 400


@pytest.mark.systeme
def test_tableaux_vers_excel(client):
    r = client.post(BASE + "/invoice-tables-to-excel", json=FACTURE)
    assert r.status_code == 200, r.text
    assert "spreadsheetml" in r.headers["content-type"]
    df = pd.read_excel(io.BytesIO(r.content))
    assert df.loc[0, "CLIENT"] == "Mairie de Dakar"


@pytest.mark.systeme
def test_tableaux_vers_excel_sans_tableau_400(client):
    r = client.post(BASE + "/invoice-tables-to-excel", json={"pages": [{"fileName": "x", "page_number": 1, "tables": []}]})
    assert r.status_code == 400, f"Requête invalide → HTTP {r.status_code}"
