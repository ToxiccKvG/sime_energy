"""Crée ou supprime le compte de test des tests système (Supabase réelle, clé service_role du backend).

    python test/outils/compte_test.py creer      → utilisateur + organisation dédiée, écrit test/.env.test
    python test/outils/compte_test.py supprimer  → supprime projets TEST-AUTO, organisation et utilisateur

À lancer avec le Python du backend : sime-backend-main/.venv/bin/python
"""
import os
import secrets
import sys
from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from supabase import create_client

RACINE = Path(__file__).resolve().parents[2]
ENV_TEST = RACINE / "test" / ".env.test"
EMAIL = "tests-auto@simee.test"
ORG_NOM = "SIMEE — Tests automatisés"
ORG_SLUG = "simee-tests-automatises"

load_dotenv(RACINE / "sime-backend-main" / ".env")
db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def trouver_utilisateur():
    for u in db.auth.admin.list_users(per_page=1000):
        if u.email == EMAIL:
            return u
    return None


def creer():
    if ENV_TEST.exists() and dotenv_values(ENV_TEST).get("TEST_USER_EMAIL"):
        print(f"Déjà configuré : {ENV_TEST}")
        return
    # Idempotent : réutilise l'utilisateur / l'organisation d'une exécution interrompue
    mot_de_passe = secrets.token_urlsafe(18)
    user = trouver_utilisateur()
    if user:
        db.auth.admin.update_user_by_id(user.id, {"password": mot_de_passe})
    else:
        user = db.auth.admin.create_user({
            "email": EMAIL, "password": mot_de_passe, "email_confirm": True,
            "user_metadata": {"full_name": "Tests automatisés"},
        }).user
    orgs = db.table("organizations").select("*").eq("slug", ORG_SLUG).eq("created_by", user.id).execute().data
    org = orgs[0] if orgs else db.table("organizations").insert({
        "name": ORG_NOM, "slug": ORG_SLUG, "created_by": user.id,
        "description": "Organisation réservée aux tests automatisés (test/). Ne pas utiliser.",
    }).execute().data[0]
    db.auth.admin.update_user_by_id(user.id, {"user_metadata": {"full_name": "Tests automatisés", "organization_id": org["id"]}})
    # Un trigger inscrit déjà le créateur ; on garantit seulement le rôle admin
    db.table("organization_users").upsert(
        {"organization_id": org["id"], "user_id": user.id, "role": "admin"},
        on_conflict="organization_id,user_id",
    ).execute()
    ENV_TEST.write_text(
        f"TEST_USER_EMAIL={EMAIL}\nTEST_USER_PASSWORD={mot_de_passe}\nTEST_ORGANIZATION_ID={org['id']}\n",
        encoding="utf-8",
    )
    print(f"Compte créé : {EMAIL} — organisation {org['id']} — identifiants dans {ENV_TEST}")


def supprimer():
    org_id = dotenv_values(ENV_TEST).get("TEST_ORGANIZATION_ID") if ENV_TEST.exists() else None
    if org_id:
        audits = db.table("audits").select("id").eq("organization_id", org_id).execute().data
        for a in audits:
            db.table("audit_invoices").delete().eq("audit_id", a["id"]).execute()
            db.table("audits").delete().eq("id", a["id"]).execute()
        db.table("organization_users").delete().eq("organization_id", org_id).execute()
        db.table("organizations").delete().eq("id", org_id).execute()
    user = trouver_utilisateur()
    if user:
        db.auth.admin.delete_user(user.id)
    if ENV_TEST.exists():
        ENV_TEST.unlink()
    print("Compte de test supprimé.")


if __name__ == "__main__":
    {"creer": creer, "supprimer": supprimer}[sys.argv[1] if len(sys.argv) > 1 else "creer"]()
