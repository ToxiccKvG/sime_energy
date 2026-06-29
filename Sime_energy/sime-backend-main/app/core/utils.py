import json
import re
from PIL import Image
from typing import Dict, List, Any
import base64
import logging
import io

# Configuration du logger
logger = logging.getLogger(__name__)


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
