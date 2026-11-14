"""Lecture des fichiers de capteurs (app/core/sensors.py).

Tests de caractérisation : ils figent le comportement actuel du module Mesures,
pour que le nettoyage du code ne change aucun résultat d'import.
"""
import io

import pandas as pd
import pytest

from app.core import sensors
from app.core.sensors import preview_table, process_measurement_file, read_any_table


def classeur(feuilles: dict) -> bytes:
    """Classeur .xlsx en mémoire : {nom de feuille: liste de lignes (dict)}."""
    tampon = io.BytesIO()
    with pd.ExcelWriter(tampon, engine="openpyxl") as ecrivain:
        for nom, lignes in feuilles.items():
            pd.DataFrame(lignes).to_excel(ecrivain, sheet_name=nom, index=False)
    return tampon.getvalue()


def valeurs(payload: dict) -> list:
    return [m["consumption"] for m in payload["measurements"]]


# ---------------------------------------------------------------------------
# Utilitaires de conversion
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("brut,attendu", [
    ("1.234,56", 1234.56),
    ("0,00", 0.0),
    ("12,5", 12.5),
    ("3.5", 3.5),
    (" 1\xa0200,5 ", 1200.5),
    ('"7,25"', 7.25),
    ("", None),
    (None, None),
    ("abc", None),
])
def test_nombre_au_format_francais(brut, attendu):
    assert sensors._fr_number(brut) == attendu


@pytest.mark.parametrize("brut,attendu", [
    (None, None),
    (float("nan"), None),
    (float("inf"), None),
    ("x", None),
    ("2.5", 2.5),
    (0.1 + 0.2, 0.3),
    (0.025, 0.025),  # pas d'arrondi métier à 3 décimales (régression Woyofal)
    (0.0004567, 0.0004567),
])
def test_conversion_en_flottant(brut, attendu):
    assert sensors._to_float(brut) == attendu


@pytest.mark.parametrize("dates,attendu", [
    (["13/01/2026 00:00", "14/01/2026 00:00"], True),
    (["01/13/2026 00:00", "01/14/2026 00:00"], False),
    (["2026-01-02 00:00"], None),
    (["01/02/2026", "02/02/2026", "03/02/2026"], True),  # le jour change à chaque ligne
    (["02/01/2026", "02/02/2026", "02/03/2026"], False),
    (["01/01/2026", "01/01/2026"], None),
    (["pas une date"], None),
])
def test_deviner_jour_ou_mois_en_tete(dates, attendu):
    assert sensors._infer_dayfirst(pd.Series(dates)) is attendu


def test_dates_iso_reconnues():
    assert sensors._looks_iso(pd.Series(["2026-09-05T00:00:17+00:00"]))
    assert not sensors._looks_iso(pd.Series(["05/09/2026 00:00"]))


def test_horodatages_iso_a_fraction_variable_sans_perte():
    # Régression Shelly : pandas figeait le format de la 1re ligne, les autres devenaient NaT
    textes = pd.Series([
        "2026-09-05T00:00:17.123+00:00",
        "2026-09-05T00:01:17+00:00",
        "2026-09-05T00:02:17.5+00:00",
    ])
    dates = sensors._parse_timestamps(textes, None)
    assert dates.notna().all()
    assert [d.minute for d in dates] == [0, 1, 2]


def test_horodatages_francais_jour_en_tete():
    dates = sensors._parse_timestamps(pd.Series(["13/01/2026 08:00", "14/01/2026 08:00"]), None)
    assert [(d.day, d.month) for d in dates] == [(13, 1), (14, 1)]


def test_horodatages_avec_format_impose():
    dates = sensors._parse_timestamps(pd.Series(["2026|01|13"]), "%Y|%m|%d")
    assert dates.iloc[0] == pd.Timestamp("2026-01-13")


def test_colonne_supplementaire_numerique_malgre_quelques_vides():
    serie = sensors._numeric_or_text(pd.Series(["1,5", "2", "--", "n/a", "4"]))
    assert serie.tolist()[:2] == [1.5, 2.0]
    assert pd.isna(serie.iloc[2]) and pd.isna(serie.iloc[3])


def test_colonne_supplementaire_texte_conservee():
    serie = sensors._numeric_or_text(pd.Series(["marche", "arrêt", "-", "marche"]))
    assert serie.tolist() == ["marche", "arrêt", None, "marche"]


@pytest.mark.parametrize("brut,attendu", [(12.0, "12"), (12.5, "12.5"), ("", None), (None, None), (" A1 ", "A1")])
def test_cle_de_serie_en_texte_stable(brut, attendu):
    assert sensors._series_text(brut) == attendu


# ---------------------------------------------------------------------------
# Capteurs du registre
# ---------------------------------------------------------------------------

SHELLY = (
    "﻿﻿Phase A\n"
    "Temps, Wh\n"
    "02/01/2026 00:00, 1,5\n"
    "01/01/2026 00:00, 1,0\n"
    "Total\n"
    "Temps, Wh\n"
    "02/01/2026 00:00, 30,0\n"
    "01/01/2026 00:00, 20,0\n"
    "Retour Total\n"
    "Temps, Wh\n"
    "01/01/2026 00:00, 0,5\n"
)


def test_shelly_energie_totale_par_jour_triee():
    r = process_measurement_file(SHELLY.encode("utf-8"), "SHELLY")
    assert r["sensor_type"] == "SHELLY"
    assert (r["unit"], r["quantity_kind"]) == ("Wh", "energy")
    assert [m["timestamp"] for m in r["measurements"]] == ["2026-01-01 00:00:00", "2026-01-02 00:00:00"]
    assert valeurs(r) == [20.0, 30.0]
    assert r["measurements"][0]["Phase A (Wh)"] == 1.0
    assert r["measurements"][0]["Retour réseau (Wh)"] == 0.5
    assert r["measurements"][1]["Retour réseau (Wh)"] is None
    assert r["processing_info"] == {"original_rows": 2, "valid_measurements": 2,
                                    "sensor_label": "Compteur Shelly — Énergie journalière (Wh)"}


def test_shelly_monophase_section_consommation():
    texte = "Consommation\nTemps, Wh\n01/01/2026 00:00, 12,0\n"
    assert valeurs(process_measurement_file(texte.encode(), "SHELLY")) == [12.0]


def test_shelly_sans_total_refuse():
    with pytest.raises(ValueError, match="Section 'Total' introuvable"):
        process_measurement_file(b"Phase A\nTemps, Wh\n01/01/2026 00:00, 1,0\n", "SHELLY")


def test_solaredge_puissance_sans_valeurs_negatives():
    texte = (
        "Site;Dakar\n"
        "Periode;Puissance (kW)\n"
        "01/03/2026 10:00;1,25\n"
        "01/03/2026 10:15;-0,10\n"
        "01/03/2026 10:30;2,5\n"
    )
    r = process_measurement_file(texte.encode("utf-8"), "PV_SOLAREDGE")
    assert (r["unit"], r["quantity_kind"]) == ("kW", "power")
    assert valeurs(r) == [1.25, 2.5]  # keep_negative=False


def test_solaredge_texte_latin1_decode():
    texte = "Période;Puissance\n01/03/2026 10:00;1,0\n01/03/2026 10:15;2,0\n01/03/2026 10:30;3,0\n"
    r = process_measurement_file(texte.encode("latin-1"), "PV_SOLAREDGE")
    assert valeurs(r) == [1.0, 2.0, 3.0]


@pytest.mark.xfail(strict=True, reason=(
    "Bug connu, non corrigé (nettoyage sans changement de comportement) : sur un petit export "
    "UTF-8, chardet devine ISO-8859-1, « Période » devient « PÃ©riode » et l'en-tête n'est pas trouvé."
))
def test_solaredge_petit_fichier_utf8_avec_accent():
    texte = "Période;Puissance\n01/03/2026 10:00;1,0\n01/03/2026 10:15;2,0\n"
    assert valeurs(process_measurement_file(texte.encode("utf-8"), "PV_SOLAREDGE")) == [1.0, 2.0]


def test_ca8335_trend_puissance_et_courant_moyen():
    contenu = classeur({"Trend": [
        {"Start(Greenwich)": "2026-03-01 08:00:00,000", "PowerP_Total_avg": 1000, "PowerS_Total_avg": 1100,
         "Irms_A_avg": 3, "Irms_B_avg": 4, "Irms_C_avg": 5, "Frequency_avg": 50, "Inutile": 9},
        {"Start(Greenwich)": "2026-03-01 08:10:00,000", "PowerP_Total_avg": 1200, "PowerS_Total_avg": 1300,
         "Irms_A_avg": 6, "Irms_B_avg": 6, "Irms_C_avg": 6, "Frequency_avg": 49.9, "Inutile": 9},
    ]})
    r = process_measurement_file(contenu, "CA8335_TREND")
    assert (r["unit"], r["quantity_kind"]) == ("W", "power")
    assert valeurs(r) == [1000.0, 1200.0]
    premier = r["measurements"][0]
    assert premier["timestamp"] == "2026-03-01 08:00:00"
    assert premier["I moy. (A)"] == 4.0
    assert premier["P apparente (VA)"] == 1100.0
    assert premier["Fréquence (Hz)"] == 50.0
    assert "Inutile" not in premier


def test_ca8335_demand_choisit_la_feuille_demand():
    contenu = classeur({
        "Résumé": [{"x": 1}],
        "Demand": [{"Start(Greenwich)": "2026-03-01 08:00:00", "ActiveEnergy_Total_avg": 250,
                    "Vrms_AN_avg": 230}],
    })
    r = process_measurement_file(contenu, "CA8335_DEMAND")
    assert (r["unit"], r["quantity_kind"]) == ("Wh", "energy")
    assert valeurs(r) == [250.0]
    assert r["measurements"][0]["U A (V)"] == 230.0


def test_station_air_m100_retient_la_colonne_horaire_remplie():
    contenu = classeur({"Data": [
        {"Time": "03/01/2026 08:00:00", "Heure": None, "CO2(ppm)": 450, "Temperature(°C)": 25.5,
         "PM2.5(ug/m3)": 12},
        {"Time": "03/01/2026 09:00:00", "Heure": None, "CO2(ppm)": 600, "Temperature(°C)": 26.0,
         "PM2.5(ug/m3)": 15},
    ]})
    r = process_measurement_file(contenu, "AIR_STATION_M100")
    assert (r["unit"], r["quantity_kind"]) == ("ppm", "other")
    assert valeurs(r) == [450.0, 600.0]
    assert r["measurements"][0]["timestamp"] == "2026-03-01 08:00:00"  # format US mois/jour
    assert r["measurements"][1]["Température (°C)"] == 26.0
    assert r["measurements"][0]["PM2.5 (µg/m³)"] == 12.0


def test_huawei_bilan_journalier_nombres_francais():
    contenu = classeur({"Rapport": [
        {"Heure du jour": "2026/03/01", "Production (kWh)": "1.234,5", "Consommation (kWh)": "800,25",
         "Énergie injectée (kWh)": "10", "Taux d'auto-consommation (%)": "92,5"},
        {"Heure du jour": "2026/03/02", "Production (kWh)": "1.100,0", "Consommation (kWh)": "750",
         "Énergie injectée (kWh)": "0", "Taux d'auto-consommation (%)": "100"},
    ]})
    r = process_measurement_file(contenu, "PV_HUAWEI")
    assert valeurs(r) == [1234.5, 1100.0]
    assert r["measurements"][0]["Consommation (kWh)"] == 800.25
    assert r["measurements"][0]["Injecté réseau (kWh)"] == 10.0
    assert r["measurements"][0]["Auto-conso. (%)"] == 92.5


def test_capteur_inconnu_refuse():
    with pytest.raises(ValueError, match="non supporté"):
        process_measurement_file(b"x", "FLUKE_1730")


def test_fichier_qui_ne_correspond_pas_au_capteur():
    with pytest.raises(ValueError, match="ne correspond pas au capteur sélectionné"):
        process_measurement_file(b"ceci n'est pas un classeur", "CA8335_TREND")


def test_registre_complet():
    assert set(sensors.SENSOR_REGISTRY) == {
        "CA8335_TREND", "CA8335_DEMAND", "AIR_STATION_M100", "PV_SOLAREDGE", "PV_HUAWEI", "SHELLY",
    }
    for cle, config in sensors.SENSOR_REGISTRY.items():
        assert callable(config["parser"]), cle
        assert config["input"] in {"text", "bytes"}, cle
        assert config["quantity_kind"] in {"power", "energy", "other"}, cle


# ---------------------------------------------------------------------------
# Capteur personnalisé (parser générique)
# ---------------------------------------------------------------------------

def perso(**config) -> dict:
    return {"name": "Mon capteur", "unit": "W", "metric_label": "Puissance", **config}


def test_personnalise_sans_configuration_refuse():
    with pytest.raises(ValueError, match="requiert un custom_config"):
        process_measurement_file(b"a;b", "CUSTOM")


def test_personnalise_preambule_et_virgule_decimale(fixtures_dir):
    contenu = (fixtures_dir / "voltcraft.csv").read_bytes()
    r = process_measurement_file(contenu, "CUSTOM", perso(
        timestamp_col="Temps enreg.", value_col="Puissance (W)",
        extra_cols=[{"label": "Courant", "col": "Courant (A)"}],
    ))
    assert valeurs(r) == [300.0, 400.0, 500.0, 200.0]
    assert r["measurements"][0]["timestamp"] == "2024-03-01 08:00:00"
    assert r["measurements"][0]["Courant"] == 1.5
    assert r["unit"] == "W" and r["metric_label"] == "Puissance"
    assert r["processing_info"] == {"original_rows": 4, "valid_measurements": 4, "sensor_label": "Mon capteur"}


def test_personnalise_encodage_latin1(fixtures_dir):
    contenu = (fixtures_dir / "voltcraft_latin1.csv").read_bytes()
    r = process_measurement_file(contenu, "CUSTOM", perso(timestamp_col="Temps enreg.", value_col="Puissance (W)"))
    assert sum(valeurs(r)) == pytest.approx(1400.0)


def test_personnalise_date_et_heure_separees(fixtures_dir):
    contenu = (fixtures_dir / "smart_energy.csv").read_bytes()
    r = process_measurement_file(contenu, "CUSTOM", perso(
        timestamp_col="Datum / Date", time_col="Zeit / Time", value_col="kWh",
    ))
    assert valeurs(r) == [0.5, 1.0, 1.5]
    assert r["measurements"][2]["timestamp"] == "2024-03-01 10:00:00"


def test_personnalise_virgule_decimale_avec_separateur_virgule():
    texte = (
        "Temps, Wh\n"
        "01/05/2026 00:00, 165,700\n"
        "01/05/2026 01:00, 170,250\n"
        "01/05/2026 02:00, 12,5\n"
    )
    r = process_measurement_file(texte.encode(), "CUSTOM", perso(timestamp_col="Temps", value_col="Wh"))
    assert valeurs(r) == [165.7, 170.25, 12.5]


def test_personnalise_valeurs_negatives_filtrees_si_demande():
    texte = "date;p\n01/05/2026 00:00;5\n01/05/2026 01:00;-3\n01/05/2026 02:00;7\n"
    garde = process_measurement_file(texte.encode(), "CUSTOM", perso(timestamp_col="date", value_col="p"))
    filtre = process_measurement_file(texte.encode(), "CUSTOM",
                                      perso(timestamp_col="date", value_col="p", keep_negative=False))
    assert valeurs(garde) == [5.0, -3.0, 7.0]
    assert valeurs(filtre) == [5.0, 7.0]


@pytest.mark.parametrize("config,message", [
    ({"timestamp_col": "absente", "value_col": "p"}, "Colonne timestamp « absente »"),
    ({"timestamp_col": "date", "value_col": "absente"}, "Colonne valeur « absente »"),
    ({"timestamp_col": "date", "value_col": "p", "time_col": "absente"}, "Colonne heure « absente »"),
    ({"timestamp_col": "date", "value_col": "p", "series_col": "absente"}, "Colonne série « absente »"),
])
def test_personnalise_colonne_introuvable(config, message):
    with pytest.raises(ValueError, match=message):
        process_measurement_file(b"date;p\n01/05/2026 00:00;5\n01/05/2026 01:00;6\n", "CUSTOM", perso(**config))


def test_personnalise_aucune_valeur_exploitable():
    texte = "date;p\n01/05/2026 00:00;abc\n01/05/2026 01:00;\n"
    with pytest.raises(ValueError, match="Aucune mesure exploitable"):
        process_measurement_file(texte.encode(), "CUSTOM", perso(timestamp_col="date", value_col="p"))


FORMAT_LONG = (
    "ts;device_id;name;power\n"
    "2026-05-01 00:00;1;Clim;100\n"
    "2026-05-01 00:00;2;Frigo;50\n"
    "2026-05-01 01:00;1;Clim;110\n"
    "2026-05-01 01:00;2;Frigo;55\n"
    "2026-05-01 02:00;1;Clim bureau;120\n"
    "2026-05-01 02:00;2;Frigo;60\n"
)


def test_format_long_refuse_sans_colonne_de_serie():
    with pytest.raises(ValueError, match="plusieurs séries.*« device_id »"):
        process_measurement_file(FORMAT_LONG.encode(), "CUSTOM", perso(timestamp_col="ts", value_col="power"))


def test_format_long_une_serie_par_appareil():
    r = process_measurement_file(FORMAT_LONG.encode(), "CUSTOM", perso(
        timestamp_col="ts", value_col="power", series_col="device_id", series_label_col="name",
    ))
    assert r["sensor_type"] == "CUSTOM"
    assert r["processing_info"]["series_count"] == 2
    assert r["processing_info"]["rows_without_series"] == 0
    # Le nom retenu est le plus récent (appareil renommé en cours de campagne), tri alphabétique
    assert [s["series_label"] for s in r["series"]] == ["Clim bureau", "Frigo"]
    clim, frigo = r["series"]
    assert valeurs(clim) == [100.0, 110.0, 120.0]
    assert valeurs(frigo) == [50.0, 55.0, 60.0]
    assert clim["series_key"] == "1"
    assert clim["processing_info"]["duplicate_timestamps"] == 0


def test_candidats_de_colonne_de_serie_identifiant_en_tete():
    brut = pd.read_csv(io.StringIO(FORMAT_LONG), sep=";", dtype=str)
    horodatages = pd.to_datetime(brut["ts"])
    assert sensors.series_candidates(brut, horodatages, {"ts", "power"}) == ["device_id", "name"]


# ---------------------------------------------------------------------------
# Lecture de tableaux et aperçu
# ---------------------------------------------------------------------------

def test_lecture_texte_saute_le_preambule(fixtures_dir):
    df, preambule = read_any_table((fixtures_dir / "voltcraft.csv").read_bytes())
    assert list(df.columns) == ["Temps enreg.", "Courant (A)", "Puissance (W)", "Puissance apparente (W)"]
    assert len(df) == 4
    assert preambule[0].startswith("heure de début")


def test_lecture_ligne_sep_excel():
    df, _ = read_any_table(b"sep=;\ndate;p\n01/05/2026 00:00;5\n01/05/2026 01:00;6\n01/05/2026 02:00;7\n")
    assert list(df.columns) == ["date", "p"]
    assert len(df) == 3


def test_lecture_xlsx_saute_le_titre():
    tampon = io.BytesIO()
    pd.DataFrame([
        ["Sonomètre SL-01", None, None],
        [None, None, None],
        ["date", "heure", "dB"],
        ["2026-05-01", "08:00", 55],
        ["2026-05-01", "08:01", 57],
    ]).to_excel(tampon, index=False, header=False)
    df, preambule = read_any_table(tampon.getvalue())
    assert list(df.columns) == ["date", "heure", "dB"]
    assert len(df) == 2
    assert preambule == ["Sonomètre SL-01"]


def test_sections_empilees_une_colonne_par_section():
    texte = (
        "Phase A\nTemps, Wh\n01/01/2026 00:00, 1\n02/01/2026 00:00, 2\n"
        "Phase B\nTemps, Wh\n01/01/2026 00:00, 3\n02/01/2026 00:00, 4\n"
    )
    df, preambule = read_any_table(texte.encode())
    assert list(df.columns) == ["Temps", "Phase A (Wh)", "Phase B (Wh)"]
    assert df["Phase B (Wh)"].tolist() == ["3", "4"]
    assert preambule == []


def test_sections_empilees_premier_titre_deduit():
    # Le titre de la 1re section a été avalé : « Phase B » ensuite → « Phase A »
    texte = (
        "Temps, Wh\n01/01/2026 00:00, 1\n02/01/2026 00:00, 2\n"
        "Phase B\nTemps, Wh\n01/01/2026 00:00, 3\n02/01/2026 00:00, 4\n"
    )
    df, _ = read_any_table(texte.encode())
    assert list(df.columns) == ["Temps", "Phase A (Wh)", "Phase B (Wh)"]


def test_apercu_complet_sous_la_limite():
    apercu = preview_table(b"date;p\n01/05/2026 00:00;5\n01/05/2026 01:00;6\n01/05/2026 02:00;7\n")
    assert apercu["columns"] == ["date", "p"]
    assert apercu["row_count"] == 3
    assert apercu["rows"][0] == {"date": "01/05/2026 00:00", "p": "5"}


def test_apercu_echantillonne_et_garde_la_derniere_ligne():
    lignes = "\n".join(f"2026-05-01 00:{i // 60:02d}:{i % 60:02d};{i}" for i in range(100))
    apercu = preview_table(f"date;p\n{lignes}\n".encode(), max_rows=10)
    assert apercu["row_count"] == 100
    assert 10 <= len(apercu["rows"]) <= 11
    assert apercu["rows"][0]["p"] == "0"
    assert apercu["rows"][-1]["p"] == "99"
