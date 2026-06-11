"""
Diagnostic complet de la table shelly_cl dans Supabase.
Vérifie : volume, fraîcheur, couverture par appareil, anomalies de valeurs.
"""
import os, requests
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

URL = os.getenv("SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
}

def rpc(sql: str) -> list:
    """Exécute une requête SQL via l'API REST Supabase (PostgREST)."""
    r = requests.post(
        f"{URL}/rest/v1/rpc/execute_sql",
        headers=HEADERS,
        json={"query": sql},
        timeout=30,
    )
    if not r.ok:
        return [{"error": r.text}]
    return r.json()

def get(table: str, params: dict) -> list:
    r = requests.get(
        f"{URL}/rest/v1/{table}",
        headers={**HEADERS, "Prefer": "count=exact"},
        params=params,
        timeout=30,
    )
    if not r.ok:
        return [{"error": r.text, "status": r.status_code}]
    return r.json()

def sep(title=""):
    if title:
        print(f"\n{'─'*110}")
        print(f"  {title}")
        print(f"{'─'*110}")
    else:
        print("─" * 110)

# ── 1. Connexion & volume total ───────────────────────────────────────────────
sep("1. CONNEXION & VOLUME TOTAL")
rows = get("shelly_cl", {"select": "ts", "order": "ts.desc", "limit": "1"})
if rows and "error" in rows[0]:
    print(f"  ERREUR connexion : {rows[0]}")
    exit(1)

if rows:
    last_ts = rows[0]["ts"]
    last_dt = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    age_min = (now - last_dt).total_seconds() / 60
    print(f"  Dernière insertion : {last_ts}  ({age_min:.1f} minutes)")
    if age_min > 5:
        print(f"  ⚠  ALERTE : aucune donnée depuis {age_min:.0f} min — le polling est peut-être arrêté !")
    else:
        print(f"  OK — polling actif (< 5 min)")
else:
    print("  Table vide ou inaccessible.")
    exit(1)

# ── 2. Dernières 24h : lignes par site ───────────────────────────────────────
sep("2. LIGNES PAR SITE — dernières 24h")
since = "now()-interval '24 hours'"
rows = get("shelly_cl", {
    "select": "site,ts",
    "ts": f"gte.{(now - __import__('datetime').timedelta(hours=24)).isoformat()}",
    "order": "ts.desc",
    "limit": "50000",
})
site_counts: dict = {}
for r in rows:
    if "error" in r: print(r); break
    s = r.get("site","?")
    site_counts[s] = site_counts.get(s, 0) + 1

for site, cnt in sorted(site_counts.items()):
    print(f"  {site:<30} {cnt:>7} lignes   (~{cnt//1440} lectures/minute/appareil en moyenne)")

# ── 3. Dernier état par appareil ─────────────────────────────────────────────
sep("3. DERNIER ÉTAT PAR APPAREIL (snapshot actuel)")
rows = get("shelly_cl", {
    "select": "site,name,room,device_type,device_family,state,power_w,voltage_v,temperature,humidity,battery_level,ts",
    "order": "ts.desc",
    "limit": "500",
})

seen: dict = {}
for r in rows:
    if "error" in r: print(r); break
    key = r.get("device_id") or r.get("name","?")
    if key not in seen:
        seen[key] = r

anomalies = []

print(f"\n  {'SITE':<20} {'NOM':<35} {'TYPE':<20} {'ÉTAT':<8} {'PUISS':>9} {'TENSION':>8} {'TEMP':>7} {'HUM':>6} {'BAT':>5}  {'TS'}")
print(f"  {'-'*160}")

for r in sorted(seen.values(), key=lambda x: (x.get("site") or "", x.get("room") or "", x.get("name") or "")):
    site   = (r.get("site") or "-")[:19]
    name   = (r.get("name") or "-")[:34]
    dtype  = (r.get("device_type") or "-")[:19]
    family = r.get("device_family") or ""
    state  = r.get("state") or "-"
    pw     = r.get("power_w")
    v      = r.get("voltage_v")
    t      = r.get("temperature")
    h      = r.get("humidity")
    bat    = r.get("battery_level")
    ts     = (r.get("ts") or "")[:19]

    pw_s  = f"{pw:.1f}W"   if pw  is not None else "-"
    v_s   = f"{v:.1f}V"    if v   is not None else "-"
    t_s   = f"{t:.1f}°C"   if t   is not None else "-"
    h_s   = f"{h:.0f}%"    if h   is not None else "-"
    bat_s = f"{bat}%"       if bat is not None else "-"

    # Détection anomalies
    flags = []
    if family == "ENERGIE_1PH" and state != "off":
        if pw is not None and pw > 5000: flags.append(f"POWER>{pw:.0f}W")
        if v  is not None and v > 0 and (v < 170 or v > 260): flags.append(f"V={v:.1f}V")
    if family in ("ENERGIE_3PH","ENERGIE_2PH"):
        if pw is not None and abs(pw) > 100000: flags.append(f"POWER={pw:.0f}W")
        if v  is not None and v > 0 and (v < 170 or v > 260): flags.append(f"V={v:.1f}V")
    if family == "CAPTEUR_ENV":
        if t  is not None and (t < -20 or t > 60): flags.append(f"T={t:.1f}°C")
        if h  is not None and (h < 0   or h > 100): flags.append(f"H={h:.0f}%")
        if bat is not None and bat < 10: flags.append(f"BAT={bat}%")
    if family == "ETAT" and bat is not None and bat < 10:
        flags.append(f"BAT={bat}%")

    marker = "!!!" if flags else "   "
    flag_s = "  *** " + " | ".join(flags) if flags else ""

    print(f"  {marker} {site:<20} {name:<35} {dtype:<20} {state:<8} {pw_s:>9} {v_s:>8} {t_s:>7} {h_s:>6} {bat_s:>5}  {ts}{flag_s}")

    if flags:
        anomalies.append((r.get("site","?"), r.get("name","?"), r.get("room","-"), dtype, flags, r))

print(f"\n  → {len(seen)} appareils distincts dans les 500 dernières lignes")

# ── 4. Qualité des données : NULLs par colonne ───────────────────────────────
sep("4. QUALITÉ — taux de remplissage par famille (dernière heure)")
one_hour_ago = (now - __import__('datetime').timedelta(hours=1)).isoformat()
rows_1h = get("shelly_cl", {
    "select": "device_family,power_w,voltage_v,temperature,humidity,battery_level,wh_tot,state",
    "ts": f"gte.{one_hour_ago}",
    "limit": "10000",
})

family_stats: dict = {}
for r in rows_1h:
    if "error" in r: print(r); break
    fam = r.get("device_family") or "INCONNU"
    if fam not in family_stats:
        family_stats[fam] = {"total":0,"power":0,"voltage":0,"temp":0,"hum":0,"bat":0,"wh":0,"state":0}
    s = family_stats[fam]
    s["total"] += 1
    if r.get("power_w")       is not None: s["power"]   += 1
    if r.get("voltage_v")     is not None: s["voltage"]  += 1
    if r.get("temperature")   is not None: s["temp"]     += 1
    if r.get("humidity")      is not None: s["hum"]      += 1
    if r.get("battery_level") is not None: s["bat"]      += 1
    if r.get("wh_tot")         is not None: s["wh"]       += 1
    if r.get("state")         is not None: s["state"]    += 1

print(f"  {'FAMILLE':<16} {'LIGNES':>7}  {'power%':>7} {'volt%':>6} {'temp%':>6} {'hum%':>5} {'bat%':>5} {'wh%':>5} {'state%':>7}")
print(f"  {'-'*80}")
for fam, s in sorted(family_stats.items()):
    n = s["total"] or 1
    def pct(k): return f"{100*s[k]//n}%"
    print(f"  {fam:<16} {s['total']:>7}  {pct('power'):>7} {pct('voltage'):>6} {pct('temp'):>6} {pct('hum'):>5} {pct('bat'):>5} {pct('wh'):>5} {pct('state'):>7}")

# ── 5. Rapport anomalies ──────────────────────────────────────────────────────
if anomalies:
    sep(f"5. ANOMALIES — {len(anomalies)} appareil(s)")
    for site, name, room, dtype, flags, r in anomalies:
        print(f"\n  [{site}] {name}  (pièce: {room or '-'}, type: {dtype})")
        for f in flags:
            print(f"      ⚠  {f}")
        for k in ("power_w","voltage_v","p_a","p_b","p_c","temperature","humidity","battery_level","wh_tot","ts"):
            if r.get(k) is not None:
                print(f"         {k}: {r[k]}")
else:
    sep("5. ANOMALIES")
    print("  Aucune anomalie détectée.")

# ── 6. Gaps de collecte (minutes sans données) ───────────────────────────────
sep("6. CONTINUITÉ DE LA COLLECTE — dernières 6 heures")
six_hours_ago = (now - __import__('datetime').timedelta(hours=6)).isoformat()
rows_ts = get("shelly_cl", {
    "select": "ts",
    "ts": f"gte.{six_hours_ago}",
    "order": "ts.asc",
    "limit": "10000",
})

times = []
for r in rows_ts:
    if "error" in r: break
    try:
        times.append(datetime.fromisoformat(r["ts"].replace("Z","+00:00")))
    except: pass

gaps = []
for i in range(1, len(times)):
    delta = (times[i] - times[i-1]).total_seconds()
    if delta > 120:  # > 2 minutes = gap
        gaps.append((times[i-1], times[i], delta/60))

if gaps:
    print(f"  ⚠  {len(gaps)} gap(s) détecté(s) :")
    for start, end, dur in gaps:
        print(f"     {start.strftime('%H:%M:%S')} → {end.strftime('%H:%M:%S')}  ({dur:.1f} min)")
else:
    print(f"  OK — {len(times)} lignes, aucun gap > 2 min sur les 6 dernières heures.")
