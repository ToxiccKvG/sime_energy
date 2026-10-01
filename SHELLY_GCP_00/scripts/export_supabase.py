#!/usr/bin/env python3
"""Export hors-Supabase des données (sauvegarde à toi), lecture seule.

    python SHELLY_GCP_00/scripts/export_supabase.py --out /Volumes/Lexar/SIME_BACKUP_SUPABASE
    python SHELLY_GCP_00/scripts/export_supabase.py --out ... --from 2026-09-01   # export incrémental

Produit <out>/<AAAA-MM-JJ>/ :
  tables/<table>.json.gz        tables de configuration et applicatives (lossless)
  shelly_cl/shelly_cl_AAAA-MM.csv.gz   mesures brutes, 1 fichier par mois
  shelly_cl_horaire/shelly_cl_horaire_AAAA-MM.csv.gz
  schema/functions.json, cron_jobs.json, policies.json
  manifest.json                 comptages, empreintes SHA-256, vérifications

Choix de conception :
  * shelly_accounts est EXCLUE (contient les clés d'API Shelly) : à ressaisir depuis l'app Shelly si perdue.
  * JSON et non CSV côté CLI : le CSV du CLI arrondit les grands nombres (id -> 9.544614e+06).
  * Les nombres sont écrits tels que reçus ; NULL = cellule vide.
  * Chaque mois est vérifié (lignes reçues == lignes comptées en base) ; sinon le script échoue.
Voir Sime_energy/docs/runbook-data.md.
"""
from concurrent.futures import ThreadPoolExecutor
import argparse, csv, datetime as dt, gzip, hashlib, json, subprocess, sys, time
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
EXCLUDED = {"shelly_accounts"}                      # secrets
BIG = {"shelly_cl": "ts", "shelly_cl_horaire": "ts_heure"}


def sql(q: str, retries: int = 3) -> list[dict]:
    for k in range(retries):
        p = subprocess.run(["supabase", "db", "query", "--linked", "-o", "json", q], cwd=PROJECT_DIR, capture_output=True, text=True)
        if p.returncode == 0 and "{" in p.stdout:
            return json.JSONDecoder().raw_decode(p.stdout[p.stdout.index("{"):])[0]["rows"]
        time.sleep(3 * (k + 1))
    sys.exit(f"Échec requête après {retries} essais : {q[:120]}\n{p.stderr[-300:]}")


def cell(v):
    if v is None: return ""
    if isinstance(v, (dict, list)): return json.dumps(v, ensure_ascii=False)
    return v


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()


def day_range(a: dt.date, b: dt.date):
    while a < b:
        yield a; a += dt.timedelta(days=1)


def export_month(table, col, header, dest, month, expected, start, end):
    y, m = map(int, month.split("-"))
    a = max(start, dt.date(y, m, 1)); b = min(end, dt.date(y + (m == 12), m % 12 + 1, 1))
    path = dest / table / f"{table}_{month}.csv.gz"; n = 0
    with gzip.open(path, "wt", newline="", encoding="utf-8", compresslevel=6) as gz:
        w = csv.writer(gz); w.writerow(header)
        for day in day_range(a, b):
            # jsonb_strip_nulls : ne transfère que les colonnes renseignées (~3x moins de données)
            rows = sql(f"select jsonb_strip_nulls(to_jsonb(t)) j from {table} t where {col}>='{day}' and {col}<'{day + dt.timedelta(days=1)}' order by {col}, id")
            for r in rows:
                j = r["j"] if isinstance(r["j"], dict) else json.loads(r["j"])
                w.writerow([cell(j.get(k)) for k in header])
            n += len(rows)
    ok = n == expected
    print(f"  {table} {month}: {n}/{expected} {'OK' if ok else 'ECART'}", flush=True)
    if not ok: raise RuntimeError(f"Vérification échouée : {table} {month} ({n} reçues, {expected} en base)")
    return month, dict(rows=n, expected=expected, ok=ok, bytes=path.stat().st_size, sha256=sha(path))


def export_big(table: str, col: str, dest: Path, start: dt.date, end: dt.date, manifest: dict, workers: int = 3):
    counts = {r["m"]: r["n"] for r in sql(
        f"select to_char(date_trunc('month',{col}),'YYYY-MM') m, count(*) n from {table} "
        f"where {col}>='{start}' and {col}<'{end}' group by 1 order by 1")}
    header = [r["column_name"] for r in sql(f"select column_name from information_schema.columns where table_schema='public' and table_name='{table}' order by ordinal_position")]
    (dest / table).mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(export_month, table, col, header, dest, mo, n, start, end) for mo, n in counts.items()]
        manifest[table] = dict(f.result() for f in futs)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True); ap.add_argument("--from", dest="since", default="2026-04-01")
    ap.add_argument("--until", default=dt.datetime.now(dt.timezone.utc).date().isoformat(), help="exclu (défaut : aujourd'hui UTC)")
    args = ap.parse_args()
    start, end = dt.date.fromisoformat(args.since), dt.date.fromisoformat(args.until)
    dest = Path(args.out) / dt.datetime.now(dt.timezone.utc).date().isoformat()
    for sub in ("tables", "schema"): (dest / sub).mkdir(parents=True, exist_ok=True)
    manifest = {"cree_le": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "periode": [str(start), str(end)], "exclu": sorted(EXCLUDED), "tables": {}}

    names = [r["table_name"] for r in sql("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")]
    for t in names:
        if t in EXCLUDED or t in BIG: continue
        rows = sql(f"select * from {t}")
        p = dest / "tables" / f"{t}.json.gz"
        with gzip.open(p, "wt", encoding="utf-8") as g: json.dump(rows, g, ensure_ascii=False, default=str)
        manifest["tables"][t] = dict(rows=len(rows), sha256=sha(p)); print(f"  table {t}: {len(rows)} lignes", flush=True)

    for name, q in {"functions": "select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
                    "cron_jobs": "select jobname, schedule, command, active from cron.job",
                    "policies": "select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public'"}.items():
        (dest / "schema" / f"{name}.json").write_text(json.dumps(sql(q), ensure_ascii=False, indent=1, default=str), encoding="utf-8")

    for table, col in BIG.items():
        if table in names: export_big(table, col, dest, start, end, manifest)
    (dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Terminé : {dest}")


if __name__ == "__main__":
    main()
