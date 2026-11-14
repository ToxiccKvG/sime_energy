"""POST /processing/process-file/measures — import d'un fichier de capteur de bout en bout.

Mis à jour après la fusion : le registre ne connaît plus les anciens capteurs (89_VOLTCRAFT,
TH_30…), les fichiers d'enregistreurs passent par le capteur personnalisé (CUSTOM), et la
réponse ne contient plus de KPIs (le frontend les calcule).
"""
import json

import pytest

API = "/api/V1"

URL = API + "/processing/process-file/measures"

SHELLY = "Total\nTemps, Wh\n01/01/2026 00:00, 20,0\n02/01/2026 00:00, 30,0\n"


def envoyer(client, contenu: bytes, nom: str, capteur: str, config: dict | None = None):
    data = {"sensor_type": capteur}
    if config is not None:
        data["sensor_config"] = json.dumps(config)
    return client.post(URL, files={"file": (nom, contenu)}, data=data)


@pytest.mark.systeme
def test_import_capteur_du_registre(client):
    r = envoyer(client, SHELLY.encode(), "shelly.csv", "SHELLY")
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["sensor_type"] == "SHELLY"
    assert [m["consumption"] for m in corps["measurements"]] == [20.0, 30.0]
    assert corps["processing_info"]["file_name"] == "shelly.csv"


@pytest.mark.systeme
@pytest.mark.parametrize("fichier", ["voltcraft.csv", "voltcraft_latin1.csv"])
def test_import_capteur_personnalise(client, fixtures_dir, fichier):
    config = {"timestamp_col": "Temps enreg.", "value_col": "Puissance (W)", "unit": "W"}
    r = envoyer(client, (fixtures_dir / fichier).read_bytes(), fichier, "CUSTOM", config)
    assert r.status_code == 200, r.text
    corps = r.json()
    assert len(corps["measurements"]) == 4
    assert sum(m["consumption"] for m in corps["measurements"]) == pytest.approx(1400.0)
    assert corps["processing_info"]["file_name"] == fichier


@pytest.mark.systeme
def test_configuration_personnalisee_illisible_400(client):
    r = client.post(URL, files={"file": ("x.csv", b"a;b\n1;2\n")},
                    data={"sensor_type": "CUSTOM", "sensor_config": "{pas du json"})
    assert r.status_code == 400
    assert "illisible" in r.json()["detail"]


@pytest.mark.systeme
def test_capteur_inconnu_400(client, fixtures_dir):
    r = envoyer(client, (fixtures_dir / "voltcraft.csv").read_bytes(), "x.csv", "FLUKE_1730")
    assert r.status_code == 400
    assert "non supporté" in r.json()["detail"]


@pytest.mark.systeme
def test_fichier_vide_400(client):
    assert envoyer(client, b"", "vide.csv", "SHELLY").status_code == 400


@pytest.mark.systeme
def test_fichier_mal_forme_message_explicite(client):
    r = envoyer(client, b"ceci n'est pas un classeur", "x.xlsx", "CA8335_TREND")
    assert r.status_code == 400, f"Fichier invalide → HTTP {r.status_code} : {r.text}"
    assert "ne correspond pas" in r.json()["detail"]


@pytest.mark.systeme
def test_apercu_fichier_de_mesures(client, fixtures_dir):
    r = client.post(URL + "/preview", files={"file": ("v.csv", (fixtures_dir / "voltcraft.csv").read_bytes())})
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["columns"][0] == "Temps enreg."
    assert corps["row_count"] == 4
