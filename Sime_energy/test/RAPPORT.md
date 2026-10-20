# Rapport de tests — 2026-10-19

## Résultats

| Suite | Réussis | Échoués | Total |
|---|---|---|---|
| Frontend unitaire | 98 | 16 | 114 |
| Frontend système | 6 | 10 | 16 |
| Backend unitaire | 51 | 3 | 54 |
| Backend système | 20 | 23 | 43 |
| **Total** | **175** | **52** | **227** |

Chaque échec a été vérifié : 51 correspondent aux bugs ci-dessous. Le dernier (analyse d'étiquette énergie)
est bloqué par le **quota journalier AWS Bedrock épuisé** (« Too many tokens per day ») ; il faudra le relancer.

Ce qui fonctionne de bout en bout : créer / rechercher / modifier / supprimer un projet ; import Excel SENELEC
(correspondance des colonnes, aperçu, enregistrement) ; hiérarchie d'inventaire Site → Zone → Bâtiment → Étage → Pièce ;
paramètres de facturation enregistrés en base ; mesures Voltcraft, TH30, RHT10 (UTF-8 et Latin-1) ; hiérarchie de
consommation ; tableaux de facture → JSON / Excel ; synthèse d'audit et chat Benjamin (DeepSeek) ; simulateur
(barème cos φ, tranches, TVA, TCO, WOYOFAL, quarantaine).

## Suivi des corrections

### Tests backend complémentaires — 2026-10-20

**Bugs 29 à 33 corrigés le jour même** (feu vert de Kevin) :
- 29 : en-tête introuvable → valeur par défaut ;
- 30 : nombres avec unités et séparateurs français (`_safe_to_number`) ;
- 31 : dates via `normaliser_date` ;
- 32 : lignes vides ignorées ;
- 33 : clés OCR normalisées (`_cle_normalisee`), avec ou sans LLM.

Après correction : **backend 132 / 133** (unitaire 82/82), **front 130/130 + 16/16**. Seul échec : l'étiquette énergie (quota Bedrock).

Constat initial :

Nouveaux tests sur des parties jamais couvertes : parsing Textract sur une **vraie réponse** capturée (`fixtures/textract_facture.json`), tableaux de puissance, de tarification détaillée et croisés, templates de dictionnaire (`excelMappings`), vrai dictionnaire via l'API, validation des entrées IA.
Résultat backend : **125 / 133**. Les 7 échecs nouveaux correspondent à 5 bugs ; le 8e est l'étiquette énergie, toujours bloquée par Bedrock.

| # | Prio | Bug | Preuve | Où |
|---|---|---|---|---|
| 29 | 🔴 | Template : si l'en-tête de ligne demandé est absent, le code renvoie **la valeur d'une autre ligne** au lieu de la valeur par défaut (« Rappel » reçoit le montant K1) — donnée fausse silencieuse | `test_valeur_par_defaut` | `unified_invoice_processor.py:536-539` |
| 30 | 🔴 | Transformation `number` : `"2 238 200 FCFA"` / `"20 000 kWh"` → `None` (l'unité casse la conversion) | `test_transformation_nombre_avec_unite` + API | `unified_invoice_processor.py:_safe_to_number` |
| 31 | 🔴 | Transformation `date` : `"05/03/2024"` → **3 mai** (lecture américaine) | `test_transformation_date_francaise` | `unified_invoice_processor.py:_apply_transform` |
| 32 | 🟠 | Tableau de tarification détaillée : une ligne vide fait planter le traitement (`IndexError`) | `test_tarification_detaillee_ligne_vide` | `unified_invoice_processor.py:332` |
| 33 | 🔴 | Sans normalisation LLM (Bedrock indisponible, **cas actuel**), le fournisseur n'est jamais extrait : les clés Textract brutes (`"Raison sociale "`) ne correspondent pas aux motifs `raison_sociale` | `test_champs_cles_sans_llm` | `app/core/utils.py:extract_invoice_fields` |

**Environnement :** le quota journalier AWS Bedrock reste épuisé (Mistral Small et Pixtral), plus de 24 h après. Quelques tests ont suffi à l'épuiser, ce qui laisse penser qu'il est très bas. L'utilisateur IAM `app-sime` n'a pas le droit de lire ses quotas : à vérifier dans la console AWS (Service Quotas → Amazon Bedrock → tokens par jour). En production, l'OCR tourne alors **sans normalisation**, en silence (voir bug 33).

### Lot backend — 2026-10-19

Bugs **2, 3, 4, 6, 7, 24 à 28** corrigés, plus le montant de l'import Excel (somme des « Montant Facture TTC », sans × 1 000 000).

| Suite | Avant | Après |
|---|---|---|
| Backend unitaire | 51 / 54 | **66 / 66** (+12 tests de dates) |
| Backend système | 20 / 43 | **45 / 46** (+6 tests de sécurité) |
| Frontend système | 14 / 16 | **16 / 16** |

- **Authentification** : jeton Supabase exigé partout, validé par Supabase Auth (`app/core/auth.py`, cache de 60 s). Le `SUPABASE_JWT_SECRET` du `.env` ne correspond plus à la clé de signature réelle : il n'est plus utilisé. `AUTH_REQUIRED=false` permet une transition de déploiement.
- **Appartenance** : une facture ou un dictionnaire d'une autre organisation → 403 ; une facture inexistante → 404. Le contrôle a lieu avant toute écriture.
- **CORS** : limité à `FRONTEND_URL` + `CORS_EXTRA_ORIGINS`.
- Le front envoie le jeton sur ses 8 appels au backend (`services/backend-client.ts`).

Seul échec restant : `test_analyse_etiquette_energie`, à cause du **quota AWS Bedrock épuisé**. À relancer avec la facture PDF (normalisation Mistral) quand le quota sera revenu.

### Lot frontend — 2026-10-19

**Lot frontend corrigé le 2026-10-19** (plan `warm-baking-brook`) : bugs **1, 5 (front), 8 à 23** + création d'organisation par l'Admin + unicité SENELEC par organisation.
Migration appliquée : `sime-front/supabase/migrations/20261019_notes_seuils_unicite_senelec.sql`.
Seule modification backend : route `/excel-invoices` (préfixe en double supprimé).

| Suite | Avant | Après |
|---|---|---|
| Frontend unitaire | 98 / 114 | **130 / 130** (+16 tests `senelec-rules`) |
| Frontend système | 6 / 16 | **14 / 16** |
| Contrat front/back | 6 / 9 | **8 / 8** (`invite-service` supprimé) |

Les 2 parcours système restants échouent maintenant **proprement** (facture passée à « Rejetée », message affiché) à cause de bugs backend :
- facture PDF → bug **2** (date « 15/03/2024 » refusée par Postgres) ;
- facture Excel → **nouveau bug 28** : `/excel-invoices` écrit `confidence_score = 0.0` (flottant) dans une colonne entière → `invalid input syntax for type integer` (`proccesing.py:377`).

Changement de règle produit : le type de bâtiment est désormais **obligatoire** (bug 18) ; le test système correspondant a été réécrit en conséquence.

Restaient ouverts à ce stade : 2, 3, 4, 6, 7, 24 à 28 (traités par le lot backend ci-dessus).

## Bugs — état initial du 2026-10-19

Priorité : 🔴 bloquant ou données fausses · 🟠 fonctionnalité dégradée · 🟡 mineur.
« Zone Pharci » = `components/invoices/`.

### Bloquants

| # | Prio | Bug | Preuve | Où |
|---|---|---|---|---|
| 1 | 🔴 | **Aucun message sonner ne s'affiche** : le `<Toaster />` sonner n'est monté nulle part. 28 fichiers (Projets, Facturation, Quarantaine, Inventaire, Paramètres…) affichent leurs succès et erreurs avec `toast` de sonner : l'utilisateur ne voit rien. Existait déjà au commit `9b34e948`. | E2E « supprimer un projet » | `sime-front/src/App.tsx:55` |
| 2 | 🔴 | **Factures PDF bloquées « En attente »** : la date OCR « 15/03/2024 » est écrite telle quelle dans une colonne `date` → Postgres refuse → la facture n'est jamais mise à jour. | E2E + `test_facture_pdf_une_page` | `proccesing.py:215` (et `:268`) — convertir en ISO avant l'écriture |
| 3 | 🔴 | **Aucun endpoint n'exige de jeton**, alors que la doc de l'API l'annonce. N'importe qui peut écrire dans `audit_invoices` avec la clé service_role, et consommer Textract, Bedrock et DeepSeek. `verify_token` existe mais n'est branché nulle part, et il ne s'importe pas en l'état (`from config import settings`, `HTTPAuthCredentials`). | `test_securite.py` (8 endpoints) | `app/core/auth.py`, `app/api/V1/__init__.py` |
| 4 | 🔴 | CORS `allow_origins=["*"]` avec `allow_credentials=True`. | `test_cors_restreint_au_front` | `main.py:50` |
| 5 | 🔴 | **Import Excel par « Importer » → 404** : le dialogue appelle `/process-file/excel-invoices`, la route réelle est `/processing/process-file/process-file/excel-invoices` (préfixe en double côté backend). En plus, le dialogue n'envoie pas `audit_id` ni `organization_id`, que l'endpoint exige. *Zone Pharci.* | E2E + test de contrat | `InvoiceImportDialog.tsx:176`, `invoiceService.ts:105`, `proccesing.py:320` |
| 6 | 🔴 | **PDF de plusieurs factures → échec** : les pages 2 et suivantes insèrent une colonne `original_file_name` qui n'existe pas, sans `audit_id` ni `organization_id`. | `test_facture_pdf_plusieurs_factures` | `proccesing.py:256` |
| 7 | 🔴 | **Import Sentinel impossible via l'API** : `chardet` est appliqué au fichier Excel binaire avant le choix du capteur → `decode(None)` → 500. | `test_import_sentinel_excel` | `proccesing.py:430` |

### Calculs de facturation (règles de référence non respectées)

| # | Prio | Bug | Valeur obtenue → attendue | Où |
|---|---|---|---|---|
| 8 | 🔴 | Import Excel : NJ = fin − début. | 30 → **31** (1er → 31 mars) | `useBillingImport.ts:76` *(Pharci)* |
| 9 | 🔴 | Mapper OCR : NJ = fin − début. | 59 → **60** | `invoice-mapper.ts:522` |
| 10 | 🔴 | Import Excel : prime fixe proratisée en NJ × 12/365. | 33 949 → **34 421** | `useBillingImport.ts:176` *(Pharci)* |
| 11 | 🔴 | Import Excel : PDP en 1,5 × Tpf × NJ × 12/365 × (Pmax − PS). | 5 658 → **5 737** | `useBillingImport.ts:180,187` *(Pharci)* |
| 12 | 🔴 | Saisie manuelle : PDP = (Pmax − PS) × prix K2 × 1,5 (unités incohérentes). | 1 023 → **5 928** | `ManualInvoiceForm.tsx:496` (+ libellé `:1317`) *(Pharci)* |
| 13 | 🔴 | Saisie manuelle : barème cos φ 0,85/0,93 au lieu de celui du simulateur. | cos φ 0,78 : 89 744 → **50 000** sur 1 M | `manual-invoice-calc.ts:103` *(Pharci)* |
| 14 | 🔴 | Simulateur MT/GP : sans énergie réactive sur la facture, Wr est pris = 0 → cos φ = 1 → **bonus maximal de −3,75 % inventé**, et le cos φ déclaré est ignoré. | taux −3,75 → **5** (cos φ déclaré 0,78) | `senelec-simulator.ts:340,382` |
| 15 | 🟠 | Import Excel : quand HT manque mais que TTC et TVA sont connus, le HT est reconstruit depuis les composantes au lieu de TTC − TVA → la ligne réparée devient incohérente (TTC ≠ HT + TVA). | 758 097 → **800 000** | `useBillingImport.ts:202` *(Pharci)* |
| 16 | 🟠 | Détection d'arriérés morte : `montant_ttc` vient de TOTAL FACTURE, donc le ratio comparé vaut toujours 1. Il faut comparer le montant en base (`inv.amount`). | jamais détecté | `billing-anomaly-detector.ts:135` |

### Fonctionnalités dégradées

| # | Prio | Bug | Preuve | Où |
|---|---|---|---|---|
| 17 | 🟠 | Échec du traitement d'une facture jamais signalé (console uniquement), statut « Rejetée » jamais positionné. *Zone Pharci.* | E2E « échec signalé » | `InvoiceImportDialog.tsx:190` |
| 18 | 🟠 | Bâtiment sans type : champ facultatif dans le formulaire, mais `building_type NOT NULL` en base → création refusée, sans message visible (bug 1). | E2E | `NodeDetail.tsx:582` |
| 19 | 🟠 | Progression : la liste affiche 19 % là où le projet affiche 25 % (la liste ne passe pas sites, bâtiments et équipements → plafond à 75 %). La pondération 20/20/10/10/40 annoncée n'est pas appliquée (16 critères à poids égal). | E2E + unitaire | `Audits.tsx:34`, `audit-service.ts:314` |
| 20 | 🟠 | Compteur Quarantaine à 0 tant qu'on n'a pas ouvert le panneau. | E2E | `Facturation.tsx:348,1391` |
| 21 | 🟠 | Notes d'inventaire et seuils d'anomalie stockés dans le navigateur (`localStorage`) : perdus sur un autre poste ou pour un collègue. | E2E notes | `InventaireNotes.tsx:20`, `AuditBillingParams.tsx:112` |
| 22 | 🟠 | Organisation active tirée au hasard si l'utilisateur appartient à plusieurs organisations (`limit(1)` sans ordre ni sélecteur). | lecture du code | `OrganizationContext.tsx:44` |
| 23 | 🟠 | Invitations : `invite-service` appelle `/auth/invite`, qui n'existe pas ; l'écran Admin affiche « Invitation envoyée » sans rien envoyer. | test de contrat | `invite-service.ts:20`, `Admin.tsx:166` |
| 24 | 🟠 | Graphique Smart Energy Meter : plantage (`valid_data` jamais défini pour ce capteur). | unitaire + API | `utils.py:467` |
| 25 | 🟡 | Erreurs client renvoyées en 500 au lieu de 400 : capteur inconnu, fichier vide ou mal formé, PDF illisible, export Excel sans tableau (`HTTPException` avalée par le `except` générique). | 6 tests API | `proccesing.py:461,496,570,313` |
| 26 | 🟡 | OCR : la date retenue est la première clé contenant « date » (ex. début de période) plutôt que la date de facture. | unitaire | `utils.py:821` |
| 27 | 🟡 | Clé de tableau « N° Facture : » → `N°_FACTURE_` (« _ » final). | unitaire | `unified_invoice_processor.py:264` |

### À vérifier (non prouvé par un test)

- Import SENELEC : `upsert` sur `(numero_compte_contrat, numero_facture)` sans `organization_id` → collision possible entre organisations (`factures-senelec-service.ts:92`).
- Admin « Créer une organisation » n'envoie pas `created_by`, colonne obligatoire (`Admin.tsx:153`).
- Import Excel backend : montant × 1 000 000 (`proccesing.py:360`).
- Grilles tarifaires personnalisées stockées par utilisateur (`user_metadata`), pas par organisation.

## Non couvert

- Simulateur dans le navigateur (couvert en unitaire), Analyse, Classeur, Schéma électrique, Rapport, Mesures (page non routée), Auth et Admin.
- Formulaires d'équipements (éclairage, clim…) et calcul kWh/an affiché.
