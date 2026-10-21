"""Parseurs des fichiers de capteurs (Module 3 — Mesures).

Les fichiers d'exemple de fixtures/ reproduisent le format attendu par chaque parseur
(en-têtes de métadonnées + bloc de données).
"""
import pandas as pd
import pytest

from app.core.measures import (
    parse_rht10_txt,
    parse_sentinel_excel,
    parse_smart_energy_csv,
    parse_th30_csv,
    parse_voltcraft_csv,
)


def lire(fixtures_dir, nom: str) -> str:
    return (fixtures_dir / nom).read_text(encoding="utf-8")


# ─── VOLTCRAFT ───────────────────────────────────────────────────────────────

class TestVoltcraft:
    def test_metadonnees(self, fixtures_dir):
        _, meta = parse_voltcraft_csv(lire(fixtures_dir, "voltcraft.csv"))
        assert meta["start_time"] == "01-03-2024 08:00:00"
        assert meta["end_time"] == "01-03-2024 08:03:00"
        assert meta["data_count"] == 4

    def test_decimales_francaises_converties(self, fixtures_dir):
        df, _ = parse_voltcraft_csv(lire(fixtures_dir, "voltcraft.csv"))
        assert len(df) == 4
        assert df["Puissance (W)"].tolist() == [300.0, 400.0, 500.0, 200.0]
        assert df["Courant (A)"].tolist() == [1.5, 2.0, 2.5, 1.0]
        assert df["Puissance apparente (W)"].dtype == float


# ─── TH_30 ───────────────────────────────────────────────────────────────────

class TestTH30:
    def test_metadonnees(self, fixtures_dir):
        _, meta = parse_th30_csv(lire(fixtures_dir, "th30.csv"))
        assert meta["company"] == "VOLTCRAFT"
        assert meta["serial_number"] == "TH30-0042"
        assert meta["start_time"] == "20:44,19 Jan. 2021"
        assert meta["end_time"] == "20:47,19 Jan. 2021"
        assert meta["duration"] == "0j 0h 3min"
        assert meta["data_count"] == 4

    def test_temperatures_sans_unite(self, fixtures_dir):
        df, _ = parse_th30_csv(lire(fixtures_dir, "th30.csv"))
        assert df["temperature_interne"].tolist() == [24.5, 25.0, 25.5, 26.0]
        assert df["temperature_externe"].tolist() == [30.1, 30.4, 30.9, 31.2]

    def test_horodatage_jour_mois_sans_zero(self, fixtures_dir):
        df, _ = parse_th30_csv(lire(fixtures_dir, "th30.csv"))
        assert pd.api.types.is_datetime64_any_dtype(df["timestamp"])
        assert df["timestamp"].iloc[0] == pd.Timestamp("2021-01-19 20:44:00")


# ─── SMART ENERGY METER ──────────────────────────────────────────────────────

class TestSmartEnergy:
    def test_metadonnees_et_totaux(self, fixtures_dir):
        _, meta = parse_smart_energy_csv(lire(fixtures_dir, "smart_energy.csv"))
        assert meta["device_name"] == "SEM-BUREAU"
        assert meta["tariff"] == 0.25
        assert meta["currency"] == "EUR"
        assert meta["data_count"] == 3
        assert meta["total_consumption_kwh"] == pytest.approx(3.0)
        assert meta["total_cost"] == pytest.approx(0.75)

    def test_puissance_en_watts(self, fixtures_dir):
        df, _ = parse_smart_energy_csv(lire(fixtures_dir, "smart_energy.csv"))
        assert df["power_watts"].tolist() == [500.0, 1000.0, 1500.0]
        assert df["timestamp"].iloc[2] == pd.Timestamp("2024-03-01 10:00")


# ─── RHT_10 ──────────────────────────────────────────────────────────────────

class TestRHT10:
    def test_metadonnees_et_alarmes(self, fixtures_dir):
        _, meta = parse_rht10_txt(lire(fixtures_dir, "rht10.xls"))
        assert meta["logging_name"] == "Salle serveur"
        assert meta["start_time"] == "09-26-2020 12:26:54"
        assert meta["end_time"] == "09-26-2020 12:46:54"
        assert meta["sample_points"] == 3
        assert meta["temp_low_alarm"] == 24.0
        assert meta["temp_high_alarm"] == 30.0
        assert meta["humidity_low_alarm"] == 35.0
        assert meta["humidity_high_alarm"] == 75.0

    def test_donnees(self, fixtures_dir):
        df, meta = parse_rht10_txt(lire(fixtures_dir, "rht10.xls"))
        assert df["temperature"].tolist() == [25.0, 26.0, 27.0]
        assert df["humidity"].tolist() == [60.0, 62.0, 64.0]
        assert df["timestamp"].iloc[1] == pd.Timestamp("2020-09-26 12:36:54")
        assert meta["temperature_range"]["avg"] == pytest.approx(26.0)

    def test_fichier_sans_donnees(self):
        df, meta = parse_rht10_txt(">>Logging Name:Vide\nNO.  DATE    TIME\n")
        assert df.empty
        assert meta["data_count"] == 0


# ─── SENTINEL (Excel) ────────────────────────────────────────────────────────

def ecrire_sentinel(chemin, lignes):
    pd.DataFrame(lignes).to_excel(chemin, index=False)
    return str(chemin)


class TestSentinel:
    def test_colonnes_normalisees_et_tri(self, tmp_path):
        chemin = ecrire_sentinel(tmp_path / "sentinel.xlsx", [
            {"date": "2024-03-01", "heure": "09:00:00", "p_active": 1200, "i": 5.2, "p_reactive": 300, "cosphi": 0.92},
            {"date": "2024-03-01", "heure": "08:00:00", "p_active": 1000, "i": 4.4, "p_reactive": 250, "cosphi": 0.95},
        ])
        df, meta = parse_sentinel_excel(chemin)
        assert list(df["power_watts"]) == [1000, 1200]  # trié par horodatage
        assert "current_total" in df.columns and "power_factor" in df.columns
        assert meta["total_measurements"] == 2
        assert meta["power_range"] == {"min": 1000.0, "max": 1200.0, "avg": 1100.0}

    def test_lignes_sans_puissance_ecartees(self, tmp_path):
        chemin = ecrire_sentinel(tmp_path / "sentinel.xlsx", [
            {"date": "2024-03-01", "heure": "08:00:00", "p_active": 1000},
            {"date": "2024-03-01", "heure": "08:10:00", "p_active": None},
        ])
        df, _ = parse_sentinel_excel(chemin)
        assert len(df) == 1

    def test_colonnes_requises_manquantes(self, tmp_path):
        chemin = ecrire_sentinel(tmp_path / "sentinel.xlsx", [{"date": "2024-03-01", "valeur": 1}])
        with pytest.raises(ValueError, match="Colonnes manquantes"):
            parse_sentinel_excel(chemin)
