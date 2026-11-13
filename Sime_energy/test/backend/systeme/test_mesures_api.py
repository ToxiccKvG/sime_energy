"""POST /processing/process-file/measures — import d'un fichier de capteur de bout en bout."""
import io

import pandas as pd
import pytest

API = "/api/V1"

URL = API + "/processing/process-file/measures"


def envoyer(client, contenu: bytes, nom: str, capteur: str):
    return client.post(URL, files={"file": (nom, contenu)}, data={"sensor_type": capteur})


@pytest.mark.systeme
@pytest.mark.parametrize("fichier,capteur,points,moyenne", [
    ("voltcraft.csv", "89_VOLTCRAFT", 4, 350.0),
    ("voltcraft_latin1.csv", "89_VOLTCRAFT", 4, 350.0),
    ("th30.csv", "TH_30", 4, 25.25),
    ("rht10.xls", "RHT_10", 3, 26.0),
    ("smart_energy.csv", "SMART_ENERGY_METER", 3, 1000.0),
])
def test_import_capteur(client, fixtures_dir, fichier, capteur, points, moyenne):
    r = envoyer(client, (fixtures_dir / fichier).read_bytes(), fichier, capteur)
    assert r.status_code == 200, r.text
    corps = r.json()
    assert corps["sensor_type"] == capteur
    assert len(corps["measurements"]) == points
    assert corps["kpis"]["avgConsumption"] == pytest.approx(moyenne)
    assert corps["processing_info"]["file_name"] == fichier


@pytest.mark.systeme
def test_import_sentinel_excel(client):
    tampon = io.BytesIO()
    pd.DataFrame([
        {"date": "2024-03-01", "heure": "08:00:00", "p_active": 1000, "i": 4.4},
        {"date": "2024-03-01", "heure": "08:10:00", "p_active": 1400, "i": 6.1},
    ]).to_excel(tampon, index=False)
    r = envoyer(client, tampon.getvalue(), "sentinel.xlsx", "8_SENTINEL")
    assert r.status_code == 200, r.text
    assert r.json()["kpis"]["peakConsumption"] == pytest.approx(1400.0)


@pytest.mark.systeme
def test_capteur_inconnu_400(client, fixtures_dir):
    r = envoyer(client, (fixtures_dir / "voltcraft.csv").read_bytes(), "x.csv", "FLUKE_1730")
    assert r.status_code == 400
    assert "non supporté" in r.json()["detail"]


@pytest.mark.systeme
def test_fichier_vide_400(client):
    assert envoyer(client, b"", "vide.csv", "89_VOLTCRAFT").status_code == 400


@pytest.mark.systeme
def test_fichier_mal_forme_message_explicite(client):
    r = envoyer(client, b"ceci n'est pas un export voltcraft", "x.csv", "89_VOLTCRAFT")
    assert r.status_code == 400, f"Fichier invalide → HTTP {r.status_code} : {r.text}"
