import json
import re
from PIL import Image
import pandas as pd
from io import StringIO
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from datetime import datetime
import base64
import logging
import io

# Configuration du logger
logger = logging.getLogger(__name__)
class KPIs(BaseModel):
    duration: str
    avgConsumption: float
    peakConsumption: float
    totalConsumption: float
    minConsumption: float
    varConsumption: float
    unit: str
    measurementCount: int

class MeasurementData(BaseModel):
    timestamp: str
    consumption: float
    current: Optional[float] = None
    power: Optional[float] = None
    apparent_power: Optional[float] = None

def extract_and_parse_json(response: str):
    # Supprime les balises markdown
    json_text = re.search(r"```json\n(.*?)```", response, re.DOTALL)
    if json_text:
        json_str = json_text.group(1)
    else:
        json_str = response  # fallback si y'a pas de ```json``` balises

    return json.loads(json_str)

def pdf_to_base64_url(pdf_bytes: bytes) -> str:
    """
    Convert PDF bytes to base64 data URL.
    
    Args:
        pdf_bytes: PDF file bytes
        
    Returns:
        Base64 data URL string
    """
    pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
    return f"data:application/pdf;base64,{pdf_b64}"


def _pil_image_to_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _strip_coordinates_for_mistral(parsed: Dict[str, Any]) -> Dict[str, Any]:
    clean_forms = []
    for kv in parsed.get("forms", []):
        clean_forms.append({"Key": kv.get("Key"), "Value": kv.get("Value")})
    clean_tables: List[List[List[str]]] = []
    for table in parsed.get("tables", []):
        clean_rows: List[List[str]] = []
        # Handle new table structure with "rows" key
        table_rows = table.get("rows", table) if isinstance(table, dict) else table
        for row in table_rows:
            clean_rows.append([cell.get("text", "") for cell in row])
        clean_tables.append(clean_rows)
    return {"forms": clean_forms, "tables": clean_tables}


def parse_voltcraft_csv(content: str) -> tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Parse un fichier CSV Voltcraft avec métadonnées en en-tête
    """
    lines = content.strip().split('\n')
    
    # Extraire les métadonnées
    metadata = {}
    data_start_index = 0
    
    for i, line in enumerate(lines):
        if line.startswith('heure de début:'):
            metadata['start_time'] = line.split(':', 1)[1].strip().split(';')[0].strip()
        elif line.startswith('Heure de fin:'):
            metadata['end_time'] = line.split(':', 1)[1].strip().split(';')[0].strip()
        elif line.startswith('Nombre de données:'):
            # Nettoyer la valeur : enlever les ;;; et espaces
            raw_value = line.split(':', 1)[1].strip()
            clean_value = raw_value.split(';')[0].strip()  # Prendre seulement avant le premier ;
            metadata['data_count'] = int(clean_value)
        elif line.startswith('Temps enreg.'):
            # C'est le début des données
            data_start_index = i
            break
    
    # Extraire les données CSV
    csv_lines = lines[data_start_index:]
    csv_content = '\n'.join(csv_lines)
    
    # Lire avec pandas en spécifiant le séparateur
    df = pd.read_csv(StringIO(csv_content), sep=';')
    
    # Nettoyer les noms de colonnes
    df.columns = df.columns.str.strip()
    
    # Remplacer les virgules par des points pour les nombres décimaux
    numeric_columns = ['Courant (A)', 'Puissance (W)', 'Puissance apparente (W)']
    for col in numeric_columns:
        if col in df.columns:
            df[col] = df[col].astype(str).str.replace(',', '.').astype(float)
    
    return df, metadata

def parse_th30_csv(content: str) -> tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Parse un fichier CSV TH_30 avec métadonnées en en-tête
    """
    lines = content.strip().split('\n')
    
    # Extraire les métadonnées
    metadata = {}
    data_start_index = 0
    
    for i, line in enumerate(lines):
        # Extraire les informations de l'appareil
        if 'Company Name' in line:
            parts = line.split('\t')
            if len(parts) >= 4:
                metadata['company'] = parts[1].strip()
                metadata['serial_number'] = parts[3].strip()
        elif 'Date de fabricat.' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['manufacture_date'] = parts[1].strip()
        elif 'Lot de fabrication' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['batch_number'] = parts[1].strip()
        elif 'Version firmware' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['firmware_version'] = parts[1].strip()
        elif 'fuseau hor. orig.' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['timezone'] = parts[1].strip()
        elif 'Fichier créé' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['file_created'] = parts[1].strip()
        elif 'Début' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['start_time'] = parts[1].strip()
        elif 'Fin' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['end_time'] = parts[1].strip()
        elif 'Durée' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['duration'] = parts[1].strip()
        elif 'Intervalle mesure' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                metadata['measurement_interval'] = parts[1].strip()
        elif 'Mesures' in line and 'points' in line:
            parts = line.split('\t')
            if len(parts) >= 2:
                # Extraire le nombre de points de mesure
                measure_text = parts[1].strip()
                try:
                    metadata['data_count'] = int(measure_text.split()[0])
                except (ValueError, IndexError):
                    metadata['data_count'] = 0
        elif line.strip().startswith('Index') and 'Date' in line and 'Heure' in line:
            # C'est le début des données
            data_start_index = i
            break
    
    # Extraire les données CSV
    csv_lines = lines[data_start_index:]
    csv_content = '\n'.join(csv_lines)
    
    # Lire avec pandas en spécifiant le séparateur (tabulation)
    df = pd.read_csv(StringIO(csv_content), sep='\t')
    
    # Nettoyer les noms de colonnes
    df.columns = df.columns.str.strip()
    
    # Renommer les colonnes pour la cohérence
    column_mapping = {
        'Index': 'index',
        'Date': 'date',
        'Heure': 'time',
        '°C': 'temperature_interne',
        '°C.1': 'temperature_externe'
    }
    
    # Appliquer le mapping des colonnes
    df = df.rename(columns=column_mapping)
    
    # Supprimer les colonnes vides (Unnamed)
    df = df.drop(columns=[col for col in df.columns if col.startswith('Unnamed')])
    
    # Nettoyer les données de température (enlever le °C et convertir en float)
    temp_columns = ['temperature_interne', 'temperature_externe']
    for col in temp_columns:
        if col in df.columns:
            # Enlever le °C et convertir en float
            df[col] = df[col].astype(str).str.replace('°C', '').str.strip()
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Créer une colonne timestamp combinée
    if 'date' in df.columns and 'time' in df.columns:
        df['timestamp'] = df['date'].astype(str) + ' ' + df['time'].astype(str)
        # Convertir en datetime - gérer le format "19/1/2021" (sans zéro devant le jour)
        try:
            df['timestamp'] = pd.to_datetime(df['timestamp'], format='%d/%m/%Y %H:%M:%S')
        except:
            # Essayer un autre format si le premier échoue
            try:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            except:
                pass
    
    # Mettre à jour le data_count avec le nombre réel de lignes
    metadata['data_count'] = len(df)
    
    return df, metadata

def parse_smart_energy_csv(content: str) -> tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Parse un fichier CSV Smart Energy Meter avec métadonnées en en-tête
    """
    lines = content.strip().split('\n')
    
    # Extraire les métadonnées
    metadata = {}
    data_start_index = 0
    
    for i, line in enumerate(lines):
        # Extraire les informations de l'appareil
        if 'Geraetename / Device name' in line:
            parts = line.split(',')
            if len(parts) >= 2:
                metadata['device_name'] = parts[1].strip()
        elif 'Strompreis / Tariff' in line:
            parts = line.split(',')
            if len(parts) >= 2:
                try:
                    metadata['tariff'] = float(parts[1].strip())
                except (ValueError, IndexError):
                    metadata['tariff'] = 0.0
        elif 'Waehrung / Currency' in line:
            parts = line.split(',')
            if len(parts) >= 2:
                metadata['currency'] = parts[1].strip()
        elif line.strip().startswith('Datum / Date') and 'Zeit / Time' in line and 'kWh' in line:
            # C'est le début des données
            data_start_index = i
            break
    
    # Extraire les données CSV
    csv_lines = lines[data_start_index:]
    csv_content = '\n'.join(csv_lines)
    
    # Lire avec pandas en spécifiant explicitement les colonnes
    df = pd.read_csv(StringIO(csv_content), sep=',', skipinitialspace=True, 
                     names=['date', 'time', 'consumption_kwh', 'tariff', 'cost'],
                     skiprows=1)  # Sauter la ligne d'en-tête
    # Les colonnes sont déjà correctement nommées
    
    # Nettoyer les données numériques
    numeric_columns = ['consumption_kwh', 'tariff', 'cost']
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Créer une colonne timestamp combinée
    if 'date' in df.columns and 'time' in df.columns:
        df['timestamp'] = df['date'].astype(str) + ' ' + df['time'].astype(str)
        # Convertir en datetime
        try:
            df['timestamp'] = pd.to_datetime(df['timestamp'], format='%Y-%m-%d %H:%M')
        except:
            # Essayer un autre format si le premier échoue
            try:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            except:
                pass
    
    # Calculer la puissance en watts (kWh * 1000)
    if 'consumption_kwh' in df.columns:
        df['power_watts'] = df['consumption_kwh'] * 1000
    
    # Mettre à jour les métadonnées
    metadata['data_count'] = len(df)
    metadata['total_consumption_kwh'] = df['consumption_kwh'].sum() if 'consumption_kwh' in df.columns else 0
    metadata['total_cost'] = df['cost'].sum() if 'cost' in df.columns else 0
    
    return df, metadata

def calculate_kpis(df: pd.DataFrame, metadata: Dict[str, Any], sensor_type: str) -> KPIs:
    """
    Calcule les KPIs à partir des données de mesure
    """
    # Selon le type de capteur, utiliser la colonne appropriée pour la consommation
    consumption_col = None
    if sensor_type == "89_VOLTCRAFT":
        consumption_col = 'Puissance (W)'
    elif sensor_type == "TH_30":
        consumption_col = 'temperature_interne'  # Utiliser la température interne comme métrique principale
    elif sensor_type == "SMART_ENERGY_METER":
        consumption_col = 'power_watts'  # Utiliser la puissance en watts
    elif sensor_type == "SENTINEL":
        consumption_col = 'power_watts'  # Utiliser la puissance active en watts
    elif sensor_type == "RHT_10":
        consumption_col = 'temperature'  # Utiliser la température comme métrique principale
    
    if consumption_col not in df.columns:
        raise ValueError(f"Colonne de consommation '{consumption_col}' non trouvée")
    
    # Nettoyer les données (supprimer les valeurs nulles)
    clean_data = df[df[consumption_col].notna()][consumption_col]
    
    # Calculer les KPIs
    avg_consumption = clean_data.mean()
    peak_consumption = clean_data.max()
    min_consumption = clean_data.min()
    var_consumption = clean_data.var()
    total_consumption = clean_data.sum()
    
    # Calculer la durée
    duration = "N/A"
    if sensor_type == "89_VOLTCRAFT":
        if 'start_time' in metadata and 'end_time' in metadata:
            try:
                start = datetime.strptime(metadata['start_time'], '%d-%m-%Y %H:%M:%S')
                end = datetime.strptime(metadata['end_time'], '%d-%m-%Y %H:%M:%S')
                duration_delta = end - start
                duration = f"{duration_delta.days}j {duration_delta.seconds//3600}h {(duration_delta.seconds//60)%60}min"
            except:
                duration = "N/A"
    elif sensor_type == "TH_30":
        if 'duration' in metadata:
            duration = metadata['duration']
        elif 'start_time' in metadata and 'end_time' in metadata:
            try:
                # Format TH_30: "20:44,19 Jan. 2021"
                start = datetime.strptime(metadata['start_time'], '%H:%M,%d %b. %Y')
                end = datetime.strptime(metadata['end_time'], '%H:%M,%d %b. %Y')
                duration_delta = end - start
                duration = f"{duration_delta.days}j {duration_delta.seconds//3600}h {(duration_delta.seconds//60)%60}min"
            except:
                duration = "N/A"
    elif sensor_type == "SMART_ENERGY_METER":
        # Pour Smart Energy Meter, calculer la durée à partir des timestamps
        if 'timestamp' in df.columns:
            try:
                timestamps = pd.to_datetime(df['timestamp']).dropna()
                if len(timestamps) > 1:
                    start_time = timestamps.min()
                    end_time = timestamps.max()
                    duration_delta = end_time - start_time
                    duration = f"{duration_delta.days}j {duration_delta.seconds//3600}h {(duration_delta.seconds//60)%60}min"
            except:
                duration = "N/A"
    elif sensor_type == "SENTINEL":
        # Pour Sentinel, calculer la durée à partir des timestamps
        if 'timestamp' in df.columns:
            try:
                timestamps = pd.to_datetime(df['timestamp']).dropna()
                if len(timestamps) > 1:
                    start_time = timestamps.min()
                    end_time = timestamps.max()
                    duration_delta = end_time - start_time
                    duration = f"{duration_delta.days}j {duration_delta.seconds//3600}h {(duration_delta.seconds//60)%60}min"
            except:
                duration = "N/A"
    elif sensor_type == "RHT_10":
        # Pour RHT_10, calculer la durée à partir des métadonnées ou des timestamps
        if 'start_time' in metadata and 'end_time' in metadata:
            try:
                # Format RHT_10: "09-26-2020 12:26:54"
                start = datetime.strptime(metadata['start_time'], '%m-%d-%Y %H:%M:%S')
                end = datetime.strptime(metadata['end_time'], '%m-%d-%Y %H:%M:%S')
                duration_delta = end - start
                duration = f"{duration_delta.days}j {duration_delta.seconds//3600}h {(duration_delta.seconds//60)%60}min"
            except:
                duration = "N/A"
        elif 'timestamp' in df.columns:
            try:
                timestamps = pd.to_datetime(df['timestamp']).dropna()
                if len(timestamps) > 1:
                    start_time = timestamps.min()
                    end_time = timestamps.max()
                    duration_delta = end_time - start_time
                    duration = f"{duration_delta.days}j {duration_delta.seconds//3600}h {(duration_delta.seconds//60)%60}min"
            except:
                duration = "N/A"
    
    # Adapter les unités selon le type de capteur
    if sensor_type == "89_VOLTCRAFT":
        unit = "W"
        total_unit = "Wh"
    elif sensor_type == "TH_30":
        unit = "°C"
        total_unit = "°C"  # Pour les températures, on peut utiliser la somme comme indicateur
    elif sensor_type == "SMART_ENERGY_METER":
        unit = "W"
        total_unit = "kWh"  # Pour Smart Energy Meter, utiliser kWh pour le total
    elif sensor_type == "SENTINEL":
        unit = "W"
        total_unit = "Wh"  # Pour Sentinel, utiliser Wh pour le total
    elif sensor_type == "RHT_10":
        unit = "°C"
        total_unit = "°C"  # Pour RHT_10, utiliser °C pour la température
    
    return KPIs(
        duration=duration,
        avgConsumption=f"{avg_consumption:.2f}",
        peakConsumption=f"{peak_consumption:.2f}",
        totalConsumption=f"{total_consumption:.2f}",
        minConsumption=f"{min_consumption:.2f}",
        varConsumption=f"{var_consumption:.2f}",
        unit= f"{unit}",
        measurementCount=len(clean_data)
    )

def prepare_chart_data(df: pd.DataFrame, sensor_type: str, max_points: int = 1000) -> List[MeasurementData]:
    """
    Prépare les données pour l'affichage graphique
    """
    consumption_col = None
    timestamp_col = None
    
    if sensor_type == "89_VOLTCRAFT":
        consumption_col = 'Puissance (W)'
        timestamp_col = 'Temps enreg.'
    elif sensor_type == "TH_30":
        consumption_col = 'temperature_interne'
        timestamp_col = 'timestamp'
    elif sensor_type == "SMART_ENERGY_METER":
        consumption_col = 'power_watts'
        timestamp_col = 'timestamp'
    elif sensor_type == "SENTINEL":
        consumption_col = 'power_watts'
        timestamp_col = 'timestamp'
    elif sensor_type == "RHT_10":
        consumption_col = 'temperature'
        timestamp_col = 'timestamp'
    
    if consumption_col not in df.columns:
        raise ValueError(f"Colonne de consommation '{consumption_col}' non trouvée")
    
    if timestamp_col not in df.columns:
        raise ValueError(f"Colonne de timestamp '{timestamp_col}' non trouvée")
    
    # Filtrer les données valides
    if sensor_type == "89_VOLTCRAFT":
        valid_data = df[(df[consumption_col] >= 0) & df[timestamp_col].notna()].copy()
    elif sensor_type == "TH_30":
        valid_data = df[df[consumption_col].notna() & df[timestamp_col].notna()].copy()
    elif sensor_type == "SENTINEL":
        valid_data = df[(df[consumption_col] >= 0) & df[timestamp_col].notna()].copy()
    elif sensor_type == "RHT_10":
        valid_data = df[df[consumption_col].notna() & df[timestamp_col].notna()].copy()
    
    # Si trop de points, sous-échantillonner
    if len(valid_data) > max_points:
        step = len(valid_data) // max_points
        valid_data = valid_data.iloc[::step]
    
    # Préparer les données pour le graphique
    chart_data = []
    for _, row in valid_data.iterrows():
        try:
            # Formater la timestamp pour l'affichage
            if sensor_type == "89_VOLTCRAFT":
                timestamp_str = str(row[timestamp_col])
            elif sensor_type == "TH_30":
                # Pour TH_30, utiliser le timestamp datetime ou la combinaison date+heure
                if pd.notna(row[timestamp_col]) and hasattr(row[timestamp_col], 'strftime'):
                    timestamp_str = row[timestamp_col].strftime('%Y-%m-%d %H:%M:%S')
                else:
                    timestamp_str = f"{row.get('date', '')} {row.get('time', '')}"
            elif sensor_type == "SENTINEL":
                # Pour Sentinel, utiliser le timestamp datetime
                if pd.notna(row[timestamp_col]) and hasattr(row[timestamp_col], 'strftime'):
                    timestamp_str = row[timestamp_col].strftime('%Y-%m-%d %H:%M:%S')
                else:
                    timestamp_str = str(row[timestamp_col])
            elif sensor_type == "RHT_10":
                # Pour RHT_10, utiliser le timestamp datetime
                if pd.notna(row[timestamp_col]) and hasattr(row[timestamp_col], 'strftime'):
                    timestamp_str = row[timestamp_col].strftime('%Y-%m-%d %H:%M:%S')
                else:
                    timestamp_str = str(row[timestamp_col])
            
            # Créer l'objet MeasurementData selon le type de capteur
            if sensor_type == "89_VOLTCRAFT":
                measurement = MeasurementData(
                    timestamp=timestamp_str,
                    consumption=float(row[consumption_col]),
                    current=float(row.get('Courant (A)', 0)) if 'Courant (A)' in df.columns else None,
                    power=float(row.get('Puissance (W)', 0)) if 'Puissance (W)' in df.columns else None,
                    apparent_power=float(row.get('Puissance apparente (W)', 0)) if 'Puissance apparente (W)' in df.columns else None
                )
            elif sensor_type == "TH_30":
                measurement = MeasurementData(
                    timestamp=timestamp_str,
                    consumption=float(row[consumption_col]),  # Température interne
                    current=float(row.get('temperature_externe', 0)) if 'temperature_externe' in df.columns else None,
                    power=None,  # Pas applicable pour les capteurs de température
                    apparent_power=None  # Pas applicable pour les capteurs de température
                )
            elif sensor_type == "SMART_ENERGY_METER":
                measurement = MeasurementData(
                    timestamp=timestamp_str,
                    consumption=float(row[consumption_col]),  # Puissance en watts
                    current=float(row.get('consumption_kwh', 0)) if 'consumption_kwh' in df.columns else None,  # Consommation kWh
                    power=float(row.get('power_watts', 0)) if 'power_watts' in df.columns else None,  # Puissance en watts
                    apparent_power=float(row.get('cost', 0)) if 'cost' in df.columns else None  # Coût comme métrique secondaire
                )
            elif sensor_type == "SENTINEL":
                measurement = MeasurementData(
                    timestamp=timestamp_str,
                    consumption=float(row[consumption_col]),  # Puissance active en watts
                    current=float(row.get('current_total', 0)) if 'current_total' in df.columns else None,  # Courant total
                    power=float(row.get('power_watts', 0)) if 'power_watts' in df.columns else None,  # Puissance active
                    apparent_power=float(row.get('power_reactive', 0)) if 'power_reactive' in df.columns else None  # Puissance réactive
                )
            elif sensor_type == "RHT_10":
                measurement = MeasurementData(
                    timestamp=timestamp_str,
                    consumption=float(row[consumption_col]),  # Température
                    current=float(row.get('humidity', 0)) if 'humidity' in df.columns else None,  # Humidité relative
                    power=float(row.get('gpp', 0)) if 'gpp' in df.columns else None,  # GPP
                    apparent_power=float(row.get('dew_point', 0)) if 'dew_point' in df.columns else None  # Point de rosée
                )
            
            chart_data.append(measurement)
        except (ValueError, TypeError) as e:
            continue
    
    return chart_data    


def parse_rht10_txt(content: str) -> tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Parse un fichier RHT_10 (fichier texte avec extension .xls) avec métadonnées en en-tête
    """
    lines = content.strip().split('\n')
    
    # Extraire les métadonnées
    metadata = {}
    data_start_index = 0
    
    for i, line in enumerate(lines):
        if line.startswith('>>Logging Name:'):
            metadata['logging_name'] = line.split(':', 1)[1].strip()
        elif line.startswith('>>FROM:'):
            # Extraire les dates de début et fin
            date_part = line.split(':', 1)[1].strip()
            if 'TO:' in date_part:
                from_part, to_part = date_part.split('TO:')
                metadata['start_time'] = from_part.strip()
                metadata['end_time'] = to_part.strip()
        elif line.startswith('>>Sample Points:'):
            metadata['sample_points'] = int(line.split(':', 1)[1].strip())
        elif line.startswith('>>Sample Rate:'):
            metadata['sample_rate'] = line.split(':', 1)[1].strip()
        elif line.startswith('>>Temperature Unit:'):
            metadata['temperature_unit'] = line.split(':', 1)[1].strip()
        elif line.startswith('>>Temperature(LowAlarm:'):
            # Extraire les alarmes de température et d'humidité
            # Format: >>Temperature(LowAlarm:24.0-HighAlarm:30.0)   Relative Humidity(LowAlarm:35.0-HighAlarm:75.0)
            try:
                # Extraire la partie température
                temp_part = line.split('>>Temperature(')[1].split(')')[0]
                temp_low = temp_part.split('LowAlarm:')[1].split('-')[0]
                temp_high = temp_part.split('HighAlarm:')[1]
                metadata['temp_low_alarm'] = float(temp_low)
                metadata['temp_high_alarm'] = float(temp_high)
                
                # Extraire la partie humidité
                humidity_part = line.split('Relative Humidity(')[1].split(')')[0]
                hum_low = humidity_part.split('LowAlarm:')[1].split('-')[0]
                hum_high = humidity_part.split('HighAlarm:')[1]
                metadata['humidity_low_alarm'] = float(hum_low)
                metadata['humidity_high_alarm'] = float(hum_high)
            except (IndexError, ValueError):
                # Si le parsing échoue, ignorer les alarmes
                pass
        elif line.startswith('NO.  DATE    TIME'):
            # C'est le début des données
            data_start_index = i + 1  # Commencer après la ligne d'en-tête
            break
    
    # Extraire les données
    data_lines = []
    for line in lines[data_start_index:]:
        line = line.strip()
        if line and not line.startswith('-'):  # Ignorer les lignes vides et les séparateurs
            # Parser la ligne de données
            # Format: NO.  DATE    TIME    TEMPERATURE     RELATIVE-HUMIDITY       DEW-POINT      GPP
            parts = line.split()
            if len(parts) >= 7:
                try:
                    no = int(parts[0])
                    date = parts[1]
                    time = parts[2]
                    temperature = float(parts[3])
                    humidity = float(parts[4])
                    dew_point = float(parts[5])
                    gpp = float(parts[6])
                    
                    # Créer un timestamp combiné
                    timestamp = f"{date} {time}"
                    
                    data_lines.append({
                        'no': no,
                        'date': date,
                        'time': time,
                        'timestamp': timestamp,
                        'temperature': temperature,
                        'humidity': humidity,
                        'dew_point': dew_point,
                        'gpp': gpp
                    })
                except (ValueError, IndexError):
                    # Ignorer les lignes qui ne peuvent pas être parsées
                    continue
    
    # Créer le DataFrame
    df = pd.DataFrame(data_lines)
    
    if not df.empty:
        # Convertir le timestamp en datetime
        try:
            df['timestamp'] = pd.to_datetime(df['timestamp'], format='%m-%d-%Y %H:%M:%S')
        except:
            try:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
            except:
                pass
        
        # Ajouter une colonne de consommation (utiliser la température comme proxy)
        df['consumption'] = df['temperature']
        
        # Ajouter des colonnes optionnelles pour la compatibilité
        df['current'] = None
        df['power'] = df['gpp']  # Utiliser GPP comme puissance
        df['apparent_power'] = None
    
    # Mettre à jour les métadonnées
    metadata['data_count'] = len(df)
    if not df.empty:
        metadata['temperature_range'] = {
            'min': df['temperature'].min(),
            'max': df['temperature'].max(),
            'avg': df['temperature'].mean()
        }
        metadata['humidity_range'] = {
            'min': df['humidity'].min(),
            'max': df['humidity'].max(),
            'avg': df['humidity'].mean()
        }
    
    return df, metadata

def parse_sentinel_excel(file_path: str) -> tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Parser un fichier Excel Sentinel pour extraire les données de mesure.
    
    Args:
        file_path: Chemin vers le fichier Excel Sentinel
        
    Returns:
        Tuple contenant:
        - DataFrame avec les données normalisées
        - Dictionnaire avec les métadonnées
    """
    try:
        logger.info(f"Parsing du fichier Sentinel: {file_path}")
        
        # Lire le fichier Excel
        df = pd.read_excel(file_path)
        
        # Vérifier les colonnes requises
        required_cols = ['date', 'heure', 'p_active']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Colonnes manquantes dans le fichier Sentinel: {missing_cols}")
        
        # Créer une copie pour éviter les modifications sur l'original
        df_processed = df.copy()
        
        # Combiner date et heure pour créer un timestamp
        df_processed['timestamp'] = pd.to_datetime(
            df_processed['date'].astype(str) + ' ' + df_processed['heure'].astype(str)
        )
        
        # Mapper les colonnes Sentinel vers des noms standardisés
        column_mapping = {
            'date': 'date',
            'heure': 'time', 
            'p_active': 'power_watts',
            'e_active': 'energy_active',
            'p_reactive': 'power_reactive',
            'e_reactive': 'energy_reactive',
            'i_1': 'current_1',
            'i_2': 'current_2', 
            'i_3': 'current_3',
            'i': 'current_total',
            'u_1': 'voltage_1',
            'u_2': 'voltage_2',
            'u_3': 'voltage_3',
            'p_1': 'power_1',
            'p_2': 'power_2',
            'p_3': 'power_3',
            'cosphi': 'power_factor'
        }
        
        # Renommer les colonnes selon le mapping
        df_processed = df_processed.rename(columns=column_mapping)
        
        # Convertir les colonnes numériques
        numeric_cols = [
            'power_watts', 'energy_active', 'power_reactive', 'energy_reactive',
            'current_1', 'current_2', 'current_3', 'current_total',
            'voltage_1', 'voltage_2', 'voltage_3',
            'power_1', 'power_2', 'power_3', 'power_factor'
        ]
        
        for col in numeric_cols:
            if col in df_processed.columns:
                df_processed[col] = pd.to_numeric(df_processed[col], errors='coerce')
        
        # Nettoyer les données (supprimer les lignes avec des valeurs manquantes critiques)
        df_processed = df_processed.dropna(subset=['timestamp', 'power_watts'])
        
        # Trier par timestamp
        df_processed = df_processed.sort_values('timestamp')
        
        # Calculer les métadonnées
        metadata = {
            'sensor_type': 'SENTINEL',
            'file_path': file_path,
            'total_measurements': len(df_processed),
            'date_range': {
                'start': df_processed['timestamp'].min().isoformat() if len(df_processed) > 0 else None,
                'end': df_processed['timestamp'].max().isoformat() if len(df_processed) > 0 else None
            },
            'columns_available': list(df_processed.columns),
            'power_range': {
                'min': float(df_processed['power_watts'].min()) if len(df_processed) > 0 else 0,
                'max': float(df_processed['power_watts'].max()) if len(df_processed) > 0 else 0,
                'avg': float(df_processed['power_watts'].mean()) if len(df_processed) > 0 else 0
            }
        }
        
        logger.info(f"Parsing Sentinel réussi: {len(df_processed)} mesures, période {metadata['date_range']['start']} à {metadata['date_range']['end']}")
        
        return df_processed, metadata
        
    except Exception as e:
        logger.error(f"Erreur lors du parsing Sentinel: {str(e)}")
        raise ValueError(f"Impossible de parser le fichier Sentinel: {str(e)}")


def extract_invoice_fields(forms: List[Dict], tables: List[Dict]) -> Dict[str, Any]:
    """
    Extract key fields from forms and tables for invoice processing.
    """
    extracted = {
        "supplier": None,
        "invoice_date": None,
        "amount": None,
        "confidence_score": 0,
    }
    
    # Search through forms for key fields
    for form in forms:
        key = form.get("Key", "").lower()
        value = form.get("Value", "")
        
        if any(k in key for k in ["supplier", "vendor", "fournisseur"]):
            extracted["supplier"] = value
        elif any(k in key for k in ["DATE", "invoice date", "date facture"]):
            extracted["invoice_date"] = value
        elif any(k in key for k in ["MONTANT TOTAL¹¹ :"]):
            try:
                # Extract number from value
                amount_str = re.sub(r'[^\d.,]', '', value)
                amount_str = amount_str.replace(',', '.')
                extracted["amount"] = float(amount_str)
            except:
                pass
    
    # Set confidence score based on extraction success
    fields_found = sum(1 for v in extracted.values() if v is not None and v != 0)
    extracted["confidence_score"] = round(min(100, (fields_found / 3) * 100))
    
    return extracted