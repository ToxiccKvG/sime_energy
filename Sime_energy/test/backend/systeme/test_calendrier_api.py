"""Jours fériés du Sénégal servis par le backend (audit de sécurité, HIGH 5 : la clé Google ne quitte plus le serveur)."""
import os

import pytest

JOURS_FERIES = "/api/V1/calendrier/jours-feries"


@pytest.mark.systeme
def test_jours_feries_sans_jeton_401(client_anonyme):
    assert client_anonyme.get(JOURS_FERIES, params={"annee": 2026}).status_code == 401


@pytest.mark.systeme
@pytest.mark.parametrize("annee", ["1500", "abc"])
def test_jours_feries_annee_invalide_422(client, annee):
    assert client.get(JOURS_FERIES, params={"annee": annee}).status_code == 422


@pytest.mark.systeme
def test_jours_feries_google(client):
    if not os.getenv("GOOGLE_API_KEY"):
        pytest.skip("GOOGLE_API_KEY absente du .env du backend")
    r = client.get(JOURS_FERIES, params={"annee": 2026})
    assert r.status_code == 200
    corps = r.json()
    assert corps["source"] == "google", "Google Agenda n'a rien renvoyé : clé restreinte ou API Calendar désactivée ?"
    dates = {j["date"] for j in corps["jours"]}
    assert "2026-04-04" in dates, "la fête de l'Indépendance doit y figurer"
    assert "AIza" not in r.text
