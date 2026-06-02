# sime-backend-main

Backend FastAPI du projet **SIMEE** (Système Intégré de Management de l'Efficacité Énergétique) — CER2E.

Responsable du traitement de fichiers (OCR factures, parsing CSV mesures, analyse étiquettes), du calcul de KPIs énergétiques et de la synthèse IA des audits. Se connecte directement à l'instance Supabase du frontend (même projet).

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | FastAPI 0.116 + Uvicorn |
| Python | 3.10+ |
| OCR | AWS Textract (factures PDF) + Mistral via AWS Bedrock (étiquettes) |
| IA synthèse | DeepSeek Chat API |
| Parsing CSV/XLS | Pandas 2.3 + chardet + openpyxl |
| Base de données | Supabase (client Python `supabase==2.24`) |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | Supabase JWT (gérée côté frontend) |

---

## Structure du projet

```
sime-backend-main/
├── main.py                          # Point d'entrée FastAPI, config CORS, port 5000
├── logging_config.py                # Configuration du logging
├── requirements.txt
├── runtime.txt                      # python-3.10
├── app/
│   ├── api/
│   │   └── V1/
│   │       ├── __init__.py          # Montage des routers (/processing, /ai)
│   │       ├── processing/
│   │       │   └── proccesing.py    # Tous les endpoints de traitement de fichiers
│   │       └── ai/
│   │           └── router.py        # Endpoint synthèse IA (DeepSeek)
│   ├── core/
│   │   ├── config.py                # Variables d'env + prompt OCR normalization
│   │   ├── llm.py                   # Wrappers AWS Textract, Mistral Bedrock
│   │   ├── utils.py                 # Parsers CSV (Voltcraft, TH30, etc.), calcul KPIs
│   │   ├── unified_invoice_processor.py  # Processeur factures multi-pages
│   │   ├── auth.py                  # Helpers JWT Supabase
│   │   └── database.py              # Config SQLAlchemy (legacy, non utilisé en prod)
│   ├── crud/                        # CRUD SQLAlchemy (legacy — non utilisé en prod)
│   │   └── *.py
│   └── schemas/                     # Schémas Pydantic legacy
│       └── *.py
└── scripts/
    └── sql/
        └── 01_schema.sql            # Schéma de référence legacy — NE PAS appliquer en prod
```

> **Note:** Les dossiers `crud/` et `schemas/` sont un legacy SQLAlchemy non utilisé en production. Toutes les opérations DB passent par le client Supabase Python directement dans `proccesing.py`.

---

## Installation

```bash
cd sime-backend-main

# Créer le venv
python3 -m venv .venv
source .venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt
```

### Dépendances système requises

```bash
# Ubuntu/Debian (WSL inclus)
sudo apt install poppler-utils tesseract-ocr
```

---

## Variables d'environnement

Créer un fichier `.env` à la racine de `sime-backend-main/` :

```env
# Supabase — même projet que le frontend
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   # clé service_role (pas anon)

# DeepSeek — synthèse IA des audits
DEEPSEEK_API_KEY=<your_deepseek_api_key>

# AWS — OCR factures (Textract + Mistral Bedrock)
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_DEFAULT_REGION=us-east-1

# Optionnel
PORT=5000
```

> `SUPABASE_SERVICE_ROLE_KEY` est obligatoire (pas la clé `anon`) : le backend écrit directement dans `audit_invoices` en contournant les RLS.

---

## Démarrage

```bash
# Avec rechargement automatique (dev)
.venv/bin/uvicorn main:app --reload --port 5000

# Sans rechargement (prod)
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 5000
```

- API : `http://localhost:5000`
- Swagger UI : `http://localhost:5000/docs`
- ReDoc : `http://localhost:5000/redoc`

---

## Endpoints

Préfixe global : `/api/V1`

### `/processing` — Traitement de fichiers

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/processing/pdf-invoices` | OCR factures PDF (Textract + Mistral) → persiste dans `audit_invoices` |
| `POST` | `/processing/measures` | Parse CSV de mesures selon le type de capteur → retourne données + KPIs |
| `POST` | `/processing/analyze-energy-label` | OCR image étiquette énergie ou plaque constructeur (Mistral) |
| `POST` | `/processing/process-hierarchy` | Calcul propagation consommation dans une hiérarchie de nœuds |
| `POST` | `/processing/invoice-tables-to-excel` | Génère un fichier Excel à partir des tableaux d'une facture |
| `POST` | `/processing/invoice-tables-to-json` | Retourne les tableaux d'une facture en JSON structuré |

#### `POST /processing/pdf-invoices`

```
Content-Type: multipart/form-data
Champs:
  - file        : fichier PDF
  - file_name   : nom du fichier (string)
  - invoice_id  : UUID de l'entrée dans audit_invoices
```

Pipeline : PDF → images par page → AWS Textract → normalisation clés via LLM (Mistral) → write `audit_invoices` dans Supabase.

#### `POST /processing/measures`

```
Content-Type: multipart/form-data
Champs:
  - file         : fichier CSV ou XLSX
  - sensor_type  : type de capteur (voir valeurs ci-dessous)
```

Types de capteurs supportés :

| `sensor_type` | Format | Description |
|---|---|---|
| `89_VOLTCRAFT` | CSV | Analyseur de puissance Voltcraft |
| `TH_30` | CSV | Capteur température/humidité TH-30 |
| `SMART_ENERGY_METER` | CSV | Compteur énergie Smart |
| `RHT_10` | TXT | Capteur RHT-10 |
| `8_SENTINEL` | XLSX | Enregistreur Sentinel (Excel) |

> **Limitation actuelle :** cet endpoint retourne les données parsées et les KPIs mais **ne persiste pas** en Supabase. La sauvegarde dans `audit_measurements` est à implémenter côté frontend (Sprint 3).

#### `POST /processing/analyze-energy-label`

```
Content-Type: multipart/form-data
Champs:
  - image : fichier image (JPEG, PNG)
```

Retourne un JSON flexible avec les caractéristiques techniques extraites de l'étiquette.

#### `POST /processing/process-hierarchy`

```json
{
  "hierarchy": {
    "hierarchy": [ /* arbre de nœuds avec averageConsumption */ ]
  }
}
```

Applique 2 règles de propagation :
1. Nœud parent manquant + tous enfants renseignés → parent = somme(enfants)
2. Parent renseigné + 1 seul enfant manquant → enfant = parent - somme(autres)

### `/ai` — Intelligence artificielle

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/ai/synthesize-audit` | Génère un rapport de synthèse structuré (6 sections) via DeepSeek |

#### `POST /ai/synthesize-audit`

```json
{ "context": "<JSON stringifié des données complètes de l'audit>" }
```

Retourne :

```json
{
  "observations_generales": "...",
  "inventaire": "...",
  "mesures": "...",
  "facturation": "...",
  "recommandations": "...",
  "conclusions": "..."
}
```

Modèle : `deepseek-chat` · Température : 0.3 · Max tokens : 4096
Contexte expert : audit énergétique Sénégal (réseau SENELEC 230V/50Hz, seuil confort 24°C, FCFA).

---

## Limites actuelles & TODO

| Item | Statut |
|---|---|
| `POST /measures` ne persiste pas en Supabase | A faire (Sprint 3) |
| `audit_levels`, `audit_rooms`, `audit_equipment` pas encore couverts par le backend | A faire (Sprint 2) |
| `crud/` et `schemas/` legacy SQLAlchemy non connectés à la prod | Ignorer |
| `DATABASE_URL` dans `config.py` pointe sur une IP locale legacy | Non utilisé en prod |
| Auth JWT Supabase implémentée dans `core/auth.py` mais non appliquée sur les routes | Tous les endpoints sont actuellement publics |
