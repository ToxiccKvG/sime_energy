"""Fixtures des tests système : application FastAPI réelle, services externes réels.

Le compte utilisé est celui de la session Playwright (`bun run connexion` dans test/frontend),
sauvegardée dans test/frontend/playwright/.auth/session.json.
Les tests qui écrivent en base créent leur propre projet « TEST-AUTO … » et le suppriment à la fin.
"""
import json
import os
import uuid
from datetime import datetime
from pathlib import Path

import pytest
from dotenv import dotenv_values
from fastapi.testclient import TestClient


TEST_DIR = Path(__file__).resolve().parents[2]
FRONT_ENV = dotenv_values(TEST_DIR.parent / "sime-front" / ".env")
SESSION = TEST_DIR / "frontend" / "playwright" / ".auth" / "session.json"

API = "/api/V1"


@pytest.fixture(scope="session")
def client_anonyme() -> TestClient:
    from main import app
    return TestClient(app)


@pytest.fixture(scope="session")
def jeton_reel(session_test, service_db) -> str:
    """Vrai jeton Supabase pour l'utilisateur de la session Playwright.

    Lien magique généré par la clé service_role (aucun email envoyé) puis échangé contre une
    session neuve : la session Playwright et son refresh token ne sont pas touchés.
    """
    from supabase import create_client
    lien = service_db.auth.admin.generate_link({"type": "magiclink", "email": session_test["email"]})
    anon = create_client(FRONT_ENV["VITE_SUPABASE_URL"], FRONT_ENV["VITE_SUPABASE_ANON_KEY"])
    session = anon.auth.verify_otp({"token_hash": lien.properties.hashed_token, "type": "magiclink"}).session
    return session.access_token


@pytest.fixture(scope="session")
def client(jeton_reel) -> TestClient:
    """Client authentifié comme l'utilisateur de la session Playwright."""
    from main import app
    return TestClient(app, headers={"Authorization": f"Bearer {jeton_reel}"})


@pytest.fixture(scope="session")
def service_db():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


@pytest.fixture(scope="session")
def session_test():
    """Session Supabase réelle de l'utilisateur, lue dans le localStorage sauvegardé par Playwright."""
    if not SESSION.exists():
        pytest.skip("Session absente : lancer `bun run connexion` dans test/frontend")
    for origine in json.loads(SESSION.read_text())["origins"]:
        for item in origine["localStorage"]:
            if item["name"].startswith("sb-") and item["name"].endswith("-auth-token"):
                jeton = json.loads(item["value"])
                return {"token": jeton["access_token"], "user_id": jeton["user"]["id"],
                        "email": jeton["user"]["email"]}
    pytest.skip("Aucun jeton Supabase dans la session Playwright")


@pytest.fixture(scope="session")
def org_test(service_db, session_test) -> str:
    rows = service_db.table("organization_users").select("organization_id").eq("user_id", session_test["user_id"]).execute().data
    if not rows:
        pytest.skip("Le compte de test n'appartient à aucune organisation")
    return rows[0]["organization_id"]


@pytest.fixture
def projet_test(service_db, session_test, org_test):
    """Projet temporaire de l'organisation de test, supprimé (avec ses factures) après le test."""
    audit = service_db.table("audits").insert({
        "name": f"TEST-AUTO backend {datetime.now():%Y-%m-%d %H:%M:%S}",
        "organization_id": org_test,
        "created_by": session_test["user_id"],
        "status": "planned",
    }).execute().data[0]
    yield audit
    service_db.table("audit_invoices").delete().eq("audit_id", audit["id"]).execute()
    service_db.table("audits").delete().eq("id", audit["id"]).execute()


@pytest.fixture
def facture_vide(service_db, projet_test, session_test):
    """Ligne audit_invoices « En attente », comme celle créée par le front avant l'OCR."""
    inv = service_db.table("audit_invoices").insert({
        "audit_id": projet_test["id"],
        "organization_id": projet_test["organization_id"],
        "file_name": f"test-{uuid.uuid4().hex[:8]}.pdf",
        "file_url": "",
        "uploaded_by": session_test["user_id"],
        "status": "pending",
    }).execute().data[0]
    return inv
