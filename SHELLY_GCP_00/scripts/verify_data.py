"""Vérifie la qualité des données dans Supabase."""
import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))

rows = (
    supabase.table("readings")
    .select("device_id, name, room, device_type, power, voltage, energy_total, temperature, humidity, state, timestamp")
    .order("timestamp", desc=True)
    .limit(29)
    .execute()
    .data
)

# Déduplique par device_id (garde le plus récent)
seen = {}
for r in rows:
    if r["device_id"] not in seen:
        seen[r["device_id"]] = r

print(f"{'APPAREIL':<35} {'PIÈCE':<25} {'TYPE':<12} {'ÉTAT':<6} {'W':>8} {'V':>8} {'°C':>6} {'%HR':>5} {'kWh':>10}")
print("-" * 120)

for r in sorted(seen.values(), key=lambda x: x.get("room") or ""):
    name        = (r.get("name") or r["device_id"])[:34]
    room        = (r.get("room") or "-")[:24]
    dtype       = (r.get("device_type") or "-")[:11]
    state       = r.get("state") or "-"
    power       = f"{r['power']:.1f}"   if r.get("power")       is not None else "-"
    voltage     = f"{r['voltage']:.1f}" if r.get("voltage")     is not None else "-"
    temp        = f"{r['temperature']:.1f}" if r.get("temperature") is not None else "-"
    hum         = f"{r['humidity']:.0f}"    if r.get("humidity")    is not None else "-"
    energy      = f"{r['energy_total']/1000:.2f}" if r.get("energy_total") is not None else "-"

    print(f"{name:<35} {room:<25} {dtype:<12} {state:<6} {power:>8} {voltage:>8} {temp:>6} {hum:>5} {energy:>10}")

print(f"\nTotal : {len(seen)} appareils uniques")
