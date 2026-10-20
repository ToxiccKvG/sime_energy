"""KPIs et données de graphique produits pour chaque type de capteur."""
import pandas as pd
import pytest

from app.core.utils import (
    calculate_kpis,
    parse_rht10_txt,
    parse_sentinel_excel,
    parse_smart_energy_csv,
    parse_th30_csv,
    parse_voltcraft_csv,
    prepare_chart_data,
)


def lire(fixtures_dir, nom: str) -> str:
    return (fixtures_dir / nom).read_text(encoding="utf-8")


# ─── calculate_kpis ──────────────────────────────────────────────────────────

class TestKpis:
    def test_voltcraft(self, fixtures_dir):
        df, meta = parse_voltcraft_csv(lire(fixtures_dir, "voltcraft.csv"))
        k = calculate_kpis(df, meta, "89_VOLTCRAFT")
        assert k.avgConsumption == pytest.approx(350.0)
        assert k.peakConsumption == pytest.approx(500.0)
        assert k.minConsumption == pytest.approx(200.0)
        assert k.totalConsumption == pytest.approx(1400.0)
        assert k.varConsumption == pytest.approx(16666.67, abs=0.01)  # variance d'échantillon
        assert k.measurementCount == 4
        assert k.duration == "0j 0h 3min"
        assert k.unit == "W"

    def test_th30_duree_depuis_metadonnees(self, fixtures_dir):
        df, meta = parse_th30_csv(lire(fixtures_dir, "th30.csv"))
        k = calculate_kpis(df, meta, "TH_30")
        assert k.avgConsumption == pytest.approx(25.25)
        assert k.duration == "0j 0h 3min"
        assert k.unit == "°C"

    def test_smart_energy_duree_depuis_horodatages(self, fixtures_dir):
        df, meta = parse_smart_energy_csv(lire(fixtures_dir, "smart_energy.csv"))
        k = calculate_kpis(df, meta, "SMART_ENERGY_METER")
        assert k.avgConsumption == pytest.approx(1000.0)
        assert k.peakConsumption == pytest.approx(1500.0)
        assert k.duration == "0j 2h 0min"

    def test_rht10(self, fixtures_dir):
        df, meta = parse_rht10_txt(lire(fixtures_dir, "rht10.xls"))
        k = calculate_kpis(df, meta, "RHT_10")
        assert k.avgConsumption == pytest.approx(26.0)
        assert k.duration == "0j 0h 20min"

    def test_valeurs_nulles_ignorees(self):
        df = pd.DataFrame({"Puissance (W)": [100.0, None, 300.0]})
        k = calculate_kpis(df, {}, "89_VOLTCRAFT")
        assert k.measurementCount == 2
        assert k.avgConsumption == pytest.approx(200.0)

    def test_colonne_absente(self):
        with pytest.raises(ValueError, match="non trouvée"):
            calculate_kpis(pd.DataFrame({"x": [1]}), {}, "89_VOLTCRAFT")


# ─── prepare_chart_data ──────────────────────────────────────────────────────

class TestGraphique:
    def test_voltcraft(self, fixtures_dir):
        df, _ = parse_voltcraft_csv(lire(fixtures_dir, "voltcraft.csv"))
        points = prepare_chart_data(df, "89_VOLTCRAFT")
        assert len(points) == 4
        assert points[0].timestamp == "01-03-2024 08:00:00"
        assert points[0].consumption == 300.0
        assert points[0].current == 1.5
        assert points[0].apparent_power == 330.0

    def test_voltcraft_valeurs_negatives_ecartees(self):
        df = pd.DataFrame({
            "Temps enreg.": ["t1", "t2"],
            "Puissance (W)": [-5.0, 120.0],
        })
        assert [p.consumption for p in prepare_chart_data(df, "89_VOLTCRAFT")] == [120.0]

    def test_th30(self, fixtures_dir):
        df, _ = parse_th30_csv(lire(fixtures_dir, "th30.csv"))
        points = prepare_chart_data(df, "TH_30")
        assert len(points) == 4
        assert points[0].timestamp == "2021-01-19 20:44:00"
        assert points[0].current == 30.1  # température externe

    def test_smart_energy(self, fixtures_dir):
        """Le capteur SMART_ENERGY_METER est proposé dans l'interface : il doit produire un graphique."""
        df, _ = parse_smart_energy_csv(lire(fixtures_dir, "smart_energy.csv"))
        points = prepare_chart_data(df, "SMART_ENERGY_METER")
        assert len(points) == 3
        assert [p.consumption for p in points] == [500.0, 1000.0, 1500.0]

    def test_rht10(self, fixtures_dir):
        df, _ = parse_rht10_txt(lire(fixtures_dir, "rht10.xls"))
        points = prepare_chart_data(df, "RHT_10")
        assert len(points) == 3
        assert points[2].current == 64.0  # humidité

    def test_sentinel(self, tmp_path):
        chemin = tmp_path / "s.xlsx"
        pd.DataFrame([
            {"date": "2024-03-01", "heure": "08:00:00", "p_active": 1000, "i": 4.4, "p_reactive": 250},
        ]).to_excel(chemin, index=False)
        df, _ = parse_sentinel_excel(str(chemin))
        points = prepare_chart_data(df, "SENTINEL")
        assert len(points) == 1
        assert points[0].timestamp == "2024-03-01 08:00:00"
        assert points[0].current == 4.4

    def test_sous_echantillonnage(self, fixtures_dir):
        df, _ = parse_voltcraft_csv(lire(fixtures_dir, "voltcraft.csv"))
        assert len(prepare_chart_data(df, "89_VOLTCRAFT", max_points=2)) == 2
