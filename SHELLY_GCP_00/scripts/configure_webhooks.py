"""
Configure les webhooks HTTP sur tous les appareils Shelly Gen2+
pour envoyer les données énergie vers la Supabase Edge Function.
"""
import json
import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

SHELLY_AUTH_KEY = os.getenv("SHELLY_AUTH_KEY")
SHELLY_SERVER = os.getenv("SHELLY_SERVER", "https://shelly-88-eu.shelly.cloud")
SUPABASE_URL = os.getenv("SUPABASE_URL")

EDGE_FUNCTION_BASE = f"{SUPABASE_URL}/functions/v1/shelly-webhook"


def get_devices() -> list[dict]:
    resp = requests.post(
        f"{SHELLY_SERVER}/interface/device/list",
        data={"auth_key": SHELLY_AUTH_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("isok"):
        raise RuntimeError(f"Shelly API error: {data}")
    devices_data = data.get("data", {})
    raw = (
        devices_data.get("devices_status")
        or devices_data.get("devices")
        or devices_data
    )
    # Normalise : dict {id: info} ou list [{id, ...}]
    if isinstance(raw, dict):
        return [{"id": k, **(v if isinstance(v, dict) else {"name": k})} for k, v in raw.items()]
    return raw


def send_rpc(device_id: str, method: str, params: dict) -> dict:
    # Shelly Cloud API attend du form-encoded avec data= en JSON string
    resp = requests.post(
        f"{SHELLY_SERVER}/interface/device/relay/bulk_rpc",
        data={
            "auth_key": SHELLY_AUTH_KEY,
            "data": json.dumps({
                "device_ids": [device_id],
                "method": method,
                "params": params,
            }),
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def configure_webhook(device_id: str, site: str) -> dict:
    """Crée un webhook sur l'appareil pour envoyer les données énergie."""
    webhook_url = f"{EDGE_FUNCTION_BASE}?device_id={device_id}&site={site}"
    return send_rpc(device_id, "Webhook.Create", {
        "enable": True,
        "event": "em.data",          # événement énergie 3EM
        "urls": [webhook_url],
    })


def main():
    print(f"Serveur Shelly : {SHELLY_SERVER}")
    print(f"Edge Function  : {EDGE_FUNCTION_BASE}\n")

    devices = get_devices()
    print(f"{len(devices)} appareil(s) trouvé(s) :\n")

    for dev in devices:
        device_id = dev.get("id") or dev.get("_id")
        name = dev.get("name", device_id)
        print(f"  [{device_id}] {name}")

    print()
    site = input("Nom du site pour tous ces appareils (ex: batiment_a) : ").strip()
    if not site:
        print("Site requis. Abandon.")
        sys.exit(1)

    print()
    for dev in devices:
        device_id = dev.get("id") or dev.get("_id")
        name = dev.get("name", device_id)
        try:
            result = configure_webhook(device_id, site)
            print(f"  ✓ {name} ({device_id}) — webhook configuré")
        except Exception as e:
            print(f"  ✗ {name} ({device_id}) — erreur : {e}")

    print("\nConfiguration terminée.")


if __name__ == "__main__":
    main()
