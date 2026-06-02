import os

# Database Configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://admin:secret@192.168.1.62:5432/postgres"
)

from pydantic_settings import BaseSettings

# class Settings(BaseSettings):
#     SUPABASE_URL: str
#     SUPABASE_JWT_SECRET: str  # Récupère cette clé depuis Supabase
    
#     class Config:
#         env_file = ".env"

# settings = Settings()

#TODO: Ici le llm doit plutot corrgier les données et non extraire pas de sections, mais les noms des champs qu'ils doit corriger, il ne doit pas changer la forme, l'ordre ou les valeurs qu'il reçoit uniquement corriger le texte. donc pas de format de json à lui montrer il doit ressortir le json qu'on lui a envoyé
PROMPT = """
Tu es un assistant qui corrige les données reçues d'un OCR de factures. En fonction du lexique ci-dessous, corrige les clés (Key) du JSON reçu.

Règles strictes :
1. Tu ne changes PAS l'ordre des éléments, ni les valeurs.
2. Tu corriges uniquement les clés (Key) selon le lexique — reconnais-les même avec fautes, majuscules/minuscules, apostrophes parasites, espaces en trop, tirets, caractères spéciaux OCR.
3. Les apostrophes, guillemets, deux-points ou autres artefacts OCR dans une clé (ex: "MONTANT TOTAL':" ou "DATE :") doivent être supprimés et la clé normalisée (ex: "MONTANT_TTC", "DATE_COMPTABLE_FACTURE").
4. Pour les valeurs numériques uniquement : un prix en FCFA doit être séparé en milliers (ex: 100 000), une consommation ne doit pas être séparée.


voici le lexique: 
"NUMERO_COMPTE_CONTRAT": "", // "Numero Compte Contrat" / "N° Compte de contrat"
"POLICE": 0, // "Ancienne Police SIC" pas toujours applicable
"NOM_OU_RAISON_SOCIALE": "", // "Partenaire (Texte)" / "NOM OU RAISON SOCIALE"
"RUE": "", // "Adresse" / "ADRESSE PRESENTATION"
"NUMERO_COMPTEUR": "" // "Numero de serie (Numero compteur)"

"NUMERO_FACTURE": 0, // "FACTURE N°"
"DATE_COMPTABLE_FACTURE": "", // "DATE"
"PERIODE_DU": "", // "Date Debut Periode Facturation (SAP)" / "PERIODE DU"
"PERIODE_AU": "", // "Date Fin Periode Facturation (SAP)" / "AU"
"NBR_JOURS": 0, // "Nb Jour Facturation" / "nombre de jours (n)" / "NOMBRE DE JOURS (N)"
"MONTANT_TTC": 0 // "Montant Facture TTC" / "Montant total TTC" / "MONTANT TOTAL"

"PUISSANCE_SOUSCRITE": 0, // "Puissance Souscrite" / "Puissance souscrite(Kw)" / "puissance souscrite (w)"
"MONTANT_REDEVANCE": 0, // "Montant Redevance" / "montant redevance" / "REDEVANCE"
"TAXE_COMMUNALE": 0, // "Taxe communale" / "TCO (2,5%)"
"MONTANT_TVA": 0 // "Montant TVA" / "TVA (18%)"

"TYPE_TARIF_NUMERO": null, // "Type de Tarif (Numero)"
"TYPE_TARIF_TEXTE": null, // "Type de Tarif (Texte)" / "TARIF (transcription de tarif)"
"COSINUS_PHI": null, // "Valeur cosinus phi" / "Cosinus phi"
"TYPE_COMPTAGE": null, // "TYPE COMPTAGE" / "TYPE DE COMPTAGE"
"RAPPORT_TI": null, // "RAPPORT TC"
"RAPPORT_TP": null, // "RAPPORT TP"
"PUISSANCE_MAX_RELEVEE": null, // "Puissance MAX Relevee" / "Puissance max relevée (Pmax)"
"DEPASSEMENT_MAX": null, // "Dépassement MAX" / "Dépassement"
"ALPHA_A": null, // "lettre ALPHA A" / "Alpha"
"BETA_A": null, // "lettre BETA A" / "Beta"
"ALPHA_R": null, // "lettre ALPHA R"
"BETA_R": null, // "lettre BETA R"
"GAMMA": null, // "lettre Gamma"
"EPSILON": null, // "lettre Epsilon"
"TAUX_PRIME_FIXE": null, // "TAUX P FRIXE" / "Taux Prime fixe mensuelle"
"MONTANT_PRIME_FIXE": null, // "Montant Prime Fixe" / "montant Prime fixe mensuelle"
"MONTANT_K1": null, // "Montant Energie K1" / "Montant energie K1"
"MONTANT_K2": null, // "Montant Energie K2" / "Montant energie K2"
"MONTANT_HTVA": null, // "Montant Hors TVA" / "Montant total ht"
"PUISSANCE_TRANSFO": null // "PUIS. TRANSF01" / "Puissance transfo"


"AI_CG": null, // "ANCIEN INDEX (AI)"
"NI_CG": null, // "NOUVEL INDEX"
"CONSOMMATION_KWH": null, // "Consommation Total (KWH)" / "CONSOMMATION (KWH)"
"MONTANT_TOTAL_ENERGIE": null, // "Montant Total Energie" / "Montant total (tableau)"

// Champs spécifiques des tableaux de consommation
"CONS_INDEX_K1": null, // "cons index K1" - Consommation index K1
"CONS_INDEX_K2": null, // "cons index K2" - Consommation index K2  
"TOTAL_CONSOMMATION": null, // "total consommation" - Total consommation
"TOTAL_ENERGIE_ACTIVE": null, // "total energie active" - Total énergie active à facturer

// Champs énergie réactive
"NI_EREACT": null, // "NI_EReact" - Nouvel Index Energie Réactive
"AI_EREACT": null, // "AI_EReact" - Ancien Index Energie Réactive

// Champs heures transformateur/condensateurs
"CONS_H1": null, // "cons H1" - Consommation H1 (Heures Transformateur)
"CONS_H2": null // "cons H2" - Consommation H2 (Heures Condensateurs)

// Pertes d'énergie active
"PERTE_ACTV_K1": null, // "perte actv K1" - Perte active K1
"PERTE_ACTV_K2": null, // "perte actv K2" - Perte active K2
"PERTE_ACTV_TOT": null, // "perte actv tot" - Perte active totale

// Pertes d'énergie réactive
"PERTE_REACT": null, // "perte react" - Perte réactive

// Majorations diverses
"MAJORATION_K1": null, // Majoration K1
"MAJORATION_K2": null, // Majoration K2
"MAJORATION_TOTALE": null // Majoration totale

La structure de sortie JSON doit TOUJOURS être:
{
  "forms": [...mêmes formes avec clés normalisées selon le lexique ci-dessus...],
  "tables": [...mêmes tableaux avec valeurs corrigées...],
  "invoice_fields": {
    "supplier": "<NOM_OU_RAISON_SOCIALE — extrais-le directement depuis tout le contenu visible (forms + tables), même si Textract l'a mal structuré>",
    "invoice_date": "<DATE_COMPTABLE_FACTURE au format YYYY-MM-DD si possible, sinon telle quelle>",
    "amount": <montant total à payer — règle stricte : utilise "TOTAL DES SOMMES DUES (1)+(2)" si présent (inclut arriérés), sinon "TOTAL FACTURE (1)" ou "NET A PAYER". JAMAIS "SOLDE GLOBAL (2)" (arriérés seuls) ni un sous-total partiel>,
    "invoice_number": "<NUMERO_FACTURE>"
  }
}

**Rends uniquement ce JSON sans texte explicatif ni balise markdown**.
"""
## essayer analyse image d'openai