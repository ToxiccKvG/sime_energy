import re
import unicodedata
from typing import Dict, List, Optional, Any
from datetime import datetime

_DATE_JMA = re.compile(r"^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})")

_DATE_AMJ = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})")

def normaliser_date(valeur: Any) -> Optional[str]:
    """Date OCR ou Excel → 'AAAA-MM-JJ' (format attendu par les colonnes date), None si illisible.

    Accepte JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA et AAAA-MM-JJ, avec ou sans heure, ainsi que
    les objets date / datetime / Timestamp.
    """
    if valeur is None:
        return None
    if hasattr(valeur, "strftime"):
        try:
            return valeur.strftime("%Y-%m-%d")
        except ValueError:  # NaT
            return None
    texte = str(valeur).strip()
    for motif, ordre in ((_DATE_AMJ, (0, 1, 2)), (_DATE_JMA, (2, 1, 0))):
        m = motif.match(texte)
        if m:
            parties = m.groups()
            annee, mois, jour = (int(parties[i]) for i in ordre)
            try:
                return datetime(annee, mois, jour).strftime("%Y-%m-%d")
            except ValueError:
                return None
    return None

def _cle_normalisee(cle: Any) -> str:
    """Clé OCR comparable, qu'elle vienne du LLM (« RAISON_SOCIALE ») ou brute de Textract
    (« Raison sociale : ») : minuscules, sans accents, ponctuation et espaces → « _ »."""
    texte = unicodedata.normalize("NFD", str(cle or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", texte).strip("_")

# Clés de date propres à la facture, par ordre de préférence ; les dates de période ou
# d'échéance ne doivent jamais être prises pour la date de facture.
_CLES_DATE_FACTURE = ["date_facture", "date_comptable", "invoice_date"]

_CLES_DATE_EXCLUES = ["debut", "fin", "limite", "periode", "echeance"]

def _date_facture_depuis_formulaires(forms: List[Dict]) -> Optional[str]:
    cles = [(_cle_normalisee(f.get("Key")), f.get("Value") or "") for f in forms]
    for cle_voulue in _CLES_DATE_FACTURE:
        for cle, valeur in cles:
            if cle_voulue in cle and normaliser_date(valeur):
                return normaliser_date(valeur)
    for cle, valeur in cles:
        if "date" in cle and not any(ex in cle for ex in _CLES_DATE_EXCLUES) and normaliser_date(valeur):
            return normaliser_date(valeur)
    return None

def extract_invoice_fields(forms: List[Dict], tables: List[Dict], llm_fields: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Extract key fields from forms and tables for invoice processing.

    Priority:
      1. llm_fields  — direct extraction by the LLM (recovers what Textract missed)
      2. Pattern matching on normalized form keys (UPPER_SNAKE_CASE after .lower())
    """
    extracted = {
        "supplier": None,
        "invoice_date": None,
        "amount": None,
        "confidence_score": 0,
    }

    # 1. Use LLM-extracted fields as primary source
    if llm_fields:
        supplier = llm_fields.get("supplier")
        if supplier and str(supplier).strip():
            extracted["supplier"] = str(supplier).strip()

        extracted["invoice_date"] = normaliser_date(llm_fields.get("invoice_date"))

        amount = llm_fields.get("amount")
        if amount is not None:
            try:
                extracted["amount"] = float(str(amount).replace(" ", "").replace(",", "."))
            except (ValueError, TypeError):
                pass

    # 2. Fall back to pattern matching for any field still missing
    for form in forms:
        key = _cle_normalisee(form.get("Key"))  # « RAISON_SOCIALE » (LLM) ou « Raison sociale » (Textract brut)
        value = form.get("Value", "")

        if extracted["supplier"] is None:
            if any(k in key for k in ["raison_sociale", "nom_raison", "fournisseur", "supplier", "vendor"]):
                extracted["supplier"] = value.strip() or None

        if extracted["amount"] is None:
            # Exclude partial-amount keys and arrears-only fields
            # "solde_global" / "solde" = arriérés seuls (pas le montant courant)
            _exclude = ["tva", "_ht", "majoration", "timbre", "redevance", "arrondi", "depassement", "perte",
                        "solde_global", "solde"]
            _match = any(k in key for k in ["montant_ttc", "montant_total_ttc", "total_ttc", "total_facture",
                                             "montant_facture", "total_sommes_dues", "net_a_payer"])
            _loose = (("total" in key or "montant_total" in key) and not any(ex in key for ex in _exclude))
            if _match or _loose:
                try:
                    amount_str = re.sub(r'[^\d., ]', '', value).replace(" ", "").replace(",", ".")
                    parsed = float(amount_str)
                    # Sanity check: reject if value is suspiciously large (> 10 billion FCFA)
                    if parsed < 10_000_000_000:
                        extracted["amount"] = parsed
                except (ValueError, TypeError):
                    pass

    if extracted["invoice_date"] is None:
        extracted["invoice_date"] = _date_facture_depuis_formulaires(forms)

    # Confidence: based on the 3 key fields
    fields_found = sum(1 for v in [extracted["supplier"], extracted["invoice_date"], extracted["amount"]] if v is not None)
    extracted["confidence_score"] = round(min(100, (fields_found / 3) * 100))

    return extracted
