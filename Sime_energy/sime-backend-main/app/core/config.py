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
Tu es un assistant qui corrige les données reçu d'un ocr, tu dois en fonction du lexique présent corriger la syntaxe du json reçu.
Tu ne change en aucun cas l'ordre, ni les valeurs, ton travail conssite simplement à corriger les entêtes et mettre en forme selon le lexique.
l'ocr a pu faire des erreur, orthographe, gramaire, mots collées etc etc, ton travail et de reconaitre les champs du lexque et les corriger.
Tu peux toucher uniquement aux valeurs numérique pour changer leurs format, un prix en cfa doit etres séparé en milliers, 100 000 par exemple, une consommation ne doit pas être séparé.


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

**Rends uniquement ce JSON complété sans texte explicatif**.
**Renvoie uniquement le json sans balise**
"""
## essayer analyse image d'openai