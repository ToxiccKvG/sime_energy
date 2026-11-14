"""Cloisonnement IOT par organisation sélectionnée (migration 20261114_iot_sites_organisation_selectionnee).

Appels PostgREST réels avec le jeton de l'utilisateur de test, comme le navigateur :
l'en-tête `x-organisation-id` (envoyé par lib/supabase.ts) limite les sites visibles
à l'organisation choisie, sans jamais ouvrir ceux d'une organisation dont l'utilisateur
n'est pas membre. Les valeurs attendues sont lues en base (service_role) : le test vaut
pour n'importe quel compte de test, mono ou multi-organisation.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import httpx
import pytest
from dotenv import dotenv_values

FRONT_ENV = dotenv_values(Path(__file__).resolve().parents[3] / "sime-front" / ".env")

REST = f"{FRONT_ENV['VITE_SUPABASE_URL']}/rest/v1"
ORG_INCONNUE = "11111111-1111-1111-1111-111111111111"


def lire(jeton: str, chemin: str, organisation: str | None = None):
    entetes = {"apikey": FRONT_ENV["VITE_SUPABASE_ANON_KEY"], "Authorization": f"Bearer {jeton}"}
    if organisation is not None:
        entetes["x-organisation-id"] = organisation
    methode = httpx.post if chemin.startswith("rpc/") else httpx.get
    r = methode(f"{REST}/{chemin}", headers=entetes, timeout=30)
    r.raise_for_status()
    return r.json()


@pytest.fixture(scope="module")
def sites_par_org(service_db, session_test) -> dict[str, set[str]]:
    orgs = [r["organization_id"] for r in service_db.table("organization_users")
            .select("organization_id").eq("user_id", session_test["user_id"]).execute().data]
    if not orgs:
        pytest.skip("Le compte de test n'appartient à aucune organisation")
    lignes = service_db.table("site_organisation").select("site, organization_id").in_("organization_id", orgs).execute().data
    return {o: {l["site"] for l in lignes if l["organization_id"] == o} for o in orgs}


@pytest.mark.systeme
def test_sans_en_tete_tous_les_sites_du_membre(jeton_reel, sites_par_org):
    # Ancienne application, scripts : comportement d'avant la migration
    attendu = set().union(*sites_par_org.values())
    assert set(lire(jeton_reel, "rpc/user_sites")) == attendu


@pytest.mark.systeme
def test_en_tete_limite_a_l_organisation_selectionnee(jeton_reel, sites_par_org):
    for org, sites in sites_par_org.items():
        assert set(lire(jeton_reel, "rpc/user_sites", org)) == sites, org
        visibles = {c["site"] for c in lire(jeton_reel, "shelly_accounts?select=site", org)}
        assert visibles <= sites, f"{org} : comptes Shelly d'une autre organisation visibles {visibles - sites}"


@pytest.mark.systeme
def test_organisation_dont_on_n_est_pas_membre(jeton_reel, service_db, sites_par_org):
    autres = [o["id"] for o in service_db.table("organizations").select("id").execute().data
              if o["id"] not in sites_par_org]
    for org in autres + [ORG_INCONNUE]:
        assert lire(jeton_reel, "rpc/user_sites", org) == [], org
        assert lire(jeton_reel, "shelly_accounts?select=site", org) == [], org


@pytest.mark.systeme
def test_en_tete_invalide_aucun_site(jeton_reel):
    assert lire(jeton_reel, "rpc/user_sites", "pas-un-uuid") == []
    # Lecture bornée dans le temps, comme le tableau de bord (une lecture sans aucun filtre
    # parcourrait toute la table, 12 M de lignes, avant de ne rien renvoyer)
    depuis = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    assert lire(jeton_reel, f"shelly_cl?select=site&ts=gte.{quote(depuis)}&limit=1", "pas-un-uuid") == []
