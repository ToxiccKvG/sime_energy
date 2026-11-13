import json
import re
from PIL import Image
from typing import Dict, List, Any
import base64
import io

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
