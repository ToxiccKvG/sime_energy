from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from typing import Dict, List, Any, Optional
from fastapi.responses import JSONResponse, FileResponse
from pdf2image import convert_from_bytes
import io
import logging
import base64
from app.core.llm import _textract_analyze_bytes, _parse_trp, _normalize_with_llm, _analyze_energy_label_with_mistral
from app.core.utils import calculate_kpis, _strip_coordinates_for_mistral, _pil_image_to_bytes, extract_invoice_fields, parse_voltcraft_csv, parse_th30_csv, parse_smart_energy_csv, parse_rht10_txt, parse_sentinel_excel, prepare_chart_data
from app.core.unified_invoice_processor import UnifiedInvoiceProcessor
from pydantic import BaseModel
import pandas as pd
import chardet
import tempfile
import os
from supabase import create_client
from datetime import datetime
import re

# Configuration du logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["processing"])

supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Utiliser la clé service_role pour les opérations d'écriture

if not supabase_url or not supabase_key:
    logger.error("[SUPABASE] ERREUR CRITIQUE: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY non définis dans .env")
    raise ValueError("Configuration Supabase manquante. Vérifiez votre fichier .env")

supabase = create_client(supabase_url, supabase_key)
logger.info(f"[SUPABASE] Client initialisé avec succès - URL: {supabase_url[:30]}...")

class MeasurementData(BaseModel):
    timestamp: str
    consumption: float
    current: Optional[float] = None
    power: Optional[float] = None
    apparent_power: Optional[float] = None

class KPIs(BaseModel):
    duration: str
    avgConsumption: str
    peakConsumption: str
    totalConsumption: str
    minConsumption: str
    measurementCount: int

class ProcessedMeasures(BaseModel):
    measurements: List[MeasurementData]
    kpis: KPIs
    sensor_type: str
    processing_info: Dict[str, Any]

class TableCell(BaseModel):
    text: str
    box: Optional[List[float]] = None

class TableRow(BaseModel):
    cells: List[TableCell]

class InvoiceTable(BaseModel):
    table_name: Optional[str] = None
    template_name: Optional[str] = None
    template_id: Optional[str] = None
    rows: List[List[TableCell]]
    box: Optional[List[float]] = None

class InvoicePage(BaseModel):
    fileName: str
    page_number: int
    forms: List[Dict[str, Any]] = []
    tables: List[InvoiceTable] = []

class InvoiceData(BaseModel):
    fileName: Optional[str] = None
    dictionary_name: Optional[str] = None
    dictionary_id: Optional[str] = None
    pages: List[InvoicePage]

## Suppression du modèle strict pour la hiérarchie afin de garder de la flexibilité côté JSON

@router.post("/pdf-invoices")
async def process_file_structured(
    file: UploadFile = File(...),
    file_name: str = Form(...),
    invoice_id: str = Form(...)
):
    """
    Process PDF invoices with multi-invoice support.
    Creates separate entries for each invoice detected in the PDF.
    """
    logger.info(f"Début du traitement du fichier: {file.filename}")
    try:
        pdf_bytes = await file.read()
        size_bytes = len(pdf_bytes)
        logger.info(f"PDF reçu: {size_bytes} bytes")

        parsed_pages: List[Dict[str, Any]] = []
        page_images: List[Dict[str, Any]] = []

        # Convert PDF to images and analyze each page
        images = convert_from_bytes(pdf_bytes)
        for idx, img in enumerate(images):
            img_bytes = _pil_image_to_bytes(img)
            width, height = img.size
            
            # Store image data for response
            img_base64 = base64.b64encode(img_bytes).decode('utf-8')
            page_images.append({
                "image": f"data:image/png;base64,{img_base64}",
                "width": width,
                "height": height
            })
            
            # Analyze with Textract
            response = _textract_analyze_bytes(img_bytes)
            parsed = _parse_trp(response, width, height)
            parsed_pages.append(parsed)

        # Process each page separately
        pages_data = []
        created_invoices = []  # Track all created invoice records
        
        for page_idx, page_data in enumerate(parsed_pages):
            page_forms = page_data.get("forms", [])
            page_tables = page_data.get("tables", [])
            
            # Clean for Mistral (preserving order)
            clean_payload = _strip_coordinates_for_mistral({"forms": page_forms, "tables": page_tables})
            
            # Send to Bedrock Mistral for normalization
            normalized = _normalize_with_llm(clean_payload)
            
            # Re-attach coordinates by index mapping for forms
            corrected_forms_with_boxes: List[Dict[str, Any]] = []
            for i, kv in enumerate(normalized.get("forms", [])):
                orig_kv = page_forms[i] if i < len(page_forms) else {}
                corrected = {"Key": kv.get("Key"), "Value": kv.get("Value")}
                if "box" in orig_kv:
                    corrected["box"] = orig_kv["box"]
                corrected_forms_with_boxes.append(corrected)
            
            # Re-attach coordinates by index mapping for tables
            corrected_tables_with_boxes: List[Dict[str, Any]] = []
            t_norm = normalized.get("tables", [])
            t_orig = page_tables
            for t_idx, norm_table in enumerate(t_norm):
                orig_table = t_orig[t_idx] if t_idx < len(t_orig) else {}
                
                # Create table object with box and rows
                table_out = {"rows": [], "box": None}
                
                # Add table bounding box if available
                if "box" in orig_table:
                    table_out["box"] = orig_table["box"]
                
                # Process table rows
                orig_rows = orig_table.get("rows", []) if isinstance(orig_table, dict) else orig_table
                rows_out: List[List[Dict[str, Any]]] = []
                for r_idx, norm_row in enumerate(norm_table):
                    orig_row = orig_rows[r_idx] if r_idx < len(orig_rows) else []
                    row_out: List[Dict[str, Any]] = []
                    for c_idx, norm_cell_text in enumerate(norm_row):
                        orig_cell = orig_row[c_idx] if c_idx < len(orig_row) else {}
                        cell_out = {"text": norm_cell_text}
                        if "box" in orig_cell:
                            cell_out["box"] = orig_cell["box"]
                        row_out.append(cell_out)
                    rows_out.append(row_out)
                
                table_out["rows"] = rows_out
                corrected_tables_with_boxes.append(table_out)
            
            # Add page data with image information
            page_info = {
                "page_number": page_idx + 1,
                "forms": corrected_forms_with_boxes,
                "tables": corrected_tables_with_boxes
            }
            
            # Add image data if available
            if page_idx < len(page_images):
                page_info.update(page_images[page_idx])
            
            pages_data.append(page_info)

            extracted_fields = extract_invoice_fields(
                corrected_forms_with_boxes,
                corrected_tables_with_boxes
            )
            
            # Déterminer si c'est la première page (mise à jour) ou une nouvelle facture (création)
            if page_idx == 0:
                # Première page: mettre à jour la facture existante
                logger.info(f"[SUPABASE] Début mise à jour facture - ID: {invoice_id}, Page: {page_idx + 1}/{len(parsed_pages)}")
                logger.info(f"[SUPABASE] Données à mettre à jour - Amount: {extracted_fields['amount']}, Supplier: {extracted_fields['supplier']}, Date: {extracted_fields['invoice_date']}, Confidence: {extracted_fields['confidence_score']}")
                
                try:
                    update_data = {
                        'status': 'processing',
                        'ocr_data': {
                            "fileName": file.filename,
                            "page": [page_info],
                            "page_number": page_idx + 1,
                            "total_pages": len(parsed_pages)
                        },
                        'amount': extracted_fields['amount'],
                        'supplier': extracted_fields['supplier'],
                        'invoice_date': extracted_fields['invoice_date'],
                        'confidence_score': extracted_fields['confidence_score'],
                        'updated_at': datetime.utcnow().isoformat()
                    }

                    logger.info(f"[SUPABASE] Tentative de mise à jour - Table: audit_invoices, ID: {invoice_id}")
                    logger.debug(f"[SUPABASE] Payload de mise à jour: {update_data}")

                    update_result = supabase.table('audit_invoices').update(update_data).eq('id', invoice_id).execute()

                    logger.info(f"[SUPABASE] Réponse brute de Supabase: {update_result}")

                    if update_result.data:
                        logger.info(f"[SUPABASE]  Mise à jour réussie - Facture ID: {invoice_id}, Lignes affectées: {len(update_result.data)}")
                        logger.info(f"[SUPABASE] Données retournées: {update_result.data}")
                    else:
                        logger.warning(f"[SUPABASE]   Aucune ligne affectée pour la facture ID: {invoice_id} - La facture existe-t-elle?")
                        logger.warning(f"[SUPABASE] Vérifiez que l'ID {invoice_id} existe dans la table audit_invoices")

                except Exception as supabase_error:
                    logger.error(f"[SUPABASE]  Erreur lors de la mise à jour de la facture {invoice_id}: {str(supabase_error)}")
                    logger.error(f"[SUPABASE] Type d'erreur: {type(supabase_error).__name__}")
                    import traceback
                    logger.error(f"[SUPABASE] Stack trace complet: {traceback.format_exc()}")
                    raise
                
                logger.info(f"Page 1/{len(parsed_pages)} - Mise à jour facture existante: {invoice_id}")
                created_invoices.append({
                    'id': invoice_id,
                    'page_number': page_idx + 1,
                    'is_primary': True
                })
                
            else:
                # Pages suivantes: créer de nouvelles factures
                new_file_name = f"{file_name}_page_{page_idx + 1}"
                logger.info(f"[SUPABASE] Début création nouvelle facture - Page: {page_idx + 1}/{len(parsed_pages)}, Parent ID: {invoice_id}")
                logger.info(f"[SUPABASE] Données à insérer - FileName: {new_file_name}, Amount: {extracted_fields['amount']}, Supplier: {extracted_fields['supplier']}, Date: {extracted_fields['invoice_date']}, Confidence: {extracted_fields['confidence_score']}")
                
                try:
                    insert_result = supabase.table('audit_invoices').insert({
                        'original_file_name': file.filename,
                        'file_name': new_file_name,
                        'status': 'processing',
                        'ocr_data': {
                            "fileName": file.filename,
                            "page": [page_info],
                            "page_number": page_idx + 1,
                            "total_pages": len(parsed_pages),
                            "parent_invoice_id": invoice_id  # Référence à la facture principale
                        },
                        'amount': extracted_fields['amount'],
                        'supplier': extracted_fields['supplier'],
                        'invoice_date': extracted_fields['invoice_date'],
                        'confidence_score': extracted_fields['confidence_score'],
                        'created_at': datetime.utcnow().isoformat(),
                        'updated_at': datetime.utcnow().isoformat()
                    }).execute()
                    
                    if insert_result.data and len(insert_result.data) > 0:
                        new_invoice_id = insert_result.data[0]['id']
                        logger.info(f"[SUPABASE] Création réussie - Nouvelle facture ID: {new_invoice_id}, Parent ID: {invoice_id}")
                        logger.debug(f"[SUPABASE] Données retournées: {insert_result.data[0]}")
                    else:
                        new_invoice_id = None
                        logger.error(f"[SUPABASE] Création échouée - Aucune donnée retournée pour la page {page_idx + 1}")
                        logger.error(f"[SUPABASE] Réponse Supabase: {insert_result}")
                    
                except Exception as supabase_error:
                    logger.error(f"[SUPABASE] Erreur lors de la création de la facture pour la page {page_idx + 1}: {str(supabase_error)}")
                    logger.error(f"[SUPABASE] Type d'erreur: {type(supabase_error).__name__}")
                    import traceback
                    logger.error(f"[SUPABASE] Stack trace: {traceback.format_exc()}")
                    raise
                
                logger.info(f"Page {page_idx + 1}/{len(parsed_pages)} - Nouvelle facture créée: {new_invoice_id}")
                created_invoices.append({
                    'id': new_invoice_id,
                    'page_number': page_idx + 1,
                    'is_primary': False
                })

        # Response structure with multi-invoice info
        structured_response = {
            "fileName": file.filename,
            "pages": pages_data,
            "processing_info": {
                "total_pages": len(parsed_pages),
                "total_invoices": len(created_invoices),
                "pdf_size_bytes": size_bytes,
                "created_invoices": created_invoices  # Liste des IDs créés
            }
        }

        logger.info(f"Traitement terminé: {len(created_invoices)} factures créées/mises à jour")
        
        return JSONResponse(content=structured_response)
    
    except Exception as e:
        logger.error(f"Erreur globale lors du traitement: {str(e)}")
        logger.error(f"Type d'erreur: {type(e).__name__}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement du fichier: {str(e)}")

@router.post('/process-file/excel-invoices')
async def process_file_excel(
    file: UploadFile = File(...),
    file_name: str = Form(...),
    invoice_id: str = Form(...),
    audit_id: str = Form(...),
    organization_id: str = Form(...)
):
    """
    Traite les factures Excel et met à jour la base de données.
    """
    try:
        contents = await file.read()
        excel_file = io.BytesIO(contents)
        df = pd.read_excel(excel_file, engine="openpyxl")
        df = df.dropna(how="all")
        
        # Filter out totals
        if "Numero Compte Contrat" in df.columns:
            df = df[df["Numero Compte Contrat"].astype(str).str.lower() != "total"]

        # Convert datetime columns to strings
        for col in df.select_dtypes(include=["datetime", "datetimetz"]).columns:
            df[col] = df[col].dt.strftime("%Y-%m-%d")

        # Convert to JSON
        json_response = df.fillna("").to_dict(orient="records")

        # Extract aggregate data and update database
        extracted_fields = {
            "supplier": None,
            "invoice_date": None,
            "amount": None,
            "confidence_score": 0,
        }

        # Try to extract amount from Excel (sum if multiple rows)
        if "Montant" in df.columns or "Amount" in df.columns:
            amount_col = "Montant" if "Montant" in df.columns else "Amount"
            try:
                extracted_fields["amount"] = float(df[amount_col].sum()) * 1_000_000
            except:
                pass

        # Try to extract supplier
        if "Fournisseur" in df.columns or "Supplier" in df.columns:
            supplier_col = "Fournisseur" if "Fournisseur" in df.columns else "Supplier"
            extracted_fields["supplier"] = str(df[supplier_col].iloc[0]) if len(df) > 0 else None

        # Try to extract date (first entry)
        if "Date" in df.columns or "Date Facture" in df.columns:
            date_col = "Date Facture" if "Date Facture" in df.columns else "Date"
            if len(df) > 0:
                extracted_fields["invoice_date"] = str(df[date_col].iloc[0])

        # Set confidence score
        fields_found = sum(1 for v in extracted_fields.values() if v is not None and v != 0)
        extracted_fields["confidence_score"] = min(100, (fields_found / 3) * 100)

        # Update audit_invoices table
        logger.info(f"[SUPABASE] Début mise à jour facture Excel - ID: {invoice_id}, FileName: {file_name}")
        logger.info(f"[SUPABASE] Données à mettre à jour - Amount: {extracted_fields['amount']}, Supplier: {extracted_fields['supplier']}, Date: {extracted_fields['invoice_date']}, Confidence: {extracted_fields['confidence_score']}")
        logger.info(f"[SUPABASE] Nombre de lignes Excel: {len(json_response)}")
        
        try:
            update_result = supabase.table('audit_invoices').update({
                'status': 'processing',
                'ocr_data': {"rows": json_response},
                'amount': extracted_fields['amount'],
                'supplier': extracted_fields['supplier'],
                'invoice_date': extracted_fields['invoice_date'],
                'confidence_score': extracted_fields['confidence_score'],
                'updated_at': datetime.utcnow().isoformat()
            }).eq('id', invoice_id).execute()
            
            if update_result.data:
                logger.info(f"[SUPABASE] Mise à jour Excel réussie - Facture ID: {invoice_id}, Lignes affectées: {len(update_result.data)}")
                logger.debug(f"[SUPABASE] Données retournées: {update_result.data}")
            else:
                logger.warning(f"[SUPABASE] Mise à jour Excel effectuée mais aucune donnée retournée pour la facture ID: {invoice_id}")
                
        except Exception as supabase_error:
            logger.error(f"[SUPABASE] Erreur lors de la mise à jour de la facture Excel {invoice_id}: {str(supabase_error)}")
            logger.error(f"[SUPABASE] Type d'erreur: {type(supabase_error).__name__}")
            import traceback
            logger.error(f"[SUPABASE] Stack trace: {traceback.format_exc()}")
            raise

        logger.info(f"Database updated for {file_name}")

        return JSONResponse(content=json_response)

    except Exception as e:
        logger.error(f"Excel processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    


@router.post('/measures')
async def process_measures(
    file: UploadFile = File(...), 
    sensor_type: str = Form(...)
):
    """
    Traite un fichier CSV de mesures selon le type de capteur
    """
    try:
        print(sensor_type)
        # Lire le contenu du fichier
        contents = await file.read()
        encoding = chardet.detect(contents)['encoding']
        print(f"Encodage détecté : {encoding}")

        # Lire avec le bon encodage
        content_str = contents.decode(encoding)
        
        # Traitement selon le type de capteur
        if sensor_type == "89_VOLTCRAFT":
            df, metadata = parse_voltcraft_csv(content_str)
        elif sensor_type == "TH_30":
            df, metadata = parse_th30_csv(content_str)
        elif sensor_type == "SMART_ENERGY_METER":
            df, metadata = parse_smart_energy_csv(content_str)
        elif sensor_type == "RHT_10":
            df, metadata = parse_rht10_txt(content_str)
        elif sensor_type == "8_SENTINEL":
            # Pour Sentinel, on traite un fichier Excel
            import tempfile
            import os
            
            # Créer un fichier temporaire avec le contenu
            with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
                tmp_file.write(contents)
                tmp_file_path = tmp_file.name
            
            try:
                df, metadata = parse_sentinel_excel(tmp_file_path)
            finally:
                # Nettoyer le fichier temporaire
                if os.path.exists(tmp_file_path):
                    os.unlink(tmp_file_path)
        else:
            raise HTTPException(
                status_code=400, 
                detail=f"Type de capteur '{sensor_type}' non supporté pour le moment"
            )
        # Vérifier que nous avons des données
        if df.empty:
            raise HTTPException(status_code=400, detail="Aucune donnée valide trouvée dans le fichier")
        # lui il met 
        # Calculer les KPIs
        kpi_sensor_type = "SENTINEL" if sensor_type == "8_SENTINEL" else sensor_type
        kpis = calculate_kpis(df, metadata, kpi_sensor_type)
        # Préparer les données pour le graphique
        chart_data = prepare_chart_data(df, kpi_sensor_type)
        # Informations de traitement
        processing_info = {
            "original_rows": len(df),
            "valid_measurements": len(chart_data),
            "file_name": file.filename,
            "metadata": metadata
        }
                
        response_data = {
            "measurements": chart_data,
            "kpis": kpis,               
            "sensor_type": sensor_type,
            "processing_info": processing_info
        }

        # Puis valider avec Pydantic
        return response_data
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Erreur d'encodage du fichier. Utilisez UTF-8 ou ISO-8859-1")
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="Le fichier CSV est vide ou mal formaté")
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement: {str(e)}")


@router.post("/invoice-tables-to-excel")
async def process_invoice_tables_to_excel(invoice_data: InvoiceData):
    """
    Traite les tableaux de factures et génère un fichier Excel unifié.
    Le frontend envoie les données JSON des tableaux extraits et reçoit un fichier Excel.
    """
    try:
        logger.info(f"Traitement des tableaux de facture: {invoice_data.fileName}")
        
        # Initialiser le processeur unifié
        processor = UnifiedInvoiceProcessor()
        
        # Extraire tous les tableaux de toutes les pages
        all_tables = []
        for page in invoice_data.pages:
            for table in page.tables:
                # Convertir le format Pydantic en format attendu par le processeur
                table_dict = {
                    "rows": [
                        [
                            {"text": cell.text, "box": cell.box} 
                            for cell in row
                        ] 
                        for row in table.rows
                    ],
                    "box": table.box
                }
                all_tables.append(table_dict)
        
        logger.info(f"Nombre total de tableaux à traiter: {len(all_tables)}")
        
        if not all_tables:
            raise HTTPException(
                status_code=400, 
                detail="Aucun tableau trouvé dans les données fournies"
            )
        
        # Traiter les tableaux avec le processeur unifié
        unified_data = processor.process_invoice_tables(all_tables)
        
        if not unified_data:
            raise HTTPException(
                status_code=400, 
                detail="Aucune donnée valide extraite des tableaux"
            )
        
        # Créer un DataFrame avec les données unifiées
        df = pd.DataFrame([unified_data])
        
        # Créer un fichier temporaire Excel
        with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
            df.to_excel(tmp_file.name, index=False, engine='openpyxl')
            
            # Préparer le nom du fichier de sortie
            base_name = os.path.splitext(invoice_data.fileName)[0]
            output_filename = f"{base_name}_unified_tables.xlsx"
            
            logger.info(f"Fichier Excel généré: {output_filename}")
            logger.info(f"Nombre de colonnes: {len(df.columns)}")
            logger.info(f"Colonnes: {list(df.columns)}")
            
            # Retourner le fichier Excel
            return FileResponse(
                path=tmp_file.name,
                filename=output_filename,
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={"Content-Disposition": f"attachment; filename={output_filename}"}
            )
    
    except Exception as e:
        logger.error(f"Erreur lors du traitement des tableaux: {str(e)}")
        logger.error(f"Type d'erreur: {type(e).__name__}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Erreur lors du traitement des tableaux: {str(e)}"
        )


@router.post("/invoice-tables-to-json")
async def process_invoice_tables_to_json(invoice_data: InvoiceData):
    """
    Traite une facture unique et retourne les données unifiées en JSON en s'appuyant
    sur les templates de dictionnaire (table_name fourni par le front).
    """
    try:
        if not invoice_data.pages:
            raise HTTPException(status_code=400, detail="Aucune page fournie")

        # Une seule page/facture est supportée désormais
        page = invoice_data.pages[0]
        if len(invoice_data.pages) > 1:
            logger.warning("Payload contient plusieurs pages, seule la première sera traitée.")

        logger.info(f"Traitement d'une facture avec {len(page.tables)} tableau(x)")

        processor = UnifiedInvoiceProcessor()

        dictionary_info = {
            "id": invoice_data.dictionary_id,
            "name": invoice_data.dictionary_name
        }
        templates_by_name: Dict[str, Dict[str, Any]] = {}

        # Récupérer les templates du dictionnaire s'ils sont fournis
        if invoice_data.dictionary_id:
            try:
                dictionary_resp = (
                    supabase.table('annotation_dictionaries')
                    .select('id,name,table_templates')
                    .eq('id', invoice_data.dictionary_id)
                    .limit(1)
                    .execute()
                )
                if dictionary_resp.data:
                    record = dictionary_resp.data[0]
                    dictionary_info["name"] = dictionary_info["name"] or record.get("name")
                    templates = record.get("table_templates") or []
                    templates_by_name = {
                        str(tpl.get("name")).lower(): tpl
                        for tpl in templates
                        if tpl and tpl.get("name")
                    }
                    logger.info(f"{len(templates_by_name)} template(s) de dictionnaire chargés")
            except Exception as fetch_error:
                logger.warning(f"Impossible de récupérer le dictionnaire {invoice_data.dictionary_id}: {fetch_error}")

        # Construire les tables avec leurs noms/template
        page_tables = []
        for table in page.tables:
            table_dict = {
                "rows": [
                    [{"text": cell.text, "box": cell.box} for cell in row]
                    for row in table.rows
                ],
                "box": table.box,
                "table_name": table.table_name or table.template_name,
                "template_name": table.template_name,
                "template_id": table.template_id,
            }
            page_tables.append(table_dict)

        if not page_tables:
            raise HTTPException(status_code=400, detail="Aucun tableau trouvé dans la page fournie")

        result = processor.process_invoice_tables_with_templates(page_tables, templates_by_name)
        unified_data = result.get("unified_data", {})
        structured_tables = result.get("tables", [])
        totals = processor.compute_totals(unified_data)

        response_data = {
            "dictionary": dictionary_info,
            "fileName": invoice_data.fileName or page.fileName,
            "pageNumber": page.page_number,
            "tables": structured_tables,
            "unifiedData": unified_data,
            "processingInfo": {
                "tableCount": len(page_tables),
                "totalConsumption": totals.get("total_consumption"),
                "totalAmount": totals.get("total_amount"),
                "hasTemplates": bool(templates_by_name),
            },
        }

        logger.info(
            f"Traitement terminé pour la page {page.page_number}: "
            f"{len(structured_tables)} tableau(x), total conso={totals.get('total_consumption')} "
            f"total montant={totals.get('total_amount')}"
        )
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors du traitement des tableaux (JSON): {str(e)}")
        logger.error(f"Type d'erreur: {type(e).__name__}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Erreur lors du traitement des tableaux: {str(e)}"
        )


@router.post("/analyze-energy-label")
async def analyze_energy_label(image: UploadFile = File(...)):
    """
    Analyse une image d'étiquette énergétique ou de plaque constructeur.
    Extrait les caractéristiques techniques et retourne un JSON structuré.
    """
    try:
        logger.info(f"Début de l'analyse de l'étiquette énergétique: {image.filename}")
        
        # Vérifier le type de fichier
        if not image.content_type or not image.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400, 
                detail="Le fichier doit être une image (JPEG, PNG, etc.)"
            )
        logger.info(f"Type de fichier: {image.content_type}")
        # Lire l'image
        image_bytes = await image.read()
        logger.info(f"Taille de l'image: {len(image_bytes)} bytes")
        # Convertir en base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                
        # Analyser avec Mistral Small via Bedrock (texte uniquement)
        characteristics = _analyze_energy_label_with_mistral(image_base64)
        logger.info(f"Caractéristiques extraites: {characteristics}")
        if not characteristics:
            raise HTTPException(
                status_code=500, 
                detail="Impossible d'extraire les caractéristiques de l'image"
            )
            
        # Préparer la réponse directement avec le JSON flexible
        response_data = {
            "fileName": image.filename,
            "characteristics": characteristics,
            "processing_info": {
                "file_size_bytes": len(image_bytes),
                "content_type": image.content_type,
                "extraction_successful": True
            }
        }
        
        logger.info(f"Analyse terminée avec succès pour: {image.filename}")
        return JSONResponse(content=response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur lors de l'analyse de l'étiquette énergétique: {str(e)}")
        logger.error(f"Type d'erreur: {type(e).__name__}")
        import traceback
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Erreur lors de l'analyse de l'étiquette énergétique: {str(e)}"
        )
@router.post("/process-hierarchy")
def process_hierarchy(hierarchy_data: Dict[str, Any]):
    """
    Traite la hiérarchie et complète les valeurs manquantes de averageConsumption.
    
    Règles:
    1. Si tous les enfants ont une valeur et le parent n'en a pas : parent = somme(enfants)
    2. Si le parent a une valeur et qu'il manque 1 seul enfant : enfant_manquant = parent - somme(autres_enfants)
    3. Ajoute totalChildrenConsumption à chaque nœud
    """
    try:
        payload = hierarchy_data or {}
        root = payload.get("hierarchy", {})
        nodes = root.get("hierarchy", [])
        logger.info("payload received", payload)
        

        def to_number(value: Any) -> Optional[float]:
            """Convertit une valeur en float, en gérant les unités"""
            if value is None:
                return None
            try:
                if isinstance(value, (int, float)):
                    return float(value)
                
                # Convertir en string et nettoyer
                s = str(value).strip()
                
                # Supprimer les unités courantes (°C, kWh, W, etc.)
                for unit in ['°C', '°F', 'kWh', 'kW', 'W', 'A', 'V', '%']:
                    s = s.replace(unit, '')
                
                # Remplacer virgule par point et nettoyer les espaces
                s = s.strip().replace(',', '.')
                
                return float(s)
            except (ValueError, TypeError):
                return None

        def process_node(node: Dict[str, Any]) -> None:
            """Traite un nœud et ses enfants récursivement"""
            children = node.get("children", [])
            
            # D'abord, traiter tous les enfants
            for child in children:
                process_node(child)
            
            # Récupérer les valeurs des enfants
            child_values = [to_number(c.get("averageConsumption")) for c in children]
            parent_value = to_number(node.get("averageConsumption"))
            
            # Règle 1: Parent manquant mais tous les enfants présents
            if parent_value is None and children and all(v is not None for v in child_values):
                node["averageConsumption"] = sum(child_values)
                parent_value = node["averageConsumption"]
            
            # Règle 2: Parent présent, exactement 1 enfant manquant
            if parent_value is not None and children:
                missing_count = sum(1 for v in child_values if v is None)
                if missing_count == 1:
                    known_sum = sum(v for v in child_values if v is not None)
                    missing_idx = next(i for i, v in enumerate(child_values) if v is None)
                    children[missing_idx]["averageConsumption"] = parent_value - known_sum
            
            # Calculer la somme des enfants pour information
            total_children = sum(
                to_number(c.get("averageConsumption")) or 0.0 
                for c in children
            )
            node["totalChildrenConsumption"] = total_children

        # Traiter tous les nœuds racines
        for node in nodes:
            process_node(node)

        logger.info(f"Hiérarchie traitée avec succès", payload)
        print(payload)
        return JSONResponse(content=payload)
        
    except Exception as e:
        logger.error(f"Erreur traitement hiérarchie: {type(e).__name__} - {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, 
            detail=f"Erreur lors du traitement de la hiérarchie: {str(e)}"
        )

