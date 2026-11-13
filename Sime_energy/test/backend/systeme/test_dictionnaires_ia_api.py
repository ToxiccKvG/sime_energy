"""Tableaux de facture avec un vrai dictionnaire (templates + excelMappings) et validation des entrées IA."""
import uuid

import pytest

API = "/api/V1"
TABLES_JSON = API + "/processing/process-file/invoice-tables-to-json"


def cellules(*lignes):
    return [[{"text": c} for c in ligne] for ligne in lignes]


ENERGIE = cellules(
    ["Désignation", "Quantité", "Montant"],
    ["Energie K1", "20 000 kWh", "2 238 200 FCFA"],
    ["Energie K2", "4 000 kWh", "738 600 FCFA"],
)


@pytest.fixture
def dictionnaire_test(service_db, org_test):
    """Dictionnaire temporaire de l'organisation de l'utilisateur, supprimé après le test."""
    d = service_db.table("annotation_dictionaries").insert({
        "organization_id": org_test,
        "name": f"TEST-AUTO dictionnaire {uuid.uuid4().hex[:6]}",
        "color": "#10b981",
        "fields": [],
        "table_templates": [{
            "id": "tpl-energie", "name": "Energie", "headerLayout": "both",
            "columnHeaders": ["Désignation", "Quantité", "Montant"], "rowHeaders": ["Energie K1", "Energie K2"],
            "excelMappings": [
                {"target": "Montant K2", "source": {"column": "Montant", "rowHeader": "Energie K2"}},
                {"target": "K1 (kWh)", "source": {"column": "Quantité", "rowHeader": "Energie K1"}, "transform": "number"},
            ],
        }],
    }).execute().data[0]
    yield d
    service_db.table("annotation_dictionaries").delete().eq("id", d["id"]).execute()


def payload(dictionary_id):
    return {"fileName": "f.pdf", "dictionary_id": dictionary_id,
            "pages": [{"fileName": "f.pdf", "page_number": 1, "tables": [{"table_name": "Energie", "rows": ENERGIE}]}]}


@pytest.mark.systeme
def test_tableaux_avec_dictionnaire_de_l_organisation(client, dictionnaire_test):
    r = client.post(TABLES_JSON, json=payload(dictionnaire_test["id"]))
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["processingInfo"]["hasTemplates"] is True
    assert corps["tables"][0]["templateId"] == "tpl-energie"
    assert corps["unifiedData"]["Montant K2"] == "738 600 FCFA"
    assert corps["unifiedData"]["K1 (kWh)"] == 20000.0


@pytest.mark.systeme
def test_dictionnaire_d_une_autre_organisation_403(client, service_db, session_test):
    mes_orgs = [l["organization_id"] for l in service_db.table("organization_users")
                .select("organization_id").eq("user_id", session_test["user_id"]).execute().data]
    autres = service_db.table("annotation_dictionaries").select("id") \
        .not_.in_("organization_id", mes_orgs).limit(1).execute().data
    if not autres:
        pytest.skip("Aucun dictionnaire d'une autre organisation pour tester le refus")
    assert client.post(TABLES_JSON, json=payload(autres[0]["id"])).status_code == 403


@pytest.mark.systeme
@pytest.mark.parametrize("chemin,corps", [
    ("/ai/synthesize-audit", {}),
    ("/ai/chat", {"context": "x"}),
    ("/ai/chat", {"messages": [{"role": "user"}]}),
])
def test_ia_entrees_invalides_422(client, chemin, corps):
    """Rejetées par la validation, sans appel à DeepSeek."""
    assert client.post(API + chemin, json=corps).status_code == 422
