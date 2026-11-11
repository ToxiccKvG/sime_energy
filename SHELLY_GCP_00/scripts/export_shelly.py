#!/usr/bin/env python3
"""
Export d'un appareil Shelly depuis Supabase.

Extrait tout l'historique disponible d'un appareil (relevés bruts + agrégats
horaires), construit une synthèse journalière et écrit CSV et/ou Excel.

Exemples
--------
  # Lister les appareils disponibles
  python3 export_shelly.py --lister

  # Chercher un appareil par nom (sous-chaîne, insensible à la casse)
  python3 export_shelly.py --lister --nom donsin

  # Exporter par nom
  python3 export_shelly.py --nom "Station météo_Donsin"

  # Exporter par device_id, sur une période, en CSV seulement
  python3 export_shelly.py --id XB211299189491624 \
      --du 2026-08-01 --au 2026-09-01 --format csv

  # Choisir la destination
  python3 export_shelly.py --nom "Arrivée générale" --sortie ~/Desktop/mon_export

Prérequis : requests, python-dotenv, pandas, xlsxwriter.
SUPABASE_URL lu dans le .env ; la clé service_role vient du .env si c'en est bien une,
sinon de la CLI Supabase (`supabase login` requis).
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import unicodedata

import pandas as pd
import requests
from dotenv import load_dotenv

# ── Réglages ────────────────────────────────────────────────────────────────

ENV_DEFAUT = os.path.expanduser("~/sime_energy/SHELLY_GCP_00/.env")
SORTIE_DEFAUT = os.path.expanduser("~/Desktop")

# PostgREST plafonne les réponses à 1000 lignes. On pagine par curseur sur
# l'horodatage plutôt que par offset : sur des dizaines de milliers de lignes,
# les offsets profonds finissent par dépasser le statement_timeout du serveur.
PAGE = 1000

TABLES = [
    # (table, colonne d'horodatage, libellé)
    ("shelly_cl", "ts", "Relevés bruts"),
    ("shelly_cl_horaire", "ts_heure", "Agrégats horaires"),
]

# Colonnes qui sont des COMPTEURS CUMULATIFS et non des mesures instantanées.
# Pour ces colonnes, la valeur du jour est la somme des hausses, pas la moyenne.
# (precipitation_cumul_mm : compteur de pluie de la station, jamais à afficher
# comme une pluie ; wh_* : index d'énergie.)
COMPTEURS = {
    "precipitation_cumul_mm", "wh_tot", "wh_a", "wh_b", "wh_c",
    "wh_rtot", "wh_ra", "wh_rb", "wh_rc", "wh_counter",
}

# La base garde le compteur brut sous `precipitation_mm` : on le renomme à
# l'export pour qu'il ne soit pas pris pour la pluie. La pluie réelle (par
# relevé / par heure) est la colonne `pluie_mm`, additionnée par la synthèse.
RENOMMER = {"precipitation_mm": "precipitation_cumul_mm"}
SOMMES = {"pluie_mm"}

# Colonnes de contexte, jamais agrégées.
NON_MESURES = {
    "id", "ts", "ts_heure", "jour", "site", "room", "name", "device_id",
    "device_type", "device_family", "state", "online", "firmware_version",
    "measured_at", "last_event_at",
}


# ── Accès Supabase ──────────────────────────────────────────────────────────

def _role_jwt(cle):
    """Rôle porté par un JWT Supabase ('anon', 'service_role'…), sinon None."""
    try:
        charge = cle.split(".")[1]
        charge += "=" * (-len(charge) % 4)
        return json.loads(base64.urlsafe_b64decode(charge)).get("role")
    except Exception:
        return None


def cle_service_via_cli(url):
    """Lit la clé service_role par la CLI Supabase (connexion déjà faite),
    sans jamais l'écrire sur le disque."""
    ref = url.split("//")[-1].split(".")[0]
    try:
        sortie = subprocess.run(
            ["supabase", "projects", "api-keys", "--project-ref", ref, "-o", "json"],
            capture_output=True, text=True, timeout=60, check=True).stdout
        return next(k["api_key"] for k in json.loads(sortie) if k.get("name") == "service_role")
    except Exception:
        return None


def connexion(chemin_env):
    if os.path.exists(chemin_env):
        load_dotenv(chemin_env)
    url = os.getenv("SUPABASE_URL")
    if not url:
        sys.exit(f"[!] SUPABASE_URL absent (cherché dans {chemin_env}). Indiquez le .env avec --env.")
    url = url.rstrip("/")
    cle = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    # Le .env porte parfois la clé anon sous ce nom : l'accès anon est fermé
    # depuis le 14/09 (erreur 42501). On prend alors la vraie clé via la CLI.
    if not cle or _role_jwt(cle) != "service_role":
        cle = cle_service_via_cli(url)
        if not cle:
            sys.exit("[!] Pas de clé service_role : le .env contient une clé anon et la CLI "
                     "Supabase n'a pas pu en fournir une (installée ? `supabase login` fait ?).")
        print("[i] clé service_role obtenue via la CLI Supabase")
    return url, {"apikey": cle, "Authorization": f"Bearer {cle}"}


def pagine(url, entetes, table, tscol, filtres, bavard=True):
    """Lit toutes les lignes d'une table pour un appareil, page par page.

    `filtres` est une liste de couples (clé, valeur) et non un dict : les bornes
    de période et le curseur portent tous sur la colonne d'horodatage, et
    PostgREST combine en ET les filtres répétés sur une même colonne.

    Le curseur avance en `gte` : chaque page recouvre d'au moins une ligne la
    précédente, on dédoublonne donc sur `id`.
    """
    lignes, vus, curseur = [], set(), None
    while True:
        params = [("select", "*"), ("order", f"{tscol}.asc,id.asc"), ("limit", str(PAGE))]
        params += list(filtres)
        if curseur:
            params.append((tscol, f"gte.{curseur}"))
        rep = requests.get(f"{url}/rest/v1/{table}", headers=entetes,
                           params=params, timeout=180)
        if not rep.ok:
            sys.exit(f"[!] {table} → HTTP {rep.status_code} : {rep.text[:300]}")
        lot = rep.json()
        if not lot:
            break
        nouvelles = [x for x in lot if x["id"] not in vus]
        for x in nouvelles:
            vus.add(x["id"])
        lignes += nouvelles
        if bavard and len(lot) == PAGE:
            print(f"    {len(lignes)} lignes… (jusqu'à {lot[-1][tscol]})")
        if len(lot) < PAGE:
            break
        suivant = lot[-1][tscol]
        if suivant == curseur and not nouvelles:
            break  # curseur bloqué : plus d'une page entière au même instant
        curseur = suivant
    return lignes


def inventaire(url, entetes):
    """Liste les appareils connus.

    Passe par shelly_cl_horaire (petite table) et non par shelly_cl :
    un DISTINCT sur la table brute dépasse le statement_timeout. La vue
    shelly_devices_catalog serait plus directe mais peut renvoyer 42501
    selon les privilèges accordés à service_role.
    """
    rep = requests.get(f"{url}/rest/v1/shelly_devices_catalog", headers=entetes,
                       params={"select": "*", "order": "site,name"}, timeout=60)
    if rep.ok:
        return [{"site": d.get("site"), "name": d.get("name"),
                 "device_id": d.get("device_id"),
                 "device_type": d.get("device_type"),
                 "device_family": d.get("device_family"),
                 "vu_jusqu_a": d.get("derniere_lecture")} for d in rep.json()]

    lignes = pagine(url, entetes, "shelly_cl_horaire", "ts_heure", [], bavard=False)
    agg = {}
    for d in lignes:
        cle = (d.get("site"), d.get("name"), d.get("device_id"))
        prec = agg.get(cle)
        if prec is None or d["ts_heure"] > prec["vu_jusqu_a"]:
            agg[cle] = {"site": d.get("site"), "name": d.get("name"),
                        "device_id": d.get("device_id"),
                        "device_type": d.get("device_type"),
                        "device_family": d.get("device_family"),
                        "vu_jusqu_a": d["ts_heure"]}
    return sorted(agg.values(), key=lambda x: (x["site"] or "", x["name"] or ""))


# ── Aides ───────────────────────────────────────────────────────────────────

def sans_accent(txt):
    return "".join(c for c in unicodedata.normalize("NFD", (txt or "").lower())
                   if unicodedata.category(c) != "Mn")


def colonnes_pleines(df):
    return [c for c in df.columns if df[c].notna().any()]


def synthese_journaliere(brut):
    """Agrégat par jour, adapté aux colonnes réellement renseignées.

    Les compteurs cumulatifs sont recalculés en variation (somme des hausses),
    les autres mesures numériques donnent moyenne / min / max.
    """
    df = brut.copy()
    df["jour"] = df["ts"].dt.date
    calculs = {"nb_releves": ("ts", "size")}

    for col in df.columns:
        if col in NON_MESURES or not pd.api.types.is_numeric_dtype(df[col]):
            continue
        if df[col].notna().sum() == 0:
            continue
        if col in SOMMES:
            calculs[f"{col}_jour"] = (col, "sum")
        elif col == "precipitation_cumul_mm":
            calculs[f"{col}_index_fin"] = (col, "last")   # la pluie du jour = pluie_mm_jour
        elif col in COMPTEURS:
            # Somme des hausses : neutralise les remises à zéro du compteur.
            df[f"_var_{col}"] = df[col].diff().clip(lower=0).fillna(0)
            calculs[f"{col}_jour"] = (f"_var_{col}", "sum")
            calculs[f"{col}_index_fin"] = (col, "last")
        elif col == "battery_level":
            calculs["battery_level_min"] = (col, "min")
        else:
            calculs[f"{col}_moy"] = (col, "mean")
            calculs[f"{col}_min"] = (col, "min")
            calculs[f"{col}_max"] = (col, "max")

    return df.groupby("jour").agg(**calculs).round(2).reset_index()


def couverture(brut):
    """Première et dernière apparition de chaque colonne.

    Utile parce que les champs n'existent pas tous depuis le début : chaque
    migration ayant ajouté des colonnes, les anciennes lignes restent à NULL.
    """
    lignes = []
    for col in brut.columns:
        if col.startswith("_var_") or col == "jour":
            continue
        sous = brut.loc[brut[col].notna(), "ts"]
        lignes.append({
            "champ": col,
            "premier_releve": str(sous.iloc[0].date()) if len(sous) else "",
            "dernier_releve": str(sous.iloc[-1].date()) if len(sous) else "",
            "nb_renseignes": len(sous),
            "pct_renseigne": round(100 * len(sous) / len(brut), 1) if len(brut) else 0,
        })
    return pd.DataFrame(lignes).sort_values("pct_renseigne", ascending=False)


def sans_fuseau(df):
    """Excel refuse les datetimes porteurs d'un fuseau."""
    out = df.copy()
    for col in out.columns:
        if isinstance(out[col].dtype, pd.DatetimeTZDtype):
            out[col] = out[col].dt.tz_localize(None)
    return out


# ── Programme principal ─────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description="Export d'un appareil Shelly depuis Supabase.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Exemples")[1] if "Exemples" in __doc__ else None)
    p.add_argument("--id", help="device_id exact à exporter")
    p.add_argument("--nom", help="nom d'appareil, ou fragment de nom")
    p.add_argument("--lister", action="store_true",
                   help="afficher les appareils disponibles et quitter")
    p.add_argument("--du", help="date de début incluse (AAAA-MM-JJ)")
    p.add_argument("--au", help="date de fin exclue (AAAA-MM-JJ)")
    p.add_argument("--sortie", default=SORTIE_DEFAUT,
                   help=f"dossier de destination (défaut : {SORTIE_DEFAUT})")
    p.add_argument("--format", choices=["csv", "xlsx", "les-deux"], default="les-deux",
                   help="format de sortie (défaut : les-deux)")
    p.add_argument("--env", default=ENV_DEFAUT,
                   help=f"fichier .env à utiliser (défaut : {ENV_DEFAUT})")
    args = p.parse_args()

    url, entetes = connexion(args.env)

    # ── Mode liste ──
    if args.lister:
        appareils = inventaire(url, entetes)
        if args.nom:
            cible = sans_accent(args.nom)
            appareils = [a for a in appareils if cible in sans_accent(a["name"])]
        print(f"\n{len(appareils)} appareil(s) :\n")
        print(f"  {'SITE':<18} {'NOM':<38} {'DEVICE_ID':<28} {'TYPE':<18} VU JUSQU'À")
        for a in appareils:
            print(f"  {str(a['site']):<18} {str(a['name']):<38} "
                  f"{str(a['device_id']):<28} {str(a['device_type']):<18} {a['vu_jusqu_a']}")
        return

    # ── Résolution de l'appareil ──
    if not args.id and not args.nom:
        p.error("indiquez --id ou --nom (ou --lister pour voir les appareils)")

    device_id, libelle = args.id, args.id
    if not device_id:
        cible = sans_accent(args.nom)
        trouves = [a for a in inventaire(url, entetes) if cible in sans_accent(a["name"])]
        ids = {a["device_id"] for a in trouves}
        if not ids:
            sys.exit(f"[!] Aucun appareil ne correspond à « {args.nom} ». "
                     f"Essayez --lister.")
        if len(ids) > 1:
            print(f"[!] « {args.nom} » correspond à plusieurs appareils :")
            for a in trouves:
                print(f"      {a['device_id']:<28} {a['site']:<18} {a['name']}")
            sys.exit("    Relancez avec --id pour choisir.")
        device_id = ids.pop()
        libelle = trouves[0]["name"]
        print(f"[i] « {args.nom} » → {libelle} ({device_id})")

    filtres = [("device_id", f"eq.{device_id}")]

    os.makedirs(args.sortie, exist_ok=True)
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in sans_accent(libelle))[:40]

    # ── Extraction ──
    donnees = {}
    for table, tscol, titre in TABLES:
        bornes = list(filtres)
        if args.du:
            bornes.append((tscol, f"gte.{args.du}"))
        if args.au:
            bornes.append((tscol, f"lt.{args.au}"))
        print(f"\n>>> {table}")
        lignes = pagine(url, entetes, table, tscol, bornes)
        if not lignes:
            print("    aucune ligne")
            continue
        df = pd.DataFrame(lignes)
        df[tscol] = pd.to_datetime(df[tscol], utc=True, format="ISO8601")
        df = df.sort_values(tscol).reset_index(drop=True)
        df = df.rename(columns=RENOMMER)
        df = df[colonnes_pleines(df)]
        donnees[table] = (df, tscol, titre)
        print(f"    {len(df)} lignes, {len(df.columns)} colonnes renseignées")
        print(f"    période : {df[tscol].min()} → {df[tscol].max()}")

    if "shelly_cl" not in donnees:
        sys.exit("[!] Aucun relevé brut pour cet appareil sur la période demandée.")

    brut, _, _ = donnees["shelly_cl"]
    synth = synthese_journaliere(brut)
    couv = couverture(brut)

    # Heures sans aucun relevé, sur la plage couverte.
    par_heure = brut.set_index("ts").resample("1h").size()
    plage = pd.date_range(par_heure.index.min().floor("h"),
                          par_heure.index.max().floor("h"), freq="1h", tz="UTC")
    trous = [str(t) for t in plage if par_heure.get(t, 0) == 0]

    fiche = pd.DataFrame([
        ("Appareil", libelle),
        ("device_id", device_id),
        ("Type", str(brut["device_type"].dropna().iloc[-1]) if "device_type" in brut else ""),
        ("Famille", str(brut["device_family"].dropna().iloc[-1]) if "device_family" in brut else ""),
        ("Site(s)", " | ".join(sorted(brut["site"].dropna().unique())) if "site" in brut else ""),
        ("Premier relevé", str(brut["ts"].min())),
        ("Dernier relevé", str(brut["ts"].max())),
        ("Relevés bruts", str(len(brut))),
        ("Jours couverts", str(len(synth))),
        ("Heures sans relevé", str(len(trous))),
        ("Fuseau des horodatages", "UTC"),
        ("Filtre période", f"{args.du or 'début'} → {args.au or 'maintenant'}"),
        ("Rétention", "shelly_cl est purgée à 90 jours : au-delà, seuls les "
                      "agrégats horaires subsistent."),
        ("Pluie", "pluie_mm = pluie tombée (mm) depuis le relevé précédent (brut) ou "
                  "dans l'heure (horaire) ; pluie_mm_jour = total du jour (synthèse). "
                  "precipitation_cumul_mm = compteur depuis l'installation de la station : "
                  "à ne PAS lire comme une pluie. Station muette la nuit : la pluie "
                  "nocturne est comptée au premier relevé du matin."
                  if "precipitation_cumul_mm" in brut.columns else "sans objet"),
        ("Compteurs cumulatifs", "Les colonnes " + ", ".join(sorted(COMPTEURS & set(brut.columns)))
                                 + " sont des index cumulatifs ; la synthèse en donne la "
                                   "variation quotidienne (_jour)."
                                 if COMPTEURS & set(brut.columns) else "aucun"),
        ("Export généré le", str(pd.Timestamp.now().date())),
    ], columns=["Champ", "Valeur"])

    # ── Écriture ──
    print()
    if args.format in ("csv", "les-deux"):
        for table, (df, _, _) in donnees.items():
            chemin = os.path.join(args.sortie, f"{table}_{slug}.csv")
            df.to_csv(chemin, index=False)
            print(f"[✓] {chemin}")
        chemin = os.path.join(args.sortie, f"synthese_journaliere_{slug}.csv")
        synth.to_csv(chemin, index=False)
        print(f"[✓] {chemin}")

    if args.format in ("xlsx", "les-deux"):
        chemin = os.path.join(args.sortie, f"{slug}_complet.xlsx")
        with pd.ExcelWriter(chemin, engine="xlsxwriter",
                            datetime_format="yyyy-mm-dd hh:mm:ss",
                            date_format="yyyy-mm-dd") as w:
            fiche.to_excel(w, sheet_name="Fiche appareil", index=False)
            synth.to_excel(w, sheet_name="Synthèse journalière", index=False)
            for table, (df, _, titre) in donnees.items():
                if len(df) > 1_048_575:
                    print(f"[!] {titre} : {len(df)} lignes > limite Excel, "
                          f"onglet omis (le CSV, lui, est complet).")
                    continue
                sans_fuseau(df).to_excel(w, sheet_name=titre[:31], index=False)
            couv.to_excel(w, sheet_name="Couverture par champ", index=False)
            pd.DataFrame({"heure_UTC_sans_releve": trous}).to_excel(
                w, sheet_name="Heures sans relevé", index=False)
            for feuille in w.sheets.values():
                feuille.freeze_panes(1, 0)
        print(f"[✓] {chemin}")

    print(f"\n{len(brut)} relevés · {len(synth)} jours · {len(trous)} heure(s) sans relevé")


if __name__ == "__main__":
    main()
