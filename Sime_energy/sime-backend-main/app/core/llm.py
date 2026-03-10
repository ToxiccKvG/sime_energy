
import logging
# Configuration du logger
logger = logging.getLogger(__name__)
import boto3
from typing import List, Dict, Any
from trp import Document as TrpDocument
from app.core.config import PROMPT
import json
from app.core.utils import extract_and_parse_json
import os

from dotenv import load_dotenv
load_dotenv()

aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
aws_region = os.getenv("AWS_DEFAULT_REGION")

def _textract_analyze_bytes(image_bytes: bytes) -> dict:
    session = boto3.Session(aws_access_key_id=aws_access_key, aws_secret_access_key=aws_secret_key, region_name=aws_region)
    textract = session.client('textract')
    response = textract.analyze_document(
        Document={'Bytes': image_bytes},
        FeatureTypes=["FORMS", "TABLES"]
    )
    print(response)
    return response

def _parse_trp(response: dict, image_width: int, image_height: int) -> Dict[str, Any]:
    doc = TrpDocument(response)
    forms: List[Dict[str, Any]] = []
    tables: List[List[List[Dict[str, Any]]]] = []
    for page in doc.pages:
        # Forms
        for field in page.form.fields:
            if not field or not getattr(field, 'value', None) or not field.value.text:
                continue
            kv = {
                "Key": field.key.text if field.key else None,
                "Value": field.value.text,
            }
            # Coordinates kept internally but we won't forward to Mistral
            if field.value and field.value.geometry and field.value.geometry.boundingBox:
                bb = field.value.geometry.boundingBox
                # Calculate original coordinates
                x1_orig = bb.left * image_width
                y1_orig = bb.top * image_height
                x2_orig = x1_orig + bb.width * image_width
                y2_orig = y1_orig + bb.height * image_height
                
                # Apply symmetric padding (adjust this value as needed)
                padding = 2
                x1 = max(0, x1_orig - padding)
                y1 = max(0, y1_orig - padding)
                x2 = min(image_width, x2_orig + padding)
                y2 = min(image_height, y2_orig + padding)
                
                kv["box"] = [x1, y1, x2, y2]
            forms.append(kv)
        # Tables
        for table in page.tables:
            table_data = {"rows": [], "box": None}
            
            # Add table bounding box
            if table.geometry and table.geometry.boundingBox:
                bb = table.geometry.boundingBox
                tx1 = bb.left * image_width
                ty1 = bb.top * image_height
                tx2 = tx1 + bb.width * image_width
                ty2 = ty1 + bb.height * image_height
                table_data["box"] = [tx1, ty1, tx2, ty2]
            
            # Add table rows
            table_rows: List[List[Dict[str, Any]]] = []
            for row in table.rows:
                row_cells: List[Dict[str, Any]] = []
                for cell in row.cells:
                    cell_entry = {"text": cell.text}
                    if cell.geometry and cell.geometry.boundingBox:
                        bb = cell.geometry.boundingBox
                        # Calculate original coordinates
                        cx1_orig = bb.left * image_width
                        cy1_orig = bb.top * image_height
                        cx2_orig = cx1_orig + bb.width * image_width
                        cy2_orig = cy1_orig + bb.height * image_height
                        
                        # Apply symmetric padding (same as forms)
                        padding = 2
                        cx1 = max(0, cx1_orig - padding)
                        cy1 = max(0, cy1_orig - padding)
                        cx2 = min(image_width, cx2_orig + padding)
                        cy2 = min(image_height, cy2_orig + padding)
                        
                        cell_entry["box"] = [cx1, cy1, cx2, cy2]
                    row_cells.append(cell_entry)
                table_rows.append(row_cells)
            
            table_data["rows"] = table_rows
            tables.append(table_data)
    return {"forms": forms, "tables": tables}

def _normalize_with_llm(clean_payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Use Amazon Bedrock to call an LLM. Input and output must keep the SAME structure
    and order as provided: { forms: [{Key, Value}], tables: [["text"]] }.
    The model should only correct header naming typos; not reorder or change values.
    """
    bedrock_model_id = os.getenv("LLM_MODEL", "mistral.mistral-small-2402-v1:0")
    prompt = (PROMPT + f"JSON:\n{json.dumps(clean_payload, ensure_ascii=False)}")
    try:
        brt = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))
        body = {
            "prompt": prompt,
            "max_tokens": 2048,
            "temperature": 0.0,
        }
        resp = brt.invoke_model(
            modelId=bedrock_model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body)
        )
        payload = resp["body"].read().decode("utf-8")            # ou body.read()
        

        try:
            parsed_payload = json.loads(payload)
            print("payload is", parsed_payload)
            text = parsed_payload.get("output_text") or parsed_payload.get("generation") or payload
        except Exception:
            text = payload
        data = extract_and_parse_json(text)
        if isinstance(data, dict) and "forms" in data and "tables" in data:
            return data
        return clean_payload
    except Exception as e:
        print("error mistral: ",e)
        return clean_payload

def _analyze_energy_label_with_mistral(image_base64: str) -> Dict[str, Any]:
    """
    Analyse d'étiquette énergétique/plaques constructeur via Mistral Small (texte seulement).
    On passe l'image encodée en base64 dans le prompt. La sortie doit être UNIQUEMENT un JSON.
    """
    instructions = (
        "Tu es un expert des étiquettes énergétiques et plaques constructeur. "
        "Analyse l'image encodée en base64 ci-dessous et extrais les caractéristiques techniques. "
        "Règles de sortie: 1) Retourne UNIQUEMENT un JSON valide; 2) Aucun commentaire ni texte autour; "
        "3) Conserve les valeurs telles qu'affichées; 4) Clés en français en minuscules, espaces autorisés; "
        "5) Inclure uniquement les champs trouvés."
    )

    # On injecte la chaîne base64 dans le message. Mistral Small est un modèle texte,
    # il ne prend pas d'images natives en entrée sur Bedrock.
    user_message = (
        f"{instructions}\n\n"
        f"Exemples de clés possibles (indicatif, facultatif): performance energetique, puissance, tension, amperage, frequence, "
        "efficacite, classe energetique, consommation annuelle, marque, modele, type appareil, capacite, dimensions, poids, "
        "temperature fonctionnement, humidite fonctionnement, certification, norme, pays origine, annee fabrication, duree vie, garantie."
    )

    try:
        brt = boto3.client("bedrock-runtime", region_name=os.getenv("AWS_REGION", "us-east-1"))
        body = {
            "messages" : [
                {
                "role" : "user",
                "content" : [
                    {
                    "text": user_message,
                    "type": "text"
                    },
                    {
                    "type" : "image_url",
                    "image_url" : {
                        "url" : f"data:image/png;base64,{image_base64}"
                    }
                    }
                ]
                }
            ],
            "max_tokens" : 2048
            }
        resp = brt.invoke_model(
            modelId="us.mistral.pixtral-large-2502-v1:0",
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body)
        )
        logger.info(f"Réponse Bedrock: {resp}")
        # Les réponses Mistral sur Bedrock arrivent souvent sous outputs[0].text
        payload = json.dumps(json.loads(resp.get('body').read()), indent=4)
        try:
            parsed = json.loads(payload)
            text = (
                parsed.get("outputs", [{}])[0].get("text")
                if isinstance(parsed, dict) else payload
            )
        except Exception:
            text = payload

        data = extract_and_parse_json(text)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.error(f"Erreur lors de l'analyse avec Mistral Small: {str(e)}")
        return {}