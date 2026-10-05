#!/usr/bin/env python3
"""Détection des coupures SENELEC d'un site (lecture seule) + énergie non distribuée (END) estimée.

    python SHELLY_GCP_00/scripts/detect_coupures.py --site "Ma Maison" --days 35 --csv coupures.csv

Méthode (validée sur les données le 2026-09-24, voir docs/runbook-data.md) :
  coupure = les appareils SECTEUR (ENERGIE_*, LUMIERE) ne remontent plus pendant que les capteurs
  À PILE (SB*, S3SN*) continuent d'émettre. La tension 0 V NE marche PAS (relais ouvert / Shelly hors tension).
  Trous séparés de moins de 5 min fusionnés ; épisodes < --min-minutes (défaut 5) écartés.
  END = somme de P_ref(heure) x durée ; P_ref = moyenne de l'arrivée à la même heure, hors coupures et hors absences.
Absences : table site_absences. Un épisode pendant une absence est marqué « absence » (arrêt volontaire probable),
et ces jours sont exclus de la puissance de référence.
Arrivée du site : option --arrivee (device_id du compteur d'arrivée ; défaut Ma Maison = c45bbee265f5).
"""
import argparse, json, subprocess, sys
from pathlib import Path
import pandas as pd

PROJECT_DIR = Path(__file__).resolve().parent.parent
ARRIVEE = {"Ma Maison": "c45bbee265f5"}
MERGE_MIN = 5


def sql(q):
    p = subprocess.run(["supabase", "db", "query", "--linked", "-o", "json", q], cwd=PROJECT_DIR, capture_output=True, text=True)
    if p.returncode != 0 or "{" not in p.stdout:
        sys.exit(f"Erreur d'accès Supabase : {p.stderr[-300:]}")
    return json.JSONDecoder().raw_decode(p.stdout[p.stdout.index("{"):])[0]["rows"]


def ts(x):
    r = pd.to_datetime(x, utc=True)
    return r.dt.tz_localize(None) if isinstance(r, pd.Series) else r.tz_localize(None)


def detect(site, days=35, min_minutes=5, arrivee=None):
    """Retourne dict(E=épisodes, ref=P_réf par heure (W), pw=puissance arrivée/min, m=comptes/min, absences)."""
    arrivee = arrivee or ARRIVEE.get(site) or sys.exit(f"Donner --arrivee pour le site {site}")
    sq = site.replace("'", "''")
    absences = [(ts(r["start_at"]), ts(r["end_at"]) if r["end_at"] else pd.Timestamp.max)
                for r in sql(f"select start_at, end_at from site_absences where site='{sq}'")]
    inabs = lambda t: any(s <= t <= e for s, e in absences)

    m = pd.DataFrame(sql(f"""select date_trunc('minute',ts) m,
        count(distinct device_id) filter (where device_family in ('ENERGIE_1PH','ENERGIE_2PH','ENERGIE_3PH','LUMIERE')) sect,
        count(distinct device_id) filter (where device_type like 'SB%' or device_type like 'S3SN%') pile
        from shelly_cl where site='{sq}' and ts>=now()-interval '{days} days' group by 1 order by 1"""))
    m["m"] = ts(m["m"]); m = m.set_index("m").asfreq("min").fillna(0)
    ref_s = m.sect.rolling(1440, min_periods=200, center=True).median(); ref_p = m.pile.rolling(1440, min_periods=200, center=True).median()
    out = (m.sect <= 0.2 * ref_s) & (m.pile >= 0.5 * ref_p) & (ref_s >= 5)

    ep, start, last = [], None, None
    for t, v in out.items():
        if v:
            if start is None: start = t
            elif (t - last).total_seconds() / 60 > MERGE_MIN + 1: ep.append((start, last)); start = t
            last = t
    if start is not None: ep.append((start, last))
    E = pd.DataFrame(ep, columns=["debut", "fin"])
    E["duree_min"] = ((E.fin - E.debut).dt.total_seconds() / 60 + 1).round()
    E = E[E.duree_min >= min_minutes].reset_index(drop=True)

    pw = pd.DataFrame(sql(f"select date_trunc('minute',ts) m, avg(power_w) w from shelly_cl where device_id='{arrivee}' and ts>=now()-interval '{days} days' group by 1"))
    pw["m"] = ts(pw["m"]); pw = pw.set_index("m").w.astype(float)
    keep = pd.Series(True, index=pw.index)
    for _, r in E.iterrows(): keep[(pw.index >= r.debut - pd.Timedelta(minutes=2)) & (pw.index <= r.fin + pd.Timedelta(minutes=2))] = False
    for s, e in absences: keep[(pw.index >= s) & (pw.index <= e)] = False
    ref = pw[keep].groupby(pw[keep].index.hour).mean()
    E["END_kWh"] = [round(sum(ref[t.hour] for t in pd.date_range(r.debut, r.fin, freq="min")) / 60000, 3) for _, r in E.iterrows()]
    E["pendant_absence"] = E.debut.map(inabs)
    return dict(E=E, ref=ref, pw=pw, m=m, absences=absences, arrivee=arrivee)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", default="Ma Maison"); ap.add_argument("--days", type=int, default=35)
    ap.add_argument("--min-minutes", type=int, default=5); ap.add_argument("--arrivee"); ap.add_argument("--csv")
    a = ap.parse_args()
    r = detect(a.site, a.days, a.min_minutes, a.arrivee); E = r["E"]
    print(f"{a.site} — {len(E)} coupures >= {a.min_minutes} min sur {a.days} j ; durée cumulée {E.duree_min.sum() / 60:.1f} h ; END ≈ {E.END_kWh.sum():.2f} kWh")
    if r["absences"]: print(f"  dont pendant une absence déclarée : {int(E.pendant_absence.sum())} (à ne pas attribuer à SENELEC)")
    pd.set_option("display.width", 200)
    print(E.assign(debut=E.debut.dt.strftime("%d/%m %H:%M"), fin=E.fin.dt.strftime("%d/%m %H:%M")).to_string(index=False))
    if a.csv: E.to_csv(a.csv, index=False); print(f"CSV : {a.csv}")


if __name__ == "__main__":
    main()
