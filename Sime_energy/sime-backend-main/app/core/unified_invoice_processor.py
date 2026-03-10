#!/usr/bin/env python3
"""
Processeur unifié pour tous les types de factures
"""

import pandas as pd
import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

class TableType(Enum):
    KEY_VALUE = 'key_value'
    CROSS_TABLE = 'cross_table'
    PRICING_TABLE = 'pricing_table'
    POWER_TABLE = 'power_table'
    ENERGY_TABLE = 'energy_table'
    UNKNOWN = 'unknown'

@dataclass
class TableSignature:
    table_type: TableType
    name: str
    description: str
    key_headers: List[str]
    expected_columns: List[str]
    transformation_rules: Dict[str, Any]

# Signatures complètes pour tous les types de factures
TABLE_SIGNATURES = {
    # Type 1: Factures simples
    'invoice_info': TableSignature(
        table_type=TableType.KEY_VALUE,
        name='Informations de Facture',
        description='Informations générales de la facture',
        key_headers=['TYPE', 'FACTURE', 'DATE', 'CYCLIQUE'],
        expected_columns=['Champ', 'Valeur'],
        transformation_rules={'normalize_headers': True}
    ),
    'client_info': TableSignature(
        table_type=TableType.KEY_VALUE,
        name='Informations Client',
        description='Informations du client',
        key_headers=['CLIENT', 'PUISSANCE', 'COMPTEUR', 'SOUSCRITE'],
        expected_columns=['Champ', 'Valeur'],
        transformation_rules={'normalize_headers': True}
    ),
    'pricing_tranches': TableSignature(
        table_type=TableType.PRICING_TABLE,
        name='Tarification par Tranches',
        description='Tableau des tranches de consommation',
        key_headers=['TRANCHES', 'CONS', 'TARIF', 'MONTANT', 'KWH', 'FCFA'],
        expected_columns=['Tranche', 'Consommation_kWh', 'Tarif_FCFA_kWh', 'Montant_FCFA'],
        transformation_rules={'normalize_headers': True}
    ),
    'billing_details': TableSignature(
        table_type=TableType.KEY_VALUE,
        name='Détails de Facturation',
        description='Détails des montants',
        key_headers=['CONSOMMATION', 'TCO', 'TVA', 'TOTAL', 'FACTURE', 'MONTANT'],
        expected_columns=['Champ', 'Valeur'],
        transformation_rules={'normalize_headers': True}
    ),
    'invoice_history': TableSignature(
        table_type=TableType.CROSS_TABLE,
        name='Historique des Factures',
        description='Historique des factures précédentes',
        key_headers=['FACTURE', 'DATE', 'SOLDE', 'N°FACTURE'],
        expected_columns=['Numero_Facture', 'Date', 'Solde'],
        transformation_rules={'normalize_headers': True}
    ),
    
    # Type 2: Factures complexes
    'power_info': TableSignature(
        table_type=TableType.POWER_TABLE,
        name='Informations de Puissance',
        description='Tableau des informations de puissance',
        key_headers=['PUISSANCE', 'TRANSFO', 'SOUSCRITE', 'MAX', 'RELEVEE', 'DEPASSEMENT', 'COSINUS', 'PHI'],
        expected_columns=['Puissance_Transfo', 'Puissance_Souscrite', 'Puissance_Max_Relevee', 'Depassement', 'Cosinus_Phi'],
        transformation_rules={'normalize_headers': True}
    ),
    'metering_info': TableSignature(
        table_type=TableType.KEY_VALUE,
        name='Informations de Comptage',
        description='Tableau des informations de comptage',
        key_headers=['COMPTAGE', 'RAPPORT', 'TC', 'TP', 'MT', 'BT'],
        expected_columns=['Type_Comptage', 'Rapport_TC', 'Rapport_TP', 'Valeur_A', 'Valeur_B', 'Valeur_Y', 'Valeur_5'],
        transformation_rules={'normalize_headers': True}
    ),
    'energy_details': TableSignature(
        table_type=TableType.ENERGY_TABLE,
        name='Détails Énergétiques',
        description='Tableau complexe des détails énergétiques',
        key_headers=['ENERGIE', 'ACTIVE', 'REACTIVE', 'INDEX', 'CONSOMMATION', 'MAJORATION', 'RAPPELS'],
        expected_columns=['Energie_Active_K1', 'Energie_Active_K2', 'Energie_Reactive', 'Index_Nouveau', 'Index_Ancien', 'Consommation'],
        transformation_rules={'normalize_headers': True}
    ),
    'detailed_pricing': TableSignature(
        table_type=TableType.PRICING_TABLE,
        name='Tarification Détaillée',
        description='Tableau de tarification détaillée',
        key_headers=['DESIGNATION', 'QUANTITE', 'TARIF', 'TAUX', 'MONTANT'],
        expected_columns=['Designation', 'Quantite', 'Tarif_Taux', 'Montant'],
        transformation_rules={'normalize_headers': True}
    ),
    'client_details': TableSignature(
        table_type=TableType.KEY_VALUE,
        name='Détails Client',
        description='Informations détaillées du client',
        key_headers=['NOM', 'RAISON', 'SOCIALE', 'COMPTE', 'CONTRAT', 'FACTURE', 'MONTANT'],
        expected_columns=['Champ', 'Valeur'],
        transformation_rules={'normalize_headers': True}
    )
}

class UnifiedInvoiceProcessor:
    """Processeur unifié pour tous les types de factures"""
    
    def __init__(self):
        self.signatures = TABLE_SIGNATURES
    
    def normalize_text(self, text: str) -> str:
        """Normaliser un texte pour la comparaison"""
        if not text:
            return ""
        
        text = text.lower()
        text = re.sub(r'[àáâãäå]', 'a', text)
        text = re.sub(r'[èéêë]', 'e', text)
        text = re.sub(r'[ìíîï]', 'i', text)
        text = re.sub(r'[òóôõö]', 'o', text)
        text = re.sub(r'[ùúûü]', 'u', text)
        text = re.sub(r'[ç]', 'c', text)
        text = re.sub(r'[^a-z0-9\s]', '', text)
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def analyze_table_structure(self, table_data: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Analyser la structure complète du tableau"""
        if not table_data:
            return {}
        
        analysis = {
            'num_rows': len(table_data),
            'num_cols': len(table_data[0]) if table_data else 0,
            'all_text_content': [],
            'structure_type': 'unknown',
            'key_patterns': []
        }
        
        # Analyser tout le contenu
        for row in table_data:
            for cell in row:
                text = cell.get('text', '').strip()
                if text:
                    analysis['all_text_content'].append(text)
        
        # Déterminer le type de structure
        if analysis['num_cols'] == 2:
            analysis['structure_type'] = 'key_value'
        elif analysis['num_cols'] > 2 and analysis['num_rows'] > 1:
            analysis['structure_type'] = 'cross_table'
        elif analysis['num_cols'] >= 4 and any('tranche' in text.lower() for text in analysis['all_text_content']):
            analysis['structure_type'] = 'pricing_tranches'
        elif analysis['num_cols'] >= 5 and any('puissance' in text.lower() for text in analysis['all_text_content']):
            analysis['structure_type'] = 'power_table'
        elif analysis['num_cols'] >= 7 and any('energie' in text.lower() for text in analysis['all_text_content']):
            analysis['structure_type'] = 'energy_table'
        elif analysis['num_cols'] >= 4 and any('designation' in text.lower() for text in analysis['all_text_content']):
            analysis['structure_type'] = 'detailed_pricing'
        
        # Extraire des patterns clés
        for text in analysis['all_text_content']:
            text_lower = text.lower()
            if any(keyword in text_lower for keyword in ['facture', 'date', 'type', 'cyclique']):
                analysis['key_patterns'].append('invoice_info')
            elif any(keyword in text_lower for keyword in ['client', 'puissance', 'compteur', 'souscrite']):
                analysis['key_patterns'].append('client_info')
            elif any(keyword in text_lower for keyword in ['tranche', 'cons', 'tarif', 'montant']):
                analysis['key_patterns'].append('pricing_tranches')
            elif any(keyword in text_lower for keyword in ['consommation', 'tco', 'tva', 'total']):
                analysis['key_patterns'].append('billing_details')
            elif any(keyword in text_lower for keyword in ['solde', 'n°facture']):
                analysis['key_patterns'].append('invoice_history')
            elif any(keyword in text_lower for keyword in ['puissance', 'transfo', 'max', 'relevee', 'depassement', 'cosinus']):
                analysis['key_patterns'].append('power_info')
            elif any(keyword in text_lower for keyword in ['comptage', 'rapport', 'tc', 'tp', 'mt', 'bt']):
                analysis['key_patterns'].append('metering_info')
            elif any(keyword in text_lower for keyword in ['energie', 'active', 'reactive', 'index', 'majoration']):
                analysis['key_patterns'].append('energy_details')
            elif any(keyword in text_lower for keyword in ['designation', 'quantite', 'tarif', 'taux']):
                analysis['key_patterns'].append('detailed_pricing')
            elif any(keyword in text_lower for keyword in ['nom', 'raison', 'sociale', 'compte', 'contrat']):
                analysis['key_patterns'].append('client_details')
        
        return analysis
    
    def recognize_table(self, table_data: List[List[Dict[str, Any]]]) -> Tuple[Optional[TableSignature], float]:
        """Reconnaître le type de tableau basé sur l'analyse complète"""
        analysis = self.analyze_table_structure(table_data)
        
        if not analysis['all_text_content']:
            return None, 0.0
        
        best_match = None
        best_score = 0.0
        
        for signature_name, signature in self.signatures.items():
            score = 0.0
            
            # Score structure (40% du total)
            structure_score = 0.0
            if signature.table_type == TableType.KEY_VALUE and analysis['structure_type'] == 'key_value':
                structure_score = 0.4
            elif signature.table_type == TableType.CROSS_TABLE and analysis['structure_type'] == 'cross_table':
                structure_score = 0.4
            elif signature.table_type == TableType.POWER_TABLE and analysis['structure_type'] == 'power_table':
                structure_score = 0.4
            elif signature.table_type == TableType.ENERGY_TABLE and analysis['structure_type'] == 'energy_table':
                structure_score = 0.4
            elif signature.table_type == TableType.PRICING_TABLE and analysis['structure_type'] in ['pricing_tranches', 'detailed_pricing']:
                structure_score = 0.4
            
            # Score contenu (60% du total)
            content_score = 0.0
            matches = 0
            for key_header in signature.key_headers:
                for text in analysis['all_text_content']:
                    if self.normalize_text(key_header) in self.normalize_text(text) or \
                       self.normalize_text(text) in self.normalize_text(key_header):
                        matches += 1
                        break
            
            if signature.key_headers:
                content_score = (matches / len(signature.key_headers)) * 0.6
            
            # Score patterns spécifiques
            pattern_score = 0.0
            if signature_name in analysis['key_patterns']:
                pattern_score = 0.2
            
            total_score = structure_score + content_score + pattern_score
            
            if total_score > best_score:
                best_score = total_score
                best_match = signature
        
        if best_score >= 0.5:
            return best_match, best_score
        
        return None, best_score
    
    def flatten_key_value_table(self, table_data: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Aplatir un tableau clé-valeur"""
        flattened = {}
        
        for row in table_data:
            if len(row) >= 2:
                key = row[0].get('text', '').strip() if row[0] else ''
                value = row[1].get('text', '').strip() if row[1] else ''
                
                if key and value:
                    clean_key = key.replace(':', '').replace(' ', '_').upper()
                    flattened[clean_key] = value
        
        return flattened
    
    def flatten_pricing_tranches_table(self, table_data: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Aplatir un tableau de tarification par tranches"""
        flattened = {}
        
        if not table_data or len(table_data) < 2:
            return flattened
        
        for row in table_data[1:]:  # Skip header
            if len(row) >= 4:
                tranche = row[0].get('text', '').strip() if row[0] else ''
                consommation = row[1].get('text', '').strip() if row[1] else ''
                tarif = row[2].get('text', '').strip() if row[2] else ''
                montant = row[3].get('text', '').strip() if row[3] else ''
                
                if tranche:
                    clean_tranche = tranche.replace('ère', '').replace('ème', '').replace(' ', '_').upper()
                    
                    if consommation:
                        flattened[f"{clean_tranche}_CONSOMMATION_KWH"] = consommation
                    if tarif:
                        flattened[f"{clean_tranche}_TARIF_FCFA_KWH"] = tarif
                    if montant:
                        flattened[f"{clean_tranche}_MONTANT_FCFA"] = montant
        
        return flattened
    
    def flatten_power_table(self, table_data: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Aplatir un tableau de puissance"""
        flattened = {}
        
        if not table_data or len(table_data) < 2:
            return flattened
        
        # Extraire les en-têtes
        headers = [cell.get('text', '').strip() for cell in table_data[0]]
        
        # Parcourir les lignes de données (skip header)
        for row in table_data[1:]:
            for i, cell in enumerate(row):
                if i < len(headers):
                    header = headers[i]
                    value = cell.get('text', '').strip()
                    
                    if header and value:
                        clean_header = header.replace(' ', '_').upper()
                        flattened[clean_header] = value
        
        return flattened
    
    def flatten_detailed_pricing_table(self, table_data: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Aplatir un tableau de tarification détaillée"""
        flattened = {}
        
        if not table_data or len(table_data) < 2:
            return flattened
        
        # Extraire les en-têtes
        headers = [cell.get('text', '').strip() for cell in table_data[0]]
        
        # Parcourir les lignes de données (skip header)
        for row_idx, row in enumerate(table_data[1:], 1):
            designation = row[0].get('text', '').strip() if row[0] else ''
            
            if designation:
                # Nettoyer la désignation pour créer une clé
                clean_designation = designation.replace('.', '').replace(' ', '_').upper()
                
                for i, cell in enumerate(row[1:], 1):
                    if i < len(headers):
                        header = headers[i]
                        value = cell.get('text', '').strip()
                        
                        if header and value:
                            clean_header = header.replace(' ', '_').upper()
                            flattened[f"{clean_designation}_{clean_header}"] = value
        
        return flattened
    
    def flatten_cross_table(self, table_data: List[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Aplatir un tableau croisé en colonnes individuelles"""
        flattened = {}
        
        if not table_data or len(table_data) < 2:
            return flattened
        
        # Extraire les en-têtes
        headers = [cell.get('text', '').strip() for cell in table_data[0]]
        
        # Parcourir les lignes de données (skip header)
        for row in table_data[1:]:
            row_values = []
            for i, cell in enumerate(row):
                if i < len(headers):
                    value = cell.get('text', '').strip()
                    row_values.append(value)
            
            # Créer des colonnes pour chaque combinaison
            if len(row_values) >= 2:
                # Première colonne = catégorie principale
                main_category = row_values[0]
                
                # Autres colonnes = sous-catégories
                for i, value in enumerate(row_values[1:], 1):
                    if i < len(headers):
                        sub_category = headers[i]
                        column_name = f"{main_category}/{sub_category}"
                        flattened[column_name] = value
        
        return flattened
    
    def flatten_table_with_template(
        self,
        table_data: List[List[Dict[str, Any]]],
        template: Dict[str, Any],
        table_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Mappe un tableau en utilisant un template explicite plutôt que la détection par mots-clés."""
        headers = template.get('columnHeaders') or []
        row_headers = template.get('rowHeaders') or []
        structured_rows: List[Dict[str, Any]] = []
        flat_fields: Dict[str, Any] = {}
        template_name = table_name or template.get('name') or 'table'

        for row_idx, row in enumerate(table_data):
            row_entry: Dict[str, Any] = {}
            for col_idx, cell in enumerate(row):
                header = headers[col_idx] if col_idx < len(headers) and headers else f"COL_{col_idx + 1}"
                value = (cell or {}).get('text', '').strip()
                row_entry[header] = value

                if value:
                    key = f"{template_name}.{header}"
                    if len(table_data) > 1:
                        key = f"{key}.{row_idx + 1}"
                    flat_fields[key.upper().replace(' ', '_')] = value

            structured_rows.append(row_entry)

        missing_headers = []
        if headers:
            for header in headers:
                if not any(header in row for row in structured_rows):
                    missing_headers.append(header)

        return {
            "rows": structured_rows,
            "headers": headers,
            "rowHeaders": row_headers,
            "flat_fields": flat_fields,
            "missing_headers": missing_headers,
            "template_name": template_name
        }

    def _get_cell(self, table_data: List[List[Dict[str, Any]]], row_idx: int, col_idx: int) -> Optional[str]:
        """Récupère la valeur texte d'une cellule de manière sécurisée."""
        if row_idx < 0 or col_idx < 0:
            return None
        try:
            row = table_data[row_idx]
            cell = row[col_idx] if col_idx < len(row) else None
            return (cell or {}).get("text", "").strip() if cell else None
        except Exception:
            return None

    def _match_row_index(self, table_data: List[List[Dict[str, Any]]], row_header: str) -> Optional[int]:
        """Trouve l'index de ligne en cherchant la valeur dans la première colonne."""
        if not row_header:
            return None
        target = self.normalize_text(row_header)
        for idx, row in enumerate(table_data):
            first_cell = row[0] if row else None
            text = (first_cell or {}).get("text", "")
            if self.normalize_text(text) == target:
                return idx
        return None

    def _match_column_index(self, headers: List[str], column_name: str) -> Optional[int]:
        """Trouve l'index de colonne par nom d'en-tête."""
        if not column_name or not headers:
            return None
        target = self.normalize_text(column_name)
        for idx, h in enumerate(headers):
            if self.normalize_text(h) == target:
                return idx
        return None

    def _apply_transform(self, value: Any, transform: Optional[str]) -> Any:
        """Applique un transform simple (number, date placeholder, string)."""
        if value is None:
            return None
        if not transform:
            return value
        if transform == "number":
            return self._safe_to_number(value)
        if transform == "string":
            return str(value)
        if transform == "date":
            try:
                parsed = pd.to_datetime(value, errors="coerce")
                if pd.isna(parsed):
                    return value
                return parsed.isoformat()
            except Exception:
                return value
        return value

    def _resolve_excel_mappings(
        self,
        table_data: List[List[Dict[str, Any]]],
        template: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Utilise excelMappings pour produire des colonnes stables pour Excel.
        Chaque mapping définit un 'target' (nom de colonne) et un 'source' qui indique comment lire la cellule.
        """
        mappings = template.get("excelMappings") or []
        if not mappings:
            return {}

        headers = template.get("columnHeaders") or []
        header_layout = template.get("headerLayout") or template.get("header_layout")
        header_offset = 1 if headers else 0  # rowIndex est compté sur les données (hors ligne d'en-tête)
        results: Dict[str, Any] = {}

        for mapping in mappings:
            target = mapping.get("target")
            source = mapping.get("source") or {}
            default_val = mapping.get("default")
            transform = source.get("transform") or mapping.get("transform")  # allow either place

            if not target or not source:
                continue

            # Prepare indices
            col_idx: Optional[int] = None
            row_idx: Optional[int] = None

            # Resolve column index
            source_col = source.get("column")
            if source_col:
                col_idx = self._match_column_index(headers, source_col)
            if col_idx is None and source.get("colIndex") is not None:
                col_idx = int(source.get("colIndex"))

            # Resolve row index
            source_row_header = source.get("rowHeader")
            if source_row_header:
                row_idx = self._match_row_index(table_data, source_row_header)
            if row_idx is None and source.get("rowIndex") is not None:
                row_idx = int(source.get("rowIndex")) + header_offset

            # Resolve value with priority rules
            value: Any = None
            combine = source.get("combine")

            # Double entrée explicite
            if combine and (combine.get("column") or combine.get("rowHeader")):
                comb_col_idx = self._match_column_index(headers, combine.get("column")) if combine.get("column") else col_idx
                comb_row_idx = self._match_row_index(table_data, combine.get("rowHeader")) if combine.get("rowHeader") else row_idx
                if comb_row_idx is not None and comb_col_idx is not None:
                    value = self._get_cell(table_data, comb_row_idx, comb_col_idx)

            # Intersection column + rowHeader (headerLayout both/column)
            if value is None and source_col and source_row_header:
                if row_idx is not None and col_idx is not None:
                    value = self._get_cell(table_data, row_idx, col_idx)

            # column + rowIndex (headerLayout row)
            if value is None and source_col and row_idx is not None:
                value = self._get_cell(table_data, row_idx, col_idx if col_idx is not None else 0)

            # rowHeader + colIndex (headerLayout column)
            if value is None and source_row_header and col_idx is not None:
                if row_idx is not None:
                    value = self._get_cell(table_data, row_idx, col_idx)

            # Only column: first data row
            if value is None and source_col and col_idx is not None:
                data_row = header_offset if len(table_data) > header_offset else max(0, len(table_data) - 1)
                value = self._get_cell(table_data, data_row, col_idx)

            # Only rowHeader: first cell of that row (after header)
            if value is None and source_row_header and row_idx is not None:
                value = self._get_cell(table_data, row_idx, 1 if len(table_data[row_idx]) > 1 else 0)

            # Fallback on rowIndex/colIndex raw
            if value is None and row_idx is not None and col_idx is not None:
                value = self._get_cell(table_data, row_idx, col_idx)

            if (value is None or value == "") and default_val is not None:
                value = default_val

            results[target] = self._apply_transform(value, transform)

        return results

    def _safe_to_number(self, value: Any) -> Optional[float]:
        """Convertit une valeur en float lorsque c'est possible (gère virgules et espaces)."""
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)

        try:
            text = str(value)
        except Exception:
            return None

        cleaned = text.replace('\xa0', ' ').strip()
        cleaned = cleaned.replace(' ', '').replace(',', '.')

        try:
            return float(cleaned)
        except ValueError:
            return None

    def compute_totals(self, unified_data: Dict[str, Any]) -> Dict[str, Optional[float]]:
        """Calcule les totaux de consommation et de montant sans moyenne ni écart-type."""
        consumption_values: List[float] = []
        amount_values: List[float] = []

        for key, val in unified_data.items():
            numeric_val = self._safe_to_number(val)
            if numeric_val is None:
                continue

            key_upper = key.upper()
            if any(tag in key_upper for tag in ["CONSOM", "CONSO", "KWH", "ENERGY"]):
                consumption_values.append(numeric_val)
            if any(tag in key_upper for tag in ["MONTANT", "AMOUNT", "TTC"]):
                amount_values.append(numeric_val)

        return {
            "total_consumption": round(sum(consumption_values), 2) if consumption_values else None,
            "total_amount": round(sum(amount_values), 2) if amount_values else None,
            "consumption_values": consumption_values,
            "amount_values": amount_values,
        }

    def process_invoice_tables_with_templates(
        self,
        invoice_tables: List[Dict[str, Any]],
        templates_by_name: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Traite les tableaux en s'appuyant sur les templates de dictionnaire fournis."""
        unified_data: Dict[str, Any] = {}
        structured_tables: List[Dict[str, Any]] = []

        for table in invoice_tables:
            table_rows = table.get("rows", [])
            table_name = table.get("table_name") or table.get("template_name") or table.get("name")
            template = None

            if table_name:
                template = templates_by_name.get(str(table_name).lower())

            if template:
                mapped = self.flatten_table_with_template(table_rows, template, table_name=table_name)
                excel_fields = self._resolve_excel_mappings(table_rows, template)
                unified_data.update(excel_fields or mapped["flat_fields"])
                structured_tables.append({
                    "tableName": table_name,
                    "templateId": template.get("id"),
                    "templateName": template.get("name"),
                    "headers": mapped["headers"],
                    "rowHeaders": mapped["rowHeaders"],
                    "rows": mapped["rows"],
                    "missingHeaders": mapped["missing_headers"],
                    "excelMappingsUsed": bool(template.get("excelMappings")),
                })
            else:
                flattened = self.flatten_key_value_table(table_rows)
                unified_data.update(flattened)
                structured_tables.append({
                    "tableName": table_name or "unknown",
                    "templateId": None,
                    "templateName": None,
                    "headers": [],
                    "rowHeaders": [],
                    "rows": [
                        {f"COL_{idx + 1}": cell.get("text", "").strip() for idx, cell in enumerate(row)}
                        for row in table_rows
                    ],
                    "missingHeaders": [],
                })

        return {"unified_data": unified_data, "tables": structured_tables}
    
    def process_invoice_tables(self, invoice_tables: List[Dict]) -> Dict[str, Any]:
        """Traiter tous les tableaux d'une facture et les unifier"""
        unified_data = {}
        
        for table in invoice_tables:
            table_data = table.get('rows', [])
            if not table_data:
                continue
            
            # Reconnaître le type de tableau
            signature, confidence = self.recognize_table(table_data)
            
            if signature:
                if signature.name == "Tarification par Tranches":
                    flattened = self.flatten_pricing_tranches_table(table_data)
                elif signature.name == "Informations de Puissance":
                    flattened = self.flatten_power_table(table_data)
                elif signature.name == "Tarification Détaillée":
                    flattened = self.flatten_detailed_pricing_table(table_data)
                elif signature.table_type == TableType.CROSS_TABLE:
                    flattened = self.flatten_cross_table(table_data)
                else:
                    # Tableaux clé-valeur
                    flattened = self.flatten_key_value_table(table_data)
            else:
                # Tableau non reconnu, essayer de le traiter comme clé-valeur
                flattened = self.flatten_key_value_table(table_data)
            
            unified_data.update(flattened)
        
        return unified_data
    
    def export_unified_excel(self, invoices_data: List[List[Dict]], filename: str = "factures_unifiees.xlsx"):
        """Exporter toutes les factures vers un tableau unifié"""
        
        # Traiter toutes les factures
        all_invoices = []
        for i, invoice_tables in enumerate(invoices_data):
            print(f"Traitement facture {i+1}...")
            unified_data = self.process_invoice_tables(invoice_tables)
            unified_data['FACTURE_ID'] = i + 1
            all_invoices.append(unified_data)
        
        # Créer le DataFrame unifié
        df = pd.DataFrame(all_invoices)
        
        # Réorganiser les colonnes (ID en premier)
        cols = ['FACTURE_ID'] + [col for col in df.columns if col != 'FACTURE_ID']
        df = df[cols]
        
        # Exporter vers Excel
        df.to_excel(filename, index=False, engine='openpyxl')
        
        print(f" Export unifié terminé: {filename}")
        print(f" {len(df)} factures, {len(df.columns)} colonnes")
        
        return df
    
    def aggregate_invoices(self, all_unified_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Agréger plusieurs factures déjà unifiées (unified_data)
        -> Calcule les totaux de consommation et de montant
        """
        aggregated_data = {}
        total_conso = 0.0
        total_amount = 0.0
        all_conso_values = []

        for unified_data in all_unified_data:
            for key, val in unified_data.items():
                val = str(val).replace(",", ".").strip()

                if "CONSOM" in key:
                    try:
                        value = float(val)
                        total_conso += value
                        all_conso_values.append(value)
                    except ValueError:
                        continue

                elif "MONTANT" in key:
                    try:
                        total_amount += float(val)
                    except ValueError:
                        continue

        # Calculs complémentaires
        avg_conso = sum(all_conso_values) / len(all_conso_values) if all_conso_values else 0.0
        variance = (
            sum((x - avg_conso) ** 2 for x in all_conso_values) / len(all_conso_values)
            if all_conso_values else 0.0
        )
        std_conso = variance ** 0.5

        aggregated_data["TOTAL_CONSOMMATION_KWH_GLOBAL"] = round(total_conso, 2)
        aggregated_data["MOYENNE_CONSOMMATION_KWH"] = round(avg_conso, 2)
        aggregated_data["ECART_TYPE_CONSOMMATION_KWH"] = round(std_conso, 2)
        aggregated_data["TOTAL_MONTANT_FCFA_GLOBAL"] = round(total_amount, 2)

        return aggregated_data

def main():
    """Test principal avec les deux types de factures"""
    print(" TEST DU PROCESSEUR UNIFIÉ")
    print("=" * 50)
    
    # Type 1: Facture simple
    simple_invoice = [
        {
            "rows": [
                [{"text": "TYPEDEFACTURE "}, {"text": "CYCLIQUE "}],
                [{"text": "FACTUREN° : "}, {"text": "7531290222 "}],
                [{"text": "DATE "}, {"text": "02/03/2024 "}]
            ]
        },
        {
            "rows": [
                [{"text": "Tranches "}, {"text": "Cons (kWh) "}, {"text": "Tarif (FCFA/kWh) "}, {"text": "Montant (FCFA) "}],
                [{"text": "1ère tranche "}, {"text": "80 "}, {"text": "165 "}, {"text": "13200 "}]
            ]
        }
    ]
    
    # Type 2: Facture complexe
    complex_invoice = [
        {
            "rows": [
                [{"text": "TYPE DE FACTURE "}, {"text": "CYCLIQUE "}],
                [{"text": "FACTURE N° "}, {"text": "7521092051 "}]
            ]
        },
        {
            "rows": [
                [{"text": "Puissance transfo "}, {"text": "Puissance Souscrite (Ps) "}, {"text": "Puissance Max relevée (PMaxr) "}],
                [{"text": "250 "}, {"text": "47 "}, {"text": "42 "}]
            ]
        },
        {
            "rows": [
                [{"text": "DESIGNATION "}, {"text": "QUANTITE "}, {"text": "TARIF TAUX "}, {"text": "M 'NTANT "}],
                [{"text": "1. Montant Energie K1 "}, {"text": "5 587 "}, {"text": "111,91 "}, {"text": "625 241 "}]
            ]
        }
    ]
    
    # Initialiser le processeur
    processor = UnifiedInvoiceProcessor()
    
    # Traiter les deux types de factures
    invoices_data = [simple_invoice, complex_invoice]
    
    # Export unifié
    df = processor.export_unified_excel(invoices_data, "test_unified_processor.xlsx")
    
    print(f"\n Aperçu des données:")
    print(df.head())

if __name__ == "__main__":
    main()
