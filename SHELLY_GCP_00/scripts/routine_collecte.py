#!/usr/bin/env python3
"""Routine de début de journée : santé de la collecte Shelly -> Supabase.

Usage (depuis n'importe où) :
    python SHELLY_GCP_00/scripts/routine_collecte.py            # résumé + PDF sur le Desktop
    python SHELLY_GCP_00/scripts/routine_collecte.py --no-pdf   # résumé terminal seulement
    python SHELLY_GCP_00/scripts/routine_collecte.py --out ~/Documents

Prérequis :
  * CLI Supabase connecté (`supabase login`) ; aucune clé n'est lue ni stockée ici.
  * Le projet est lié depuis SHELLY_GCP_00/ (le script s'y place tout seul).
  * PDF : `pip install reportlab` (sinon le script affiche seulement le résumé).

Code de sortie : 0 = collecte fraîche, 1 = collecte en retard (> 10 min), 2 = erreur d'accès.
Voir Sime_energy/docs/runbook-data.md.
"""
import argparse, json, subprocess, sys, os, datetime as dt
from collections import Counter
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent          # SHELLY_GCP_00/
FRESH_MAX_MIN = 10          # au-delà, la collecte est considérée en retard
STALE_MEAS_H = 12           # mesure renvoyée plus vieille que ça = suspecte (hors capteurs événementiels)
EVENT_FAMILIES = {"ETAT"}   # ouverture porte, bouton, mouvement : pas de mesure régulière


def sql(query: str) -> list[dict]:
    """Exécute du SQL en lecture via le CLI Supabase (clé gérée par le CLI)."""
    p = subprocess.run(["supabase", "db", "query", "--linked", "-o", "json", query],
                       cwd=PROJECT_DIR, capture_output=True, text=True)
    out = p.stdout
    if p.returncode != 0 or "{" not in out:
        print(f"Erreur d'accès Supabase. Vérifier `supabase login`.\n{p.stderr[-400:]}", file=sys.stderr)
        sys.exit(2)
    return json.JSONDecoder().raw_decode(out[out.index("{"):])[0]["rows"]


def collect(hours: int) -> dict:
    d = {}
    d["fresh"] = sql(f"""select max(ts) last_ts, now() now,
        count(*) filter (where ts>now()-interval '1 hour') n_1h, count(*) n_win
        from shelly_cl where ts>now()-interval '{hours} hours'""")[0]
    d["devices"] = sql(f"""
        with w as (select device_id, max(site) site, max(name) name, max(device_family) fam,
                          max(ts) last_ts, max(measured_at) last_meas, count(*) n,
                          count(*) filter (where ts>now()-interval '1 hour') n1h
                   from shelly_cl where ts>now()-interval '{hours} hours' group by device_id)
        select coalesce(w.device_id,r.device_id) id, w.site, coalesce(r.libelle,w.name) lib, w.fam,
               w.last_ts, w.last_meas, w.n, w.n1h, r.role
        from w full join shelly_device_roles r on r.device_id=w.device_id""")
    d["trend"] = sql("""select date(ts) d, site, count(distinct device_id) devs, count(*) n
        from shelly_cl where ts>=now()-interval '9 days' group by 1,2 order by 1,2""")
    d["silent"] = sql(f"""select device_id, max(site) site, max(name) name, max(ts) last_ts
        from shelly_cl where ts>=now()-interval '35 days'
          and device_id in (select device_id from shelly_device_roles)
        group by 1 having max(ts)<now()-interval '{hours} hours' order by site, last_ts""")
    d["db"] = sql("""select pg_size_pretty(pg_database_size(current_database())) db,
        pg_size_pretty(pg_total_relation_size('shelly_cl')) cl,
        (select reltuples::bigint from pg_class where relname='shelly_cl') rows""")[0]
    return d


def analyse(d: dict) -> dict:
    f = d["fresh"]
    lag_min = (parse(f["now"]) - parse(f["last_ts"])).total_seconds() / 60
    live = [r for r in d["devices"] if r["n1h"]]
    stale = [r for r in d["devices"] if r["n"] and not r["n1h"]]
    noroles = [r for r in d["devices"] if r["n"] and not r["role"]]
    old_meas = []
    for r in live:
        if r["fam"] in EVENT_FAMILIES or not r["last_meas"]:
            continue
        age_h = (parse(f["now"]) - parse(r["last_meas"])).total_seconds() / 3600
        if age_h > STALE_MEAS_H:
            old_meas.append((r, age_h))
    return dict(lag_min=lag_min, live=live, stale=stale, noroles=noroles, old_meas=old_meas,
                by_site=Counter(r["site"] for r in live))


def parse(s: str) -> dt.datetime:
    s = s.replace(" ", "T")
    if s.endswith("+00"): s += ":00"
    return dt.datetime.fromisoformat(s)


def summary(d: dict, a: dict, hours: int) -> str:
    f, db = d["fresh"], d["db"]
    ok = a["lag_min"] <= FRESH_MAX_MIN
    L = [f"== Routine collecte — {parse(f['now']):%d/%m/%Y %H:%M} UTC ==",
         f"{'OK ' if ok else 'ALERTE'} dernière ligne il y a {a['lag_min']:.1f} min ; {f['n_win']} lignes sur {hours} h",
         f"Appareils actifs (dernière heure) : {len(a['live'])} — " + ", ".join(f"{k} {v}" for k, v in sorted(a['by_site'].items())),
         f"Base : {db['db']} (shelly_cl {db['cl']}, ~{db['rows']/1e6:.1f} M lignes) ; seuil prévu 8 Go",
         f"Appareils muets > {hours} h : {len(d['silent'])} — par site : " +
         ", ".join(f"{k} {v}" for k, v in sorted(Counter(r['site'] for r in d['silent']).items())),
         f"Collectés mais sans donnée depuis > 1 h : {len(a['stale'])}"]
    L += [f"   - {r['site']} / {r['lib']} (dernière ligne {r['last_ts'][:16]})" for r in a["stale"]]
    L.append(f"Mesure renvoyée trop ancienne (> {STALE_MEAS_H} h, capteurs non événementiels) : {len(a['old_meas'])}")
    L += [f"   - {r['site']} / {r['lib']} : mesure du {r['last_meas'][:16]} ({h/24:.0f} j)" for r, h in a["old_meas"]]
    L.append(f"Appareils sans rôle (shelly_device_roles) : {len(a['noroles'])}")
    L += [f"   - {r['lib']} ({r['id']})" for r in a["noroles"]]
    return "\n".join(L)


def make_pdf(d: dict, a: dict, path: Path, hours: int) -> bool:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    except ImportError:
        print("reportlab absent : `pip install reportlab` pour obtenir le PDF.")
        return False
    NAVY = colors.HexColor("#1f3a5f"); ss = getSampleStyleSheet()
    b = ParagraphStyle("b", parent=ss["BodyText"], fontSize=9.5, leading=13.5)
    h1 = ParagraphStyle("h", parent=ss["Heading1"], textColor=NAVY, fontSize=14, spaceBefore=10)
    ti = ParagraphStyle("t", parent=ss["Title"], textColor=NAVY, alignment=0, fontSize=21)
    s8 = ParagraphStyle("s", parent=b, fontSize=8, textColor=colors.HexColor("#555555"))

    def tbl(rows, w, fs=7.5):
        x = Table(rows, colWidths=w, repeatRows=1)
        x.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                               ("FONTSIZE", (0, 0), (-1, -1), fs), ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#d5dbe5")),
                               ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f7fb")]), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        return x
    f, db = d["fresh"], d["db"]
    ok = a["lag_min"] <= FRESH_MAX_MIN
    P = lambda t, s=b: Paragraph(t, s)
    st = [P("Rapport de collecte Shelly", ti), P(f"État à {parse(f['now']):%d/%m/%Y %H:%M} UTC · fenêtre : {hours} dernières heures", s8), P("1. Verdict", h1),
          P(f"<b>{'La collecte tourne' if ok else 'ALERTE : collecte en retard'}</b> : dernière ligne il y a {a['lag_min']:.1f} min, <b>{f['n_win']} lignes</b> sur {hours} h, "
            f"{len(a['live'])} appareils actifs dans la dernière heure ({', '.join(f'{k} {v}' for k, v in sorted(a['by_site'].items()))})."),
          P(f"Base : {db['db']} (shelly_cl {db['cl']}, ≈ {db['rows']/1e6:.1f} M lignes), seuil prévu 8 Go."), P("2. Tendance sur 9 jours", h1)]
    rows = [["Jour", "Ma Maison", "Académie", "Donsin"]]; days: dict = {}
    for r in d["trend"]: days.setdefault(r["d"], {})[r["site"]] = f"{r['devs']} app. / {r['n']}"
    for day in sorted(days):
        m = days[day]; rows.append([day[8:10] + "/" + day[5:7], m.get("Ma Maison", "-"), m.get("Académie CER2E", "-"), m.get("Donsin", "-")])
    st += [tbl(rows, [2 * cm, 5 * cm, 5 * cm, 5 * cm], 8), P("Format : appareils distincts / lignes collectées. Le dernier jour est partiel.", s8),
           PageBreak(), P("3. Appareils actifs (dernière heure)", h1)]
    rows = [["Site", "Appareil", "Dernière collecte", "Dernière mesure", "Lignes"]]
    old = {r["id"] for r, _ in a["old_meas"]}
    for r in sorted(a["live"], key=lambda r: (r["site"] or "", r["lib"] or "")):
        rows.append([(r["site"] or "").replace("Académie CER2E", "Académie"), (r["lib"] or "")[:38], r["last_ts"][11:16],
                     (r["last_meas"] or "")[:16] + (" !" if r["id"] in old else ""), r["n"]])
    st += [tbl(rows, [2.3 * cm, 7 * cm, 2.6 * cm, 3.4 * cm, 1.9 * cm], 7), P("! = mesure renvoyée trop ancienne sur un capteur non événementiel.", s8),
           PageBreak(), P("4. Alertes", h1)]
    for t in [f"{len(a['stale'])} appareil(s) collecté(s) il y a moins de {hours} h mais muets depuis plus d'une heure : " + (", ".join(r['lib'] for r in a['stale']) or "aucun"),
              f"{len(a['old_meas'])} capteur(s) dont la mesure est trop ancienne : " + (", ".join(f"{r['lib']} ({h/24:.0f} j)" for r, h in a['old_meas']) or "aucun"),
              f"{len(a['noroles'])} appareil(s) sans rôle : " + (", ".join(f"{r['lib']} ({r['id']})" for r in a['noroles']) or "aucun")]:
        st += [P("• " + t), Spacer(1, .1 * cm)]
    st += [P(f"Appareils sans donnée depuis {hours} h ou plus", h1)]
    rows = [["Site", "Appareil", "Dernière donnée (UTC)"]] + [[(r["site"] or "").replace("Académie CER2E", "Académie"), (r["name"] or "")[:40], r["last_ts"][:16]] for r in d["silent"]]
    st += [tbl(rows, [2.6 * cm, 8.5 * cm, 4.5 * cm], 7)]
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm,
                      title="Rapport de collecte Shelly").build(st)
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hours", type=int, default=24, help="fenêtre d'analyse (défaut 24)")
    ap.add_argument("--out", default="~/Desktop", help="dossier du PDF (défaut ~/Desktop)")
    ap.add_argument("--no-pdf", action="store_true")
    args = ap.parse_args()
    d = collect(args.hours); a = analyse(d)
    print(summary(d, a, args.hours))
    if not args.no_pdf:
        out = Path(os.path.expanduser(args.out)) / f"Rapport_collecte_{parse(d['fresh']['now']):%Y-%m-%d}.pdf"
        if make_pdf(d, a, out, args.hours): print(f"PDF : {out}")
    sys.exit(0 if a["lag_min"] <= FRESH_MAX_MIN else 1)


if __name__ == "__main__":
    main()
