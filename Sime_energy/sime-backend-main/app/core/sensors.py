"""
Module Mesures SIME — parsing & normalisation des fichiers capteurs.

Chaque source (analyseur réseau, station qualité d'air, monitoring PV, compteur
Shelly…) exporte un format différent. Ce module ramène tous ces formats à un
contrat unique consommé par le frontend (`/process-file/measures`) :

    {
        "measurements": [ {timestamp, consumption, current, power, apparent_power, …}, … ],
        "kpis":         {duration, avgConsumption, peakConsumption, …, unit},
        "sensor_type":  "<clé du registre>",
        "metric_label": "Puissance active",   # libellé de la grandeur tracée
        "unit":         "W",
        "processing_info": {original_rows, valid_measurements, metadata}
    }

Pour ajouter un capteur : écrire un `_parse_*` qui renvoie un DataFrame avec une
colonne `timestamp` (datetime) + les colonnes normalisées, puis l'enregistrer
dans `SENSOR_REGISTRY`.
"""

import io
import logging
from typing import Any, Callable, Dict, List, Optional

import chardet
import pandas as pd

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers génériques
# ---------------------------------------------------------------------------

def _norm(label: Any) -> str:
    """Normalise un nom de colonne : espaces insécables, casse, espaces."""
    return str(label).replace("\xa0", " ").strip().lower()


def _find_col(df: pd.DataFrame, *substrings: str) -> Optional[str]:
    """Renvoie la 1re colonne dont le nom normalisé contient tous les `substrings`."""
    wanted = [s.lower() for s in substrings]
    for col in df.columns:
        name = _norm(col)
        if all(s in name for s in wanted):
            return col
    return None


def _best_timestamp(df: pd.DataFrame, fmt: str, *keywords: str) -> pd.Series:
    """Choisit, parmi les colonnes candidates, celle qui donne le plus de dates valides.

    Certains exports dupliquent les colonnes temporelles (ex. 'Time' rempli +
    'Heure' vide) : on retient celle qui se parse réellement.
    """
    keys = [k.lower() for k in keywords]
    best: Optional[pd.Series] = None
    best_valid = -1
    for col in df.columns:
        if not any(k in _norm(col) for k in keys):
            continue
        parsed = pd.to_datetime(df[col].astype(str), format=fmt, errors="coerce")
        if parsed.isna().all():
            parsed = pd.to_datetime(df[col], errors="coerce")
        valid = int(parsed.notna().sum())
        if valid > best_valid:
            best_valid, best = valid, parsed
    if best is None:
        raise ValueError(f"Colonne temporelle introuvable (recherche : {', '.join(keywords)})")
    return best


def _to_float(value: Any) -> Optional[float]:
    """Convertit en float arrondi (3 décimales) ou None si invalide/manquant."""
    try:
        if value is None or pd.isna(value):
            return None
        return round(float(value), 3)
    except (ValueError, TypeError):
        return None


def _fr_number(raw: Any) -> Optional[float]:
    """Parse un nombre au format FR ('1.234,56' → 1234.56, '0,00' → 0.0)."""
    if raw is None:
        return None
    s = str(raw).strip().strip('"').replace("\xa0", "").replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:        # '.' = séparateur de milliers
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _pick_sheet(xls: pd.ExcelFile, *keywords: str) -> str:
    """Choisit la feuille dont le nom contient un des `keywords`, sinon la 1re."""
    for name in xls.sheet_names:
        low = name.lower()
        if any(k.lower() in low for k in keywords):
            return name
    return xls.sheet_names[0]


def _format_ts(ts: Any) -> str:
    if pd.isna(ts):
        return ""
    if hasattr(ts, "strftime"):
        return ts.strftime("%Y-%m-%d %H:%M:%S")
    return str(ts)


# ---------------------------------------------------------------------------
# Construction des sorties normalisées (mesures + KPIs)
# ---------------------------------------------------------------------------

def _build_measurements(
    df: pd.DataFrame,
    *,
    value_col: str,
    apparent_col: Optional[str] = None,
    current_col: Optional[str] = None,
    power_col: Optional[str] = None,
    extra_cols: Optional[Dict[str, str]] = None,
    keep_negative: bool = True,
    max_points: int = 1000,
) -> List[Dict[str, Any]]:
    """Transforme le DataFrame normalisé en liste de mesures pour le frontend."""
    extra_cols = extra_cols or {}
    work = df[df[value_col].notna() & df["timestamp"].notna()].copy()
    if not keep_negative:
        work = work[work[value_col] >= 0]
    work = work.sort_values("timestamp")

    # Sous-échantillonnage pour ne pas saturer le graphique / la table
    if len(work) > max_points:
        step = max(1, len(work) // max_points)
        work = work.iloc[::step]

    rows: List[Dict[str, Any]] = []
    for _, r in work.iterrows():
        row: Dict[str, Any] = {
            "timestamp": _format_ts(r["timestamp"]),
            "consumption": _to_float(r[value_col]),
            "current": _to_float(r[current_col]) if current_col and current_col in df.columns else None,
            "power": _to_float(r[power_col]) if power_col and power_col in df.columns else None,
            "apparent_power": _to_float(r[apparent_col]) if apparent_col and apparent_col in df.columns else None,
        }
        for label, col in extra_cols.items():
            if col in df.columns:
                row[label] = _to_float(r[col])
        rows.append(row)
    return rows


def _compute_kpis(df: pd.DataFrame, value_col: str, unit: str) -> Dict[str, Any]:
    """Calcule les indicateurs synthétiques sur la grandeur principale."""
    series = pd.to_numeric(df[value_col], errors="coerce").dropna()
    if series.empty:
        raise ValueError("Aucune valeur numérique exploitable dans le fichier")

    duration = "N/A"
    ts = pd.to_datetime(df["timestamp"], errors="coerce").dropna()
    if len(ts) > 1:
        delta = ts.max() - ts.min()
        duration = f"{delta.days}j {delta.seconds // 3600}h {(delta.seconds // 60) % 60}min"

    return {
        "duration": duration,
        "avgConsumption": round(float(series.mean()), 2),
        "peakConsumption": round(float(series.max()), 2),
        "minConsumption": round(float(series.min()), 2),
        "totalConsumption": round(float(series.sum()), 2),
        "varConsumption": round(float(series.var()), 2) if len(series) > 1 else 0.0,
        "unit": unit,
        "measurementCount": int(series.shape[0]),
    }


# ---------------------------------------------------------------------------
# Parsers — un par source
# ---------------------------------------------------------------------------

def _read_excel(contents: bytes, *sheet_keywords: str, usecols=None) -> pd.DataFrame:
    bio = io.BytesIO(contents)
    xls = pd.ExcelFile(bio, engine="openpyxl")
    sheet = _pick_sheet(xls, *sheet_keywords)
    return xls.parse(sheet, usecols=usecols)


def parse_ca8335_trend(contents: bytes) -> pd.DataFrame:
    """Chauvin Arnoux C.A 8335 — Trend 10 min (qualité réseau)."""
    keep = {
        "Start(Greenwich)", "PowerP_Total_avg", "PowerS_Total_avg",
        "PowerQfund_Total_avg", "Frequency_avg", "VoltageUnbalance_avg",
        "CurrentUnbalance_avg", "PfFwdRev_Total_avg",
        "Vrms_AN_avg", "Vrms_BN_avg", "Vrms_CN_avg",
        "Irms_A_avg", "Irms_B_avg", "Irms_C_avg",
    }
    df = _read_excel(contents, "trend", usecols=lambda c: c in keep)
    df["timestamp"] = pd.to_datetime(
        df["Start(Greenwich)"].astype(str).str.replace(",", ".", regex=False),
        errors="coerce",
    )
    df["power_active_w"] = pd.to_numeric(df["PowerP_Total_avg"], errors="coerce")
    rename = {
        "PowerS_Total_avg": "power_apparent_va",
        "PowerQfund_Total_avg": "power_reactive_var",
        "Frequency_avg": "frequency_hz",
        "VoltageUnbalance_avg": "voltage_unbalance_pct",
        "CurrentUnbalance_avg": "current_unbalance_pct",
        "PfFwdRev_Total_avg": "power_factor",
        "Vrms_AN_avg": "voltage_a_v", "Vrms_BN_avg": "voltage_b_v", "Vrms_CN_avg": "voltage_c_v",
        "Irms_A_avg": "current_a_a", "Irms_B_avg": "current_b_a", "Irms_C_avg": "current_c_a",
    }
    for src, dst in rename.items():
        if src in df.columns:
            df[dst] = pd.to_numeric(df[src], errors="coerce")
    if {"current_a_a", "current_b_a", "current_c_a"}.issubset(df.columns):
        df["current_avg_a"] = df[["current_a_a", "current_b_a", "current_c_a"]].mean(axis=1)
    return df


def parse_ca8335_demand(contents: bytes) -> pd.DataFrame:
    """Chauvin Arnoux C.A 8335 — Demand 5 min (énergies par phase)."""
    keep = {
        "Start(Greenwich)", "ActiveEnergy_Total_avg", "ApparentEnergy_Total_avg",
        "NonActiveEnergy_Total_avg", "Vrms_AN_avg", "Vrms_BN_avg", "Vrms_CN_avg",
        "Irms_A_avg", "Irms_B_avg", "Irms_C_avg",
    }
    df = _read_excel(contents, "demand", usecols=lambda c: c in keep)
    df["timestamp"] = pd.to_datetime(
        df["Start(Greenwich)"].astype(str).str.replace(",", ".", regex=False),
        errors="coerce",
    )
    df["active_energy_wh"] = pd.to_numeric(df["ActiveEnergy_Total_avg"], errors="coerce")
    rename = {
        "ApparentEnergy_Total_avg": "apparent_energy_vah",
        "NonActiveEnergy_Total_avg": "nonactive_energy_varh",
        "Vrms_AN_avg": "voltage_a_v", "Vrms_BN_avg": "voltage_b_v", "Vrms_CN_avg": "voltage_c_v",
        "Irms_A_avg": "current_a_a", "Irms_B_avg": "current_b_a", "Irms_C_avg": "current_c_a",
    }
    for src, dst in rename.items():
        if src in df.columns:
            df[dst] = pd.to_numeric(df[src], errors="coerce")
    if {"current_a_a", "current_b_a", "current_c_a"}.issubset(df.columns):
        df["current_avg_a"] = df[["current_a_a", "current_b_a", "current_c_a"]].mean(axis=1)
    return df


def parse_air_station_m100(contents: bytes) -> pd.DataFrame:
    """Station qualité d'air intérieur M100 (PM2.5, PM10, T°, HR, AQI, CO2)."""
    raw = _read_excel(contents, "data")
    df = pd.DataFrame()
    df["timestamp"] = _best_timestamp(raw, "%m/%d/%Y %H:%M:%S", "time", "heure")

    mapping = {
        "co2_ppm": ("co2",), "pm25_ugm3": ("pm2.5",), "pm10_ugm3": ("pm10",),
        "temperature_c": ("temperature",), "humidity_pct": ("humidity",), "aqi": ("aqi",),
    }
    for dst, keys in mapping.items():
        col = _find_col(raw, *keys)
        if col is not None:
            df[dst] = pd.to_numeric(raw[col], errors="coerce")
    return df


def parse_pv_solaredge(text: str) -> pd.DataFrame:
    """Export portail SolarEdge — puissance PV produite (kW), pas de 15 min."""
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        first = line.split(";", 1)[0].strip().strip('"').lower()
        if "période" in first or "periode" in first:
            start = i + 1
            break
    if start is None:
        raise ValueError("En-tête de données SolarEdge introuvable (ligne 'Période')")

    records = []
    for line in lines[start:]:
        if not line.strip():
            continue
        parts = line.split(";")
        if len(parts) < 2:
            continue
        ts = parts[0].strip().strip('"')
        val = _fr_number(parts[1])
        if ts and val is not None:
            records.append({"timestamp": ts, "power_kw": val})

    df = pd.DataFrame(records)
    if df.empty:
        raise ValueError("Aucune mesure exploitable dans l'export SolarEdge")
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="%d/%m/%Y %H:%M", errors="coerce")
    return df


def parse_pv_huawei(contents: bytes) -> pd.DataFrame:
    """Huawei FusionSolar — bilan énergétique journalier (centrale PV + batterie)."""
    raw = _read_excel(contents)
    date_col = _find_col(raw, "heure", "jour") or _find_col(raw, "heure") or _find_col(raw, "date")
    df = pd.DataFrame()
    df["timestamp"] = pd.to_datetime(raw[date_col].astype(str), format="%Y/%m/%d", errors="coerce")
    if df["timestamp"].isna().all():
        df["timestamp"] = pd.to_datetime(raw[date_col], errors="coerce")

    mapping = {
        "production_kwh": ("production",),
        "consumption_kwh": ("consommation",),
        "grid_injected_kwh": ("injectée",),
        "grid_purchased_kwh": ("achetée",),
        "battery_charged_kwh": ("chargée",),
        "battery_discharged_kwh": ("déchargée",),
        "self_consumption_pct": ("auto-consommation",),
    }
    for dst, keys in mapping.items():
        col = _find_col(raw, *keys)
        if col is not None:
            df[dst] = raw[col].map(_fr_number)
    return df


def parse_shelly(text: str) -> pd.DataFrame:
    """Compteur Shelly — énergie journalière (Wh) par phase + total + retour réseau."""
    section_map = {
        "phase a": "phase_a_wh", "phase b": "phase_b_wh", "phase c": "phase_c_wh",
        "total": "total_wh",
        "retour phase a": "return_a_wh", "retour phase b": "return_b_wh",
        "retour phase c": "return_c_wh", "retour total": "return_total_wh",
    }
    sections: Dict[str, Dict[str, float]] = {}
    current: Optional[str] = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        low = stripped.lower()
        if low in section_map:                 # ligne d'en-tête de section
            current = section_map[low]
            sections.setdefault(current, {})
            continue
        if low.startswith("temps"):            # ligne 'Temps, Wh'
            continue
        if current and "," in stripped:        # ligne de données 'date , valeur'
            ts_part, _, val_part = stripped.partition(",")
            val = _fr_number(val_part)
            if val is not None:
                sections[current][ts_part.strip()] = val

    if "total_wh" not in sections or not sections["total_wh"]:
        raise ValueError("Section 'Total' introuvable dans l'export Shelly")

    dates = sorted(
        sections["total_wh"].keys(),
        key=lambda d: pd.to_datetime(d, format="%d/%m/%Y %H:%M", errors="coerce"),
    )
    df = pd.DataFrame({"raw_ts": dates})
    df["timestamp"] = pd.to_datetime(df["raw_ts"], format="%d/%m/%Y %H:%M", errors="coerce")
    for col, values in sections.items():
        df[col] = df["raw_ts"].map(values)
    return df.drop(columns=["raw_ts"])


# ---------------------------------------------------------------------------
# Registre des capteurs
# ---------------------------------------------------------------------------

SENSOR_REGISTRY: Dict[str, Dict[str, Any]] = {
    "CA8335_TREND": {
        "label": "Analyseur réseau C.A 8335 — Qualité réseau (10 min)",
        "input": "bytes",
        "parser": parse_ca8335_trend,
        "value_col": "power_active_w",
        "apparent_col": "power_apparent_va",
        "current_col": "current_avg_a",
        "unit": "W",
        "metric_label": "Puissance active",
        "keep_negative": True,
        "extra_cols": {
            "P apparente (VA)": "power_apparent_va",
            "Q (var)": "power_reactive_var",
            "Cos φ": "power_factor",
            "Fréquence (Hz)": "frequency_hz",
            "Déséq. U (%)": "voltage_unbalance_pct",
            "U moy. A (V)": "voltage_a_v",
        },
    },
    "CA8335_DEMAND": {
        "label": "Analyseur réseau C.A 8335 — Demande énergétique (5 min)",
        "input": "bytes",
        "parser": parse_ca8335_demand,
        "value_col": "active_energy_wh",
        "apparent_col": "apparent_energy_vah",
        "current_col": "current_avg_a",
        "unit": "Wh",
        "metric_label": "Énergie active",
        "keep_negative": True,
        "extra_cols": {
            "E apparente (VAh)": "apparent_energy_vah",
            "E non-active (varh)": "nonactive_energy_varh",
            "I moy. (A)": "current_avg_a",
            "U A (V)": "voltage_a_v",
        },
    },
    "AIR_STATION_M100": {
        "label": "Station qualité d'air M100 (IAQ)",
        "input": "bytes",
        "parser": parse_air_station_m100,
        "value_col": "co2_ppm",
        "unit": "ppm",
        "metric_label": "CO₂",
        "keep_negative": True,
        "extra_cols": {
            "PM2.5 (µg/m³)": "pm25_ugm3",
            "PM10 (µg/m³)": "pm10_ugm3",
            "Température (°C)": "temperature_c",
            "Humidité (%)": "humidity_pct",
            "AQI": "aqi",
        },
    },
    "PV_SOLAREDGE": {
        "label": "Monitoring PV SolarEdge — Puissance produite (15 min)",
        "input": "text",
        "parser": parse_pv_solaredge,
        "value_col": "power_kw",
        "unit": "kW",
        "metric_label": "Puissance produite",
        "keep_negative": False,
        "extra_cols": {},
    },
    "PV_HUAWEI": {
        "label": "Centrale PV Huawei FusionSolar — Bilan journalier",
        "input": "bytes",
        "parser": parse_pv_huawei,
        "value_col": "production_kwh",
        "unit": "kWh",
        "metric_label": "Production",
        "keep_negative": True,
        "extra_cols": {
            "Consommation (kWh)": "consumption_kwh",
            "Injecté réseau (kWh)": "grid_injected_kwh",
            "Acheté réseau (kWh)": "grid_purchased_kwh",
            "Batterie chargée (kWh)": "battery_charged_kwh",
            "Batterie déchargée (kWh)": "battery_discharged_kwh",
            "Auto-conso. (%)": "self_consumption_pct",
        },
    },
    "SHELLY": {
        "label": "Compteur Shelly — Énergie journalière (Wh)",
        "input": "text",
        "parser": parse_shelly,
        "value_col": "total_wh",
        "unit": "Wh",
        "metric_label": "Énergie consommée",
        "keep_negative": True,
        "extra_cols": {
            "Phase A (Wh)": "phase_a_wh",
            "Phase B (Wh)": "phase_b_wh",
            "Phase C (Wh)": "phase_c_wh",
            "Retour réseau (Wh)": "return_total_wh",
        },
    },
}


# ---------------------------------------------------------------------------
# Point d'entrée unique
# ---------------------------------------------------------------------------

def process_measurement_file(contents: bytes, sensor_type: str) -> Dict[str, Any]:
    """Parse un fichier capteur et renvoie le payload normalisé pour le frontend."""
    config = SENSOR_REGISTRY.get(sensor_type)
    if config is None:
        raise ValueError(
            f"Type de capteur '{sensor_type}' non supporté. "
            f"Valeurs acceptées : {', '.join(SENSOR_REGISTRY)}"
        )

    # Décodage selon le type d'entrée attendu par le parser
    if config["input"] == "text":
        encoding = chardet.detect(contents)["encoding"] or "utf-8"
        try:
            payload: Any = contents.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            payload = contents.decode("utf-8", errors="replace")
    else:
        payload = contents

    try:
        df = config["parser"](payload)
    except ValueError:
        raise
    except Exception as exc:
        # Erreur de parsing (mauvaise feuille, colonne absente…) : presque toujours
        # un fichier qui ne correspond pas au type de capteur sélectionné.
        raise ValueError(
            f"Le fichier ne correspond pas au capteur sélectionné "
            f"« {config['label']} ». Vérifiez le type de capteur. (détail : {exc})"
        ) from exc

    value_col = config["value_col"]
    if df.empty or value_col not in df.columns:
        raise ValueError(
            f"Le fichier ne correspond pas au capteur sélectionné "
            f"« {config['label']} » : données attendues introuvables. "
            f"Vérifiez que le type de capteur correspond bien au fichier."
        )

    original_rows = len(df)
    measurements = _build_measurements(
        df,
        value_col=value_col,
        apparent_col=config.get("apparent_col"),
        current_col=config.get("current_col"),
        power_col=config.get("power_col"),
        extra_cols=config.get("extra_cols"),
        keep_negative=config.get("keep_negative", True),
    )
    if not measurements:
        raise ValueError("Aucune mesure exploitable après nettoyage des données")

    kpis = _compute_kpis(df, value_col, config["unit"])

    return {
        "measurements": measurements,
        "kpis": kpis,
        "sensor_type": sensor_type,
        "metric_label": config["metric_label"],
        "unit": config["unit"],
        "processing_info": {
            "original_rows": original_rows,
            "valid_measurements": len(measurements),
            "sensor_label": config["label"],
        },
    }
