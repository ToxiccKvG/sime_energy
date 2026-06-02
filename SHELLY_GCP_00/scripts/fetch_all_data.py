"""
Récupère TOUTES les données en temps réel depuis Shelly Cloud (les 2 comptes)
et affiche un rapport complet avec détection d'anomalies.
"""
import os, json, requests
from dotenv import load_dotenv

load_dotenv()

ACCOUNTS = [
    {
        "label":  "Ma Maison",
        "key":    os.getenv("SHELLY_AUTH_KEY"),
        "server": os.getenv("SHELLY_SERVER", "https://shelly-88-eu.shelly.cloud"),
    },
    {
        "label":  "Académie CER2E",
        "key":    os.getenv("SHELLY_AUTH_KEY_2"),
        "server": os.getenv("SHELLY_SERVER_2", "https://shelly-97-eu.shelly.cloud"),
    },
    {
        "label":  "Prestation CER2E",
        "key":    os.getenv("SHELLY_AUTH_KEY_3"),
        "server": os.getenv("SHELLY_SERVER_3", "https://shelly-98-eu.shelly.cloud"),
    },
]

FAMILY_BY_TYPE = {
    "SHEM-3":"ENERGIE_3PH","SPEM-003CEBEU":"ENERGIE_3PH","SPEM-003CEBEU400":"ENERGIE_3PH",
    "SHEM":"ENERGIE_2PH","SPEM-002CEBEU50":"ENERGIE_2PH",
    "SNPL-00112EU":"ENERGIE_1PH","SNPM-001PCEU16":"ENERGIE_1PH","S3PM-001PCEU16":"ENERGIE_1PH",
    "S3PL-00112EU":"ENERGIE_1PH","S4PL-00416EU":"ENERGIE_1PH","SPSW-104PE16EU":"ENERGIE_1PH","S3PB-O3AR000001":"ENERGIE_1PH",
    "SHCB-1":"LUMIERE","SHBDUO-1":"LUMIERE","SHDM-2":"LUMIERE",
    "SBHT-003C":"CAPTEUR_ENV","S3SN-0U12A":"CAPTEUR_ENV","SHGS-1":"CAPTEUR_ENV",
    "SBDW-002C":"ETAT","SBBT-002C":"ETAT","SBMO-003Z":"ETAT","SHMOS-02":"ETAT","S3SW-001P8EU":"ETAT","LOQED":"ETAT",
}

def get_family(t):
    if not t: return "INCONNU"
    if t in FAMILY_BY_TYPE: return FAMILY_BY_TYPE[t]
    for k, v in FAMILY_BY_TYPE.items():
        if t.startswith(k): return v
    return "INCONNU"

def shelly_post(server, key, path, extra=None):
    data = {"auth_key": key, **(extra or {})}
    r = requests.post(f"{server}{path}", data=data, timeout=20)
    r.raise_for_status()
    return r.json()

def anomaly_flags(name, dtype, family, d):
    flags = []
    pw = d.get("power_w")
    v  = d.get("voltage_v")
    t  = d.get("temperature")
    h  = d.get("humidity")
    bat= d.get("battery_level")
    pa = d.get("p_a"); pb = d.get("p_b"); pc = d.get("p_c")

    if family == "ENERGIE_1PH":
        if pw is not None and pw > 5000:
            flags.append(f"POWER_ANORMAL {pw:.0f}W > 5000W")
        if pw is not None and pw < 0:
            flags.append(f"POWER_NEGATIF {pw:.1f}W")
        if v is not None and (v < 170 or v > 260):
            flags.append(f"TENSION_ANORMALE {v:.1f}V")

    if family in ("ENERGIE_3PH", "ENERGIE_2PH"):
        if pw is not None and pw > 100000:
            flags.append(f"POWER_TRES_ELEVE {pw:.0f}W")
        if pw is not None and pw < -50000:
            flags.append(f"POWER_NEGATIF_FORT {pw:.0f}W")
        if v is not None and (v < 170 or v > 260):
            flags.append(f"TENSION_ANORMALE {v:.1f}V")
        for ph, pv in [("A",pa),("B",pb),("C",pc)]:
            if pv is not None and abs(pv) > 100000:
                flags.append(f"PHASE_{ph}_ANORMALE {pv:.0f}W")

    if family == "CAPTEUR_ENV":
        if t is not None and (t < -20 or t > 60):
            flags.append(f"TEMP_ANORMALE {t:.1f}°C")
        if h is not None and (h < 0 or h > 100):
            flags.append(f"HUMIDITE_ANORMALE {h:.0f}%")
        if bat is not None and bat < 10:
            flags.append(f"BATTERIE_FAIBLE {bat}%")

    if family == "ETAT" and bat is not None and bat < 10:
        flags.append(f"BATTERIE_FAIBLE {bat}%")

    return flags


def fetch_account(account):
    print(f"\n{'='*110}")
    print(f"  SITE : {account['label']}  |  {account['server']}")
    print(f"{'='*110}")

    # 1. Liste des appareils (métadonnées)
    dev_resp = shelly_post(account["server"], account["key"], "/interface/device/list")
    if not dev_resp.get("isok"):
        print("  Erreur liste appareils:", dev_resp)
        return

    devices = dev_resp.get("data", {}).get("devices", {})

    # 2. Rooms (optionnel)
    rooms = {}
    try:
        room_resp = shelly_post(account["server"], account["key"], "/interface/room/list")
        for _, r in (room_resp.get("data", {}).get("rooms", {}) or {}).items():
            rooms[r["id"]] = r["name"]
    except Exception:
        pass

    # 3. Status de tous les appareils
    status_resp = shelly_post(account["server"], account["key"], "/device/all_status", {"show_info": "1"})
    all_status = status_resp.get("data", {}).get("devices_status", {})

    # Construire le tableau
    anomalies_found = []
    rows = []

    for dev_id, info in sorted(devices.items(), key=lambda x: x[1].get("name","") if isinstance(x[1],dict) else ""):
        if not isinstance(info, dict): continue
        name   = info.get("name", dev_id)
        dtype  = info.get("type", info.get("app", ""))
        family = get_family(dtype)
        room_id= info.get("room_id")
        room   = rooms.get(room_id, "-") if room_id else "-"
        online = info.get("online", False)

        s = all_status.get(dev_id, {}) or {}
        if not isinstance(s, dict): s = {}

        # Extraire mesures
        d = {}

        if family == "ENERGIE_3PH":
            emeters = s.get("emeters", [])
            em0 = s.get("em:0")
            if emeters and len(emeters) >= 3:
                a,b,c = emeters[0],emeters[1],emeters[2]
                d = dict(power_w=(a.get("power",0)+b.get("power",0)+c.get("power",0)),
                         voltage_v=a.get("voltage"),
                         p_a=a.get("power"),p_b=b.get("power"),p_c=c.get("power"),
                         v_a=a.get("voltage"),v_b=b.get("voltage"),v_c=c.get("voltage"),
                         wh_a=a.get("total"),wh_b=b.get("total"),wh_c=c.get("total"))
            elif em0:
                d = dict(power_w=em0.get("total_act_power"),
                         voltage_v=em0.get("a_voltage"),
                         p_a=em0.get("a_act_power"),p_b=em0.get("b_act_power"),p_c=em0.get("c_act_power"),
                         v_a=em0.get("a_voltage"),v_b=em0.get("b_voltage"),v_c=em0.get("c_voltage"))

        elif family == "ENERGIE_2PH":
            emeters = s.get("emeters", [])
            em0 = s.get("em:0")
            if emeters and len(emeters) >= 2:
                a,b = emeters[0],emeters[1]
                d = dict(power_w=(a.get("power",0)+b.get("power",0)),
                         voltage_v=a.get("voltage"),
                         p_a=a.get("power"),p_b=b.get("power"),
                         v_a=a.get("voltage"),v_b=b.get("voltage"),
                         wh_a=a.get("total"),wh_b=b.get("total"))
            elif em0:
                d = dict(power_w=em0.get("total_act_power"),
                         voltage_v=em0.get("a_voltage"),
                         p_a=em0.get("a_act_power"),p_b=em0.get("b_act_power"))

        elif family == "ENERGIE_1PH":
            relays = s.get("relays", [])
            meters = s.get("meters", [])
            sw0 = s.get("switch:0")
            pm0 = s.get("pm1:0")
            if relays:
                m = meters[0] if meters else {}
                d = dict(state="on" if relays[0].get("ison") else "off",
                         power_w=m.get("power"), voltage_v=m.get("voltage"),
                         wh_counter=m.get("total"))
            elif sw0 is not None:
                d = dict(state="on" if sw0.get("output") else "off",
                         power_w=sw0.get("apower"), voltage_v=sw0.get("voltage"),
                         current_a=sw0.get("current"),
                         wh_counter=(sw0.get("aenergy") or {}).get("total"))
            elif pm0 is not None:
                d = dict(power_w=pm0.get("apower"), voltage_v=pm0.get("voltage"),
                         current_a=pm0.get("current"),
                         wh_counter=(pm0.get("aenergy") or {}).get("total"))

        elif family == "LUMIERE":
            lights = s.get("lights", [])
            meters = s.get("meters", [])
            if lights:
                m = meters[0] if meters else {}
                d = dict(state="on" if lights[0].get("ison") else "off",
                         power_w=m.get("power"))

        elif family == "CAPTEUR_ENV":
            tmp = s.get("tmp"); hum = s.get("hum")
            t0  = s.get("temperature:0"); h0 = s.get("humidity:0")
            bat = (s.get("devicepower:0") or {}).get("battery") or s.get("bat") or {}
            if tmp is not None:
                d["temperature"] = tmp.get("tC") if isinstance(tmp, dict) else tmp
            if hum is not None:
                d["humidity"] = hum.get("value") if isinstance(hum, dict) else hum
            if t0 is not None:
                d["temperature"] = t0.get("tC")
            if h0 is not None:
                d["humidity"] = h0.get("rh")
            d["battery_level"] = bat.get("percent") or bat.get("value")

        elif family == "ETAT":
            bat = (s.get("devicepower:0") or {}).get("battery") or s.get("bat") or {}
            d["battery_level"] = bat.get("percent") or bat.get("value")
            win0 = s.get("window:0")
            inp0 = s.get("input:0")
            if win0 is not None: d["state"] = "open" if win0.get("open") else "closed"
            elif inp0 is not None: d["state"] = "pressed" if inp0.get("state") else "released"

        # Drapeaux anomalie
        state   = d.get("state", "on" if online else "offline")
        flags   = anomaly_flags(name, dtype, family, d)

        pw_str = f"{d['power_w']:.1f}W"  if d.get("power_w")   is not None else "-"
        v_str  = f"{d['voltage_v']:.1f}V" if d.get("voltage_v") is not None else "-"
        t_str  = f"{d['temperature']:.1f}°C" if d.get("temperature") is not None else "-"
        h_str  = f"{d['humidity']:.0f}%" if d.get("humidity")   is not None else "-"
        bat_str= f"{d['battery_level']}%" if d.get("battery_level") is not None else "-"
        pa_str = f"{d['p_a']:.0f}" if d.get("p_a") is not None else "-"
        pb_str = f"{d['p_b']:.0f}" if d.get("p_b") is not None else "-"
        pc_str = f"{d['p_c']:.0f}" if d.get("p_c") is not None else "-"

        flag_str = "  *** " + " | ".join(flags) if flags else ""
        onl  = "EN LIGNE" if online else "OFFLINE "

        rows.append((room, name, dtype, family, state, pw_str, v_str, pa_str, pb_str, pc_str, t_str, h_str, bat_str, flag_str, onl, flags, dev_id, d))
        if flags:
            anomalies_found.append((account["label"], name, room, dtype, flags, d))

    # Afficher le tableau
    hdr = f"{'PIÈCE':<22} {'NOM':<35} {'TYPE':<20} {'FAMILLE':<13} {'ÉTAT':<8} {'STATUT':<9} {'PUISS':<10} {'TENSION':<9} {'P_A':>8} {'P_B':>8} {'P_C':>8} {'TEMP':>7} {'HUM':>6} {'BAT':>5}"
    print(hdr)
    print("-" * 160)

    for r in sorted(rows, key=lambda x: (x[0], x[1])):
        room, name, dtype, family, state, pw, v, pa, pb, pc, t, h, bat, flag_str, onl, flags, dev_id, d = r
        marker = "!!!" if flags else "   "
        print(f"{marker} {room:<22} {name:<35} {dtype:<20} {family:<13} {state:<8} {onl:<9} {pw:<10} {v:<9} {pa:>8} {pb:>8} {pc:>8} {t:>7} {h:>6} {bat:>5}{flag_str}")

    print(f"\n  → {len(rows)} appareils collectés")

    return anomalies_found


# ─── MAIN ────────────────────────────────────────────────────────────────────
all_anomalies = []
for account in ACCOUNTS:
    if not account["key"]:
        print(f"\n[{account['label']}] auth key manquante — ignoré.")
        continue
    result = fetch_account(account)
    if result:
        all_anomalies.extend(result)

# ─── RAPPORT ANOMALIES ───────────────────────────────────────────────────────
if all_anomalies:
    print(f"\n{'='*110}")
    print(f"  RAPPORT ANOMALIES — {len(all_anomalies)} appareil(s) suspect(s)")
    print(f"{'='*110}")
    for site, name, room, dtype, flags, d in all_anomalies:
        print(f"\n  [{site}] {name}  (pièce: {room or '-'}, type: {dtype})")
        for f in flags:
            print(f"      ⚠  {f}")
        # Afficher les valeurs brutes suspectes
        for k in ("power_w","voltage_v","p_a","p_b","p_c","v_a","v_b","v_c","temperature","humidity","battery_level","wh_counter"):
            if d.get(k) is not None:
                print(f"         {k}: {d[k]}")
else:
    print("\n  Aucune anomalie détectée dans les données actuelles.")
