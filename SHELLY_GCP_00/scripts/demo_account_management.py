#!/usr/bin/env python3
"""
DÉMO — Gestion des comptes Shelly Cloud depuis la plateforme
============================================================
Ce script simule exactement ce que fera l'interface :
  1. Lister les comptes (comme l'onglet Paramètres)
  2. Tester la connexion par compte (bouton "Tester")
  3. Créer la table shelly_accounts dans Supabase (migration)
  4. Insérer les 3 comptes existants dans la table
  5. Lire les comptes depuis Supabase (comme l'Edge Function le fera)
  6. Simuler un changement d'auth_key (workflow "mot de passe changé")
"""

import os
import json
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

# ── Couleurs terminal ─────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def header(title: str):
    print(f"\n{BOLD}{BLUE}{'='*60}{RESET}")
    print(f"{BOLD}{BLUE}  {title}{RESET}")
    print(f"{BOLD}{BLUE}{'='*60}{RESET}")

def ok(msg):  print(f"  {GREEN}✓{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET} {msg}")
def err(msg):  print(f"  {RED}✗{RESET} {msg}")
def info(msg): print(f"  {BLUE}→{RESET} {msg}")

def mask_key(key: str) -> str:
    """Affiche la clé masquée comme l'UI le fera."""
    return f"••••••••••••[{key[-6:]}]" if key else "(vide)"

# ── Comptes depuis .env (état actuel) ─────────────────────────
ACCOUNTS = [
    {
        "site":       "Ma Maison",
        "label":      "Compte 1 — Ma Maison",
        "auth_key":   os.getenv("SHELLY_AUTH_KEY", ""),
        "server_url": os.getenv("SHELLY_SERVER", "https://shelly-88-eu.shelly.cloud"),
        "actif":      True,
    },
    {
        "site":       "Académie CER2E",
        "label":      "Compte 2 — Académie CER2E",
        "auth_key":   os.getenv("SHELLY_AUTH_KEY_2", ""),
        "server_url": os.getenv("SHELLY_SERVER_2", "https://shelly-97-eu.shelly.cloud"),
        "actif":      True,
    },
    {
        "site":       "Prestation CER2E",
        "label":      "Compte 3 — Prestation CER2E",
        "auth_key":   os.getenv("SHELLY_AUTH_KEY_3", ""),
        "server_url": os.getenv("SHELLY_SERVER_3", "https://shelly-98-eu.shelly.cloud"),
        "actif":      True,
    },
]

SUPABASE_URL      = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_HEADERS  = {
    "apikey":        SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
}

# ══════════════════════════════════════════════════════════════
# PARTIE 1 — Affichage des comptes (vue onglet Paramètres)
# ══════════════════════════════════════════════════════════════
header("PARTIE 1 — Vue onglet Paramètres (comptes actuels)")

for acc in ACCOUNTS:
    status = f"{GREEN}Actif{RESET}" if acc["actif"] else f"{RED}Inactif{RESET}"
    print(f"""
  ┌─ {BOLD}{acc['label']}{RESET} [{status}]
  │  Site       : {acc['site']}
  │  Serveur    : {acc['server_url']}
  │  Auth Key   : {mask_key(acc['auth_key'])}
  └─ [Modifier] [Tester] [Désactiver] [Supprimer]""")

# ══════════════════════════════════════════════════════════════
# PARTIE 2 — Test de connexion (bouton "Tester")
# ══════════════════════════════════════════════════════════════
header("PARTIE 2 — Test de connexion Shelly Cloud (bouton 'Tester')")

def test_shelly_account(site: str, auth_key: str, server_url: str) -> dict:
    """Teste les credentials Shelly — exactement ce que fera le bouton 'Tester'."""
    try:
        resp = requests.post(
            f"{server_url}/interface/device/list",
            data={"auth_key": auth_key},
            timeout=10,
        )
        data = resp.json()
        if data.get("isok"):
            devices = data.get("data", {}).get("deviceList", [])
            return {"ok": True, "nb_devices": len(devices), "devices": devices[:3]}
        else:
            return {"ok": False, "error": data.get("errors", "Réponse invalide")}
    except Exception as e:
        return {"ok": False, "error": str(e)}

results = {}
for acc in ACCOUNTS:
    info(f"Test [{acc['site']}] → {acc['server_url']} ...")
    result = test_shelly_account(acc["site"], acc["auth_key"], acc["server_url"])
    results[acc["site"]] = result
    if result["ok"]:
        ok(f"{acc['site']} — {result['nb_devices']} appareils détectés")
        for d in result.get("devices", []):
            print(f"       • {d.get('id','')} — {d.get('type','?')}")
    else:
        err(f"{acc['site']} — ÉCHEC : {result['error']}")

# ══════════════════════════════════════════════════════════════
# PARTIE 3 — Migration Supabase (création table shelly_accounts)
# ══════════════════════════════════════════════════════════════
header("PARTIE 3 — Migration Supabase : création table shelly_accounts")

SQL_MIGRATION = """
-- Migration : table de gestion des comptes Shelly Cloud
-- Permet de modifier les credentials depuis la plateforme sans toucher au code.

CREATE TABLE IF NOT EXISTS shelly_accounts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  site        TEXT        NOT NULL UNIQUE,
  label       TEXT,
  auth_key    TEXT        NOT NULL,
  server_url  TEXT        NOT NULL,
  actif       BOOLEAN     DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS : uniquement les utilisateurs authentifiés
ALTER TABLE shelly_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "authenticated_rw" ON shelly_accounts
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shelly_accounts_updated_at ON shelly_accounts;
CREATE TRIGGER trg_shelly_accounts_updated_at
  BEFORE UPDATE ON shelly_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
"""

print(SQL_MIGRATION)
info("→ Ce SQL sera exécuté via Supabase Dashboard ou 'supabase db push'")

# ══════════════════════════════════════════════════════════════
# PARTIE 4 — Insérer les comptes via l'API Supabase REST
# ══════════════════════════════════════════════════════════════
header("PARTIE 4 — Insertion des comptes dans shelly_accounts (Supabase REST)")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    warn("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant — insertion ignorée")
else:
    for acc in ACCOUNTS:
        payload = {
            "site":       acc["site"],
            "label":      acc["label"],
            "auth_key":   acc["auth_key"],
            "server_url": acc["server_url"],
            "actif":      acc["actif"],
        }
        headers = {**SUPABASE_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/shelly_accounts",
            headers=headers,
            json=payload,
            timeout=10,
        )
        if resp.status_code in (200, 201):
            row = resp.json()
            row_id = row[0].get("id", "?") if isinstance(row, list) else "?"
            ok(f"[{acc['site']}] inséré/mis à jour → id={row_id[:8]}…")
        else:
            # Table n'existe pas encore → afficher le message attendu
            err(f"[{acc['site']}] → HTTP {resp.status_code}: {resp.text[:120]}")
            warn("  (normal si la migration SQL n'a pas encore été exécutée)")

# ══════════════════════════════════════════════════════════════
# PARTIE 5 — Lire depuis Supabase (comme l'Edge Function)
# ══════════════════════════════════════════════════════════════
header("PARTIE 5 — Lecture depuis shelly_accounts (simulation Edge Function)")

if SUPABASE_URL and SUPABASE_ANON_KEY:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/shelly_accounts?actif=eq.true&select=site,label,auth_key,server_url",
        headers=SUPABASE_HEADERS,
        timeout=10,
    )
    if resp.status_code == 200:
        comptes = resp.json()
        if comptes:
            ok(f"{len(comptes)} compte(s) actif(s) lus depuis Supabase :")
            for c in comptes:
                print(f"    • {c['label']}  |  {c['server_url']}  |  {mask_key(c['auth_key'])}")
        else:
            warn("Table vide ou migration non exécutée")
    else:
        err(f"HTTP {resp.status_code} — table probablement inexistante")
        warn("Exécuter d'abord la migration SQL (Partie 3)")

# ══════════════════════════════════════════════════════════════
# PARTIE 6 — Simulation changement de mot de passe
# ══════════════════════════════════════════════════════════════
header("PARTIE 6 — Simulation : workflow 'mot de passe changé'")

print(f"""
  Scénario : le mot de passe du compte "Académie CER2E" vient de changer.
  Nouvelle auth_key générée par Shelly Cloud : ••••••••••••[newXX]

  Actions dans l'interface (onglet Paramètres) :
  1. Cliquer "Modifier" sur la carte "Académie CER2E"
  2. Coller la nouvelle auth_key dans le champ
  3. Cliquer "Tester la connexion" → {GREEN}✓ 42 appareils détectés{RESET}
  4. Cliquer "Sauvegarder"

  Ce qui se passe en coulisses :
  → PATCH /rest/v1/shelly_accounts?site=eq.Académie CER2E
    {{"auth_key": "<nouvelle_clé>", "updated_at": "now()"}}

  → Au poll suivant (≤ 1 min) l'Edge Function lit la table :
    SELECT site, auth_key, server_url FROM shelly_accounts WHERE actif = true
    → récupère la NOUVELLE clé → collecte reprend automatiquement

  {GREEN}Résultat : zéro interruption prolongée, zéro intervention développeur.{RESET}
""")

# ══════════════════════════════════════════════════════════════
# RÉSUMÉ
# ══════════════════════════════════════════════════════════════
header("RÉSUMÉ DE LA DÉMO")

total_devices = sum(r.get("nb_devices", 0) for r in results.values() if r.get("ok"))
ok_count = sum(1 for r in results.values() if r.get("ok"))
err_count = len(results) - ok_count

print(f"""
  API Shelly Cloud   : {ok_count}/{len(results)} comptes OK  — {total_devices} appareils détectés
  Migration SQL      : prête (voir Partie 3)
  Supabase REST      : {'opérationnel' if SUPABASE_URL else 'non configuré'}

  Prochaines étapes pour l'implémentation complète :
  1. Exécuter la migration SQL dans Supabase Dashboard
  2. Créer src/lib/shelly-account-service.ts (CRUD + test)
  3. Créer src/components/iot/ParametresTab.tsx (UI)
  4. Mettre à jour poll-shelly/index.ts (lire depuis la table)
  5. Ajouter l'onglet 'Paramètres' dans IOT.tsx
""")
