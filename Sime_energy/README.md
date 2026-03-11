# SIME Platform – Vue d'ensemble

Plateforme SIME (Système d'Information pour la Maîtrise de l'Énergie) destinée à la digitalisation des audits énergétiques pour CER2E. Le monorepo regroupe :

- **Backend** FastAPI qui ingère et normalise documents/mesures via supabase et services AWS (Textract, Bedrock Mistral).
- **Frontend** React/Vite (TypeScript) qui fournit l'espace de travail (dashboards, modules factures, mesures, inventaire, audits) connecté à Supabase.

## Sommaire
1. [Architecture du dépôt](#architecture-du-dépôt)
2. [Fonctionnalités principales](#fonctionnalités-principales)
3. [Stacks techniques & dépendances](#stacks-techniques--dépendances)
4. [Pré-requis](#pré-requis)
5. [Configuration des variables d'environnement](#configuration-des-variables-denvironnement)
6. [Installation & lancement](#installation--lancement)
7. [Workflows applicatifs](#workflows-applicatifs)
8. [Tests & qualité](#tests--qualité)
9. [Déploiement & opérations](#déploiement--opérations)
10. [Structure des dossiers](#structure-des-dossiers)
11. [Support](#support)

## Architecture du dépôt
```
Sime_energy/
├── sime-backend-main/   # API FastAPI (traitements, OCR, KPI, Supabase)
└── sime-front/          # SPA React/Vite + Tailwind + shadcn/ui
```
Les deux projets vivent côte à côte mais partagent la même base de données Supabase (PostgreSQL + Auth).

## Fonctionnalités principales
### Backend
- **Traitement de factures PDF** : upload, OCR Textract, normalisation via Bedrock/Mistral, mapping vers dictionnaires et insertion dans `audit_invoices` (Supabase).
- **Traitement de factures Excel** : parsing `openpyxl`, agrégations montants/dates, mise à jour Supabase.
- **Mesures énergétiques** : import CSV/Excel provenant de capteurs divers (Voltcraft, TH-30, Sentinel, etc.), calcul KPI (durée, consommation moyenne/pic), préparation données de graphiques.
- **Unification de tableaux** : `UnifiedInvoiceProcessor` reconnaît des signatures de tables, reconstruit un JSON unifié, exportable en Excel/JSON.
- **Analyse d'étiquettes énergétiques** : encodage base64 et extraction par modèle Mistral multimodal.
- **Hiérarchies énergétiques** : complétion des consommations manquantes dans des graphes hiérarchiques.

### Frontend
- **Authentification Supabase** (signup, login, reset password, invitations).
- **Gestion multi-modules** : Dashboard, Facturation (annotation & dictionnaires), Mesures, Inventaire, Audits, Paramètres, Compte.
- **Contextes globaux** : `AuthContext` et `OrganizationContext` synchronisés avec Supabase.
- **Upload & suivi** : services `invoiceService` et `measurementService` orchestrent les appels backend via React Query, affichent KPI, formulaires shadcn/ui.
- **UI dark** : Tailwind + shadcn/ui + Lucide icons (thème sombre, navigation latérale + entête).

## Stacks techniques & dépendances
| Couche | Principales libs |
| --- | --- |
| Backend | FastAPI, Uvicorn, SQLAlchemy, Pydantic 2, Supabase Python, boto3 (Textract/Bedrock), pandas, pdf2image, pytesseract, OpenCV, WeasyPrint |
| Frontend | React 18, Vite 5, TypeScript 5.8, React Router 6, TanStack Query 5, Supabase JS v2, Tailwind 3, shadcn/ui (Radix + Lucide), React Hook Form + Zod |
| DevOps | Python 3.10 (runtime.txt), bun pour le front, Supabase migrations (SQL) |

## Pré-requis
- Python **3.10**
- Node 18+ et **bun** (gestionnaire packages front)
- Accès Supabase (URL + clés `anon` et `service_role`)
- Identifiants AWS (Textract + Bedrock) autorisés sur les régions utilisées
- Tesseract & poppler installés localement si traitement PDF/images lourd (selon OS)

## Configuration des variables d'environnement
Créer deux fichiers `.env` (non versionnés) :

### Backend (`sime-backend-main/.env` – exemple minimal)
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1
LLM_MODEL=mistral.mistral-small-2402-v1:0
DATABASE_URL=postgresql://user:pass@host:5432/db
```
> `SUPABASE_SERVICE_ROLE_KEY` est requis pour les écritures (audit_invoices, annotation_dictionaries…).

### Frontend (`sime-front/.env` – déjà présent en exemple)
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_API_URL=http://127.0.0.1:8000/api/V1
```
Adapter selon l'URL du backend en développement ou production.

## Installation & lancement
### 1. Cloner & positionner sur le dossier racine
```
git clone <repo>
cd Sime_energy
```

### 2. Backend
```
cd sime-backend-main
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- Documentation interactive disponible sur `http://127.0.0.1:8000/docs`.
- Les routes sont préfixées par `/api/V1`.

### 3. Frontend
```
cd sime-front
bun install
bun dev --open
```
- L'application SPA écoute par défaut sur `http://localhost:5173`.
- Les appels API pointent vers `VITE_API_URL`.

## Workflows applicatifs
### Traitement factures (PDF)
1. Upload depuis le module Facturation (`uploadInvoiceFile`).
2. Backend :
   - Conversion PDF → images (`pdf2image`).
   - Textract analyse formulaires/tableaux (`_textract_analyze_bytes`).
   - Normalisation des entêtes via Bedrock/Mistral (`_normalize_with_llm`).
   - Extraction champs (`extract_invoice_fields`) et mise à jour/insertion Supabase (`audit_invoices`).
3. Front : restitution des pages, mappings vers dictionnaires/templates (`transformInvoiceTablesToJson`).

### Traitement mesures
1. Upload CSV/Excel depuis module Mesures (`uploadMeasurementFile`).
2. Backend : parser spécifique (Voltcraft, TH_30, Sentinel…), calcul KPI (`calculate_kpis`), préparation `chart_data`.
3. Front : affichage graphique + KPI, stockage éventuel.

### Annotation dictionnaires
- Les dictionnaires et templates sont gérés côté Supabase (`annotation_dictionaries`).
- `transformInvoiceTablesToJson` envoie les tables avec `table_name`/`template_id` pour aligner headers.

## Tests & qualité
- Pas encore de suite automatisée. Pour ajouter des tests backend : préférer `pytest` + `httpx`. Frontend : `vitest`/`react-testing-library`.
- Lint frontend via `bun lint` (ESLint 9). Tailwind & TypeScript stricts (tsconfig).
- Pas de lint configuré côté backend ; recommander `ruff`/`black`.

## Déploiement & opérations
- **Backend** : compatible déploiement Uvicorn/Gunicorn (voir `runtime.txt`). Besoin de variables AWS & Supabase sur l’environnement (Railway, Render, etc.).
- **Frontend** : build Vite (`bun run build`) puis déploiement statique (Vercel, Netlify, S3/CloudFront). `vercel.json` présent (config SSR désactivée, routes SPA).
- **Base de données** : Supabase. SQL bootstrap dans `sime-backend-main/scripts/sql` (`01_schema.sql`, seeds...).
- **Monitoring/logs** : `logging_config.py` pour FastAPI (format JSON prêt à être branché sur CloudWatch/ELK).

## Structure des dossiers
### Backend (`sime-backend-main`)
- `main.py` : création FastAPI, CORS, inclusion routes `app.api.V1`.
- `app/api/V1/processing/proccesing.py` : tous les endpoints métiers (factures, mesures, export Excel/JSON, hiérarchie, labels énergétiques).
- `app/core/` :
  - `auth.py` (vérification JWT Supabase),
  - `config.py` (prompts LLM, DB URL),
  - `llm.py` (clients Textract/Bedrock),
  - `utils.py` (helpers parsing CSV, KPI, conversions),
  - `unified_invoice_processor.py` (analyse structure des tables, signatures, compute totals).
- `app/schemas`, `app/crud` : modèles Pydantic/SQLAlchemy (à compléter selon besoins).
- `scripts/sql` : schéma & seeds Supabase/PostgreSQL.

### Frontend (`sime-front`)
- `src/App.tsx` : routing protégé, contextes globaux, layout (sidebar/header).
- `src/context/*` : Auth & Organization contexts.
- `src/services/*` : appels backend (factures, mesures, exports, audits).
- `src/components/*` : UI modulaires (audits, invoices, forms, etc.).
- `supabase/migrations/` : migrations SQL côté client.
- Config : `tailwind.config.ts`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`.

## Support
- **Product Owner** : Kevin (selon CLAUDE.md).
- Pour toute question technique : vérifier la documentation FastAPI (`/docs`), les migrations Supabase, ou contacter l’équipe backend/front correspondante.

> Ce README couvre l’ensemble du monorepo. Chaque sous-projet dispose d’un README minimaliste ; utilisez celui-ci comme référence principale.
