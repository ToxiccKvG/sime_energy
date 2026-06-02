"""
Liste tous les appareils Shelly (tous comptes) avec leur modèle (type) et génération.
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

ACCOUNTS = [
    {
        "label":  "Compte 1 — Ma Maison",
        "key":    os.getenv("SHELLY_AUTH_KEY"),
        "server": os.getenv("SHELLY_SERVER", "https://shelly-88-eu.shelly.cloud"),
    },
    {
        "label":  "Compte 2 — Académie CER2E",
        "key":    os.getenv("SHELLY_AUTH_KEY_2"),
        "server": os.getenv("SHELLY_SERVER_2", "https://shelly-97-eu.shelly.cloud"),
    },
    {
        "label":  "Compte 3 — Prestation CER2E",
        "key":    os.getenv("SHELLY_AUTH_KEY_3"),
        "server": os.getenv("SHELLY_SERVER_3", "https://shelly-98-eu.shelly.cloud"),
    },
]


def list_devices(account: dict):
    resp = requests.post(
        f"{account['server']}/interface/device/list",
        data={"auth_key": account["key"]},
        timeout=15,
    )
    data = resp.json()
    if not data.get("isok"):
        print(f"Erreur API ({account['label']}) :", data)
        return

    devices = data.get("data", {}).get("devices", {})
    print(f"\n{'='*100}")
    print(f"  {account['label']}  —  {account['server']}  —  {len(devices)} appareils")
    print(f"{'='*100}")
    print(f"{'ID':<20} {'NOM':<35} {'MODÈLE (type)':<22} {'GEN'}")
    print("-" * 85)
    for dev_id, info in sorted(devices.items(), key=lambda x: x[1].get("name", "") if isinstance(x[1], dict) else ""):
        if not isinstance(info, dict):
            continue
        print(f"{dev_id:<20} {info.get('name', ''):<35} {info.get('type', ''):<22} {info.get('gen', 1)}")


for account in ACCOUNTS:
    if account["key"]:
        list_devices(account)
    else:
        print(f"\n[{account['label']}] auth key manquante — ignoré.")
