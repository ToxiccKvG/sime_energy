"""Les endpoints doivent exiger un jeton Supabase (doc de l'API : « Authorization: Bearer <token> »)
et refuser l'accès aux données d'une autre organisation.

Les appels utilisent des contenus invalides : si l'endpoint n'est pas protégé, il répond 4xx/5xx
sans consommer de service payant, et le test le signale.
"""
import time
import uuid

import pytest

from jetons import signer_jeton

API = "/api/V1"

ENDPOINTS = [
    ("/processing/process-file/pdf-invoices", {"files": {"file": ("x.pdf", b"x")}, "data": {"file_name": "x", "invoice_id": "x"}}),
    ("/processing/process-file/excel-invoices", {"files": {"file": ("x.xlsx", b"x")}, "data": {"file_name": "x", "invoice_id": "x", "audit_id": "x", "organization_id": "x"}}),
    ("/processing/process-file/measures", {"files": {"file": ("x.csv", b"")}, "data": {"sensor_type": "INCONNU"}}),
    ("/processing/process-file/process-hierarchy", {"json": {}}),
    ("/processing/process-file/invoice-tables-to-json", {"json": {"pages": []}}),
    ("/processing/process-file/analyze-energy-label", {"files": {"image": ("x.txt", b"x", "text/plain")}}),
    ("/ai/synthesize-audit", {"json": {}}),
    ("/ai/chat", {"json": {}}),
]


@pytest.mark.systeme
@pytest.mark.parametrize("chemin,kwargs", ENDPOINTS, ids=[e[0] for e in ENDPOINTS])
def test_appel_sans_jeton_refuse(client_anonyme, chemin, kwargs):
    r = client_anonyme.post(API + chemin, **kwargs)
    assert r.status_code == 401, f"{chemin} accessible sans authentification (HTTP {r.status_code})"


@pytest.mark.systeme
def test_cors_restreint_au_front(client_anonyme):
    r = client_anonyme.options(API + "/ai/chat", headers={
        "Origin": "https://site-malveillant.example",
        "Access-Control-Request-Method": "POST",
    })
    assert r.headers.get("access-control-allow-origin") not in ("*", "https://site-malveillant.example")


HIERARCHIE = API + "/processing/process-file/process-hierarchy"
VIDE = {"hierarchy": {"hierarchy": []}}


@pytest.mark.systeme
def test_jeton_valide_accepte(client):
    assert client.post(HIERARCHIE, json=VIDE).status_code == 200


@pytest.mark.systeme
def test_jeton_expire_refuse(client_anonyme, session_test):
    """Vrai jeton Supabase, mais expiré (celui de la session Playwright sauvegardée)."""
    from jose import jwt
    if jwt.get_unverified_claims(session_test["token"])["exp"] > time.time():
        pytest.skip("Le jeton de la session Playwright n'est pas encore expiré")
    r = client_anonyme.post(HIERARCHIE, json=VIDE, headers={"Authorization": f"Bearer {session_test['token']}"})
    assert r.status_code == 401


@pytest.mark.systeme
def test_jeton_falsifie_refuse(client_anonyme, session_test):
    jeton = signer_jeton(session_test["user_id"])
    r = client_anonyme.post(HIERARCHIE, json=VIDE, headers={"Authorization": f"Bearer {jeton}"})
    assert r.status_code == 401


PDF = API + "/processing/process-file/pdf-invoices"


@pytest.mark.systeme
def test_facture_inexistante_404(client):
    r = client.post(PDF, files={"file": ("x.pdf", b"x")}, data={"file_name": "x", "invoice_id": str(uuid.uuid4())})
    assert r.status_code == 404


@pytest.mark.systeme
def test_facture_d_une_autre_organisation_403(client, service_db, session_test):
    """Contrôle fait avant toute écriture : la facture visée n'est jamais modifiée."""
    mes_orgs = [l["organization_id"] for l in service_db.table("organization_users")
                .select("organization_id").eq("user_id", session_test["user_id"]).execute().data]
    autres = service_db.table("audit_invoices").select("id, updated_at") \
        .not_.in_("organization_id", mes_orgs).limit(1).execute().data
    if not autres:
        pytest.skip("Aucune facture d'une autre organisation pour tester le refus")
    avant = autres[0]
    r = client.post(PDF, files={"file": ("x.pdf", b"x")}, data={"file_name": "x", "invoice_id": avant["id"]})
    assert r.status_code == 403
    apres = service_db.table("audit_invoices").select("updated_at").eq("id", avant["id"]).single().execute().data
    assert apres["updated_at"] == avant["updated_at"]


@pytest.mark.systeme
def test_excel_pour_une_autre_organisation_403(client, facture_vide):
    r = client.post(API + "/processing/process-file/excel-invoices", files={"file": ("x.xlsx", b"x")}, data={
        "file_name": "x", "invoice_id": facture_vide["id"], "audit_id": facture_vide["audit_id"],
        "organization_id": str(uuid.uuid4()),
    })
    assert r.status_code == 403
