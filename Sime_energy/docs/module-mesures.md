# Modules Mesures & IOT — Documentation technique

> Plateforme SIMEE (CER2E) — Module 3 « Campagne de mesure »
> Référence : formats supportés, architecture, contrats de données, algorithmes.
> Dernière mise à jour : 16/09/2026 (chantier 1 clôturé, chantier 2 Sources IOT).
> Guide utilisateur : [`guide-utilisateur-mesures.md`](./guide-utilisateur-mesures.md).

## 1. Vue d'ensemble

Le module importe les fichiers exportés par les appareils de mesure, les **normalise**
dans un format unique (`timestamp` + grandeur principale + colonnes secondaires), puis
fait **tout le calcul côté client** : indicateurs, filtrage par période, modèles
d'analyse, comparaison de relevés, exports.

Répartition des responsabilités :

| Couche | Rôle | Ne fait pas |
|---|---|---|
| **Backend FastAPI** (`app/core/sensors.py`) | Parser un fichier selon son capteur, renvoyer **toutes** les mesures valides + métadonnées (unité, libellé, nature de la grandeur) | Aucune statistique, aucun sous-échantillonnage |
| **Frontend** (`services/`, `lib/`) | KPIs, regroupement par jour, modèles d'analyse, alignement de deux relevés, rapports | Aucun stockage : les relevés vivent dans l'état React de l'onglet |
| **Supabase** | Table `custom_sensors` (définitions de capteurs personnalisés, par organisation, RLS) | Les mesures elles-mêmes ne sont pas persistées (chantier ultérieur) |

Onglets : **Upload → Analyse → Visualisation → Modèles → Comparaison**
(`components/invoices/MeasurementWorkflow.tsx`). La **période** choisie est un état du
workflow, par relevé, partagé entre Analyse, Visualisation et Modèles.

## 2. Capteurs supportés

| Clé `sensor_type` | Appareil | Entrée | Grandeur principale | `quantity_kind` | Colonnes secondaires |
|---|---|---|---|---|---|
| `CA8335_TREND` | C.A 8335 — Trend 10 min | xlsx (feuille *trend*) | Puissance active (W) | power | S (VA), Q (var), cos φ, fréquence, déséq. U, U et I par phase |
| `CA8335_DEMAND` | C.A 8335 — Demand 5 min | xlsx | Énergie active (Wh) | energy | VAh, varh, I moyen, U par phase |
| `AIR_STATION_M100` | Station IAQ M100 | xlsx (feuille *data*) | CO₂ (ppm) | other | PM2.5, PM10, T°, HR, AQI |
| `PV_SOLAREDGE` | Portail SolarEdge | csv `;` (ligne « Période ») | Puissance produite (kW) | power | — |
| `PV_HUAWEI` | FusionSolar — journalier | xlsx | Production (kWh) | energy | conso, injection/achat réseau, batterie, auto-conso |
| `SHELLY` | Shelly cloud — journalier | csv par sections | Énergie consommée (Wh) | energy | phases A/B/C, retour réseau |
| `CUSTOM` | Capteur personnalisé | csv/xlsx | définie par l'utilisateur | déduit de l'unité, modifiable | libres |

`quantity_kind` (`power` / `energy` / `other`) est **la** métadonnée structurante : elle
décide si un cumul a un sens et comment il se calcule (intégration trapèzes / somme /
aucun). `lib/custom-sensor-service.ts › guessQuantityKind()` la propose d'après l'unité.

### Détection du capteur à l'upload
`MeasurementUploadStep.tsx › guessSensorType()` devine le type d'après le nom du fichier
(`trend`, `demand`, `m100|iaq`, `solaredge|pv-`, `fusionsolar|huawei`, `shelly|consommation`).
Le type est fixé par fichier, modifiable ligne par ligne ; le sélecteur global sert de
valeur par défaut aux fichiers non reconnus.

## 3. Backend

### 3.1 Registre et pipeline (`app/core/sensors.py`)

```
fichier (bytes) + sensor_type [+ sensor_config JSON si CUSTOM]
   │  input "text" → décodage (chardet) · input "bytes" → openpyxl
   ▼
parser du registre  ──►  DataFrame normalisé : timestamp + value_col + colonnes secondaires
   ▼
_build_measurements()  ──►  toutes les lignes valides (timestamp et valeur non nuls),
                            valeurs négatives conservées sauf keep_negative=False
   ▼
JSON : measurements, sensor_type, metric_label, unit, quantity_kind, processing_info
```

`SENSOR_REGISTRY[key] = { label, input, parser, value_col, unit, metric_label,
keep_negative, quantity_kind, extra_cols }`. Ajouter un capteur = un parser qui renvoie
un DataFrame avec `timestamp` + une entrée dans le registre.

Endpoint : `POST /api/V1/processing/process-file/measures`
(`file`, `sensor_type`, `sensor_config` optionnel — JSON de la ligne `custom_sensors`).

### 3.2 Contrat de réponse

```json
{
  "sensor_type": "CA8335_TREND",
  "metric_label": "Puissance active",
  "unit": "W",
  "quantity_kind": "power",
  "measurements": [
    { "timestamp": "2026-06-01 00:00:00", "consumption": 342.8,
      "P apparente (VA)": 372.6, "Cos φ": 0.92, "U moy. A (V)": 230.0 }
  ],
  "processing_info": { "original_rows": 4002, "valid_measurements": 4002,
                       "sensor_label": "…", "file_name": "…" }
}
```

Conventions : `consumption` = grandeur principale ; les colonnes secondaires portent leur
unité entre parenthèses en fin de libellé (exploitée par `extractUnit()` côté client) ;
`timestamp` = `YYYY-MM-DD HH:MM:SS` en heure locale.

### 3.3 Robustesse
Dates ISO à virgule de millisecondes, US, FR, Huawei ; nombres au format français ;
colonnes temporelles dupliquées (choix de celle qui se parse) ; feuille Trend lue en ne
chargeant que les colonnes utiles. Fichier/capteur incohérent → 400 avec `detail`
explicite, relayé tel quel par le front.

Point d'attention connu : pour un **petit fichier texte**, `chardet` peut deviner un
mauvais encodage et faire rater l'en-tête accentué (« Période » SolarEdge). Les exports
réels ne sont pas affectés.

## 4. Frontend

### 4.1 Fichiers

| Fichier | Rôle |
|---|---|
| `components/invoices/MeasurementWorkflow.tsx` | Onglets, relevés en session, alias, période partagée par relevé |
| `components/invoices/MeasurementUploadStep.tsx` | Dépôt multi-fichiers, capteur par fichier, liste « Relevés chargés » (renommer / retirer), capteurs personnalisés |
| `components/invoices/CustomSensorMapper.tsx`, `CustomSensorEditPanel.tsx` | Création / édition d'un capteur personnalisé (mapping de colonnes) |
| `components/invoices/MeasurementAnalysis.tsx` | KPIs, vue par jour, stats par colonne, table, export CSV, rapport PDF/Word |
| `components/invoices/MeasurementCharts.tsx` | Courbe multi-axes, distribution, profil heure × jour, cumul par période, drill-down, export PNG |
| `components/invoices/AnalysisModelsPanel.tsx` | Onglet Modèles (affichage seulement) |
| `components/invoices/ModelComparisonPanel.tsx` | Deux relevés côte à côte |
| `components/invoices/SensorComparisonPanel.tsx` | Compteur général / somme de sous-compteurs |
| `components/invoices/MeasurementPeriodFilter.tsx` | Filtre de période (`DateRange`, `filterByRange`, navigation jour) |
| `services/measurementService.ts` | Appel API, type `MeasurementData`, `measurementLabel()` (alias > nom de fichier > capteur) |
| `services/measurementStats.ts` | KPIs, `integrateEnergy()`, `groupMeasurementsByDay()`, interprétation |
| `services/measurementReportExport.ts` | Rapport PDF (jsPDF) et Word (docx) depuis un modèle unique |
| `services/analysisModels/*` | Modèles d'analyse (§ 5) |
| `lib/model-comparison.ts` | Alignement et comparaison de deux relevés (§ 6) |
| `lib/sensor-comparison.ts` | Familles d'unités (W/VA/var, Wh/VAh/varh), conversions, comparaison maître/esclaves |
| `lib/custom-sensor-service.ts` | CRUD `custom_sensors`, `guessQuantityKind()` |
| `lib/chart-export.ts` | Filtre html2canvas (exclut infobulle, curseur, points actifs, `data-no-export`) |

### 4.2 Statistiques (`measurementStats.ts`)
- Percentiles par interpolation linéaire (identique à pandas `.quantile()`), écart-type
  d'échantillon (ddof = 1).
- `avgConsumption` = moyenne **hors zéros** (les zéros sont le plus souvent des trous).
- Cumul : `energy` → somme ; `power` → intégration trapèzes en unité·h ; `other` → `null`.
- `groupMeasurementsByDay()` : clé jour locale, `total` non nul seulement pour la grandeur
  principale.

## 5. Modèles d'analyse (`services/analysisModels/`)

Principe : un modèle répond à une question d'audit et se choisit d'après la **nature des
données** (`quantity_kind`, pas de temps natif, nombre de jours), jamais d'après
l'appareil. `index.ts` expose le registre `ANALYSIS_MODELS` avec, pour chaque modèle, sa
condition d'applicabilité (message explicatif sinon).

Socle commun (`types.ts`) : `SeriesContext` (mesures + `metricKey` + unité + nature),
`toPoints()`, `detectStepMs()` (médiane des intervalles), `groupDays()` (par jour
calendaire, avec valeur journalière et profil horaire), `dailyValue()` / `hourlyValue()`
(somme pour une énergie, moyenne sinon, intégration pour une puissance au jour),
`quantile()`, `mad()`, `totalOf()`.

| Modèle | Fichier | Applicable si | Méthode |
|---|---|---|---|
| **Profil type** | `profilType.ts` | ≥ 2 jours | Classe de jour = férié (dates fixes `JOURS_FERIES_FIXES`) / week-end / ouvré. Par classe et par heure : médiane, P10, P90, moyenne. Jour « typique » = distance RMS minimale au profil médian ; jours atypiques = écart journalier > 20 % à la médiane de classe (3 max par classe, 8 au total). |
| **Talon** | `talon.ts` | power ou energy, infra-journalier | Talon du jour = min horaire sur 00h–05h (P5 des points si pas de nuit). Talon retenu = médiane des talons. Pointe = P95 horaire. Part = talon × heures / cumul. Annuel = talon × 8 760. Talon par classe de jour. |
| **Anomalies** | `anomalies.ts` | toujours | (1) Trous : intervalle > 3 pas natifs. (2) Figé : ≥ 12 points identiques sur ≥ 2 h. (3) Écarts au profil : par classe × heure (≥ 3 jours de la classe), référence médiane et σ = max(1,4826·MAD, 10 % de la médiane) ; tranche signalée si \|z\| ≥ 3,5 **et** \|écart\| ≥ 20 % ; heures contiguës fusionnées en épisode ; critique si z ≥ 6 et écart ≥ 50 %. Complétude = points / (durée ÷ pas + 1). |
| **Avant / Après** | `avantApres.ts` | ≥ 2 jours | Coupure à minuit du jour choisi (le jour de l'action est « après »). Par classe : moyenne et écart-type journaliers de chaque côté, delta, delta %, robuste si \|delta\| > 2 × erreur-type (≥ 3 j de chaque côté). Écart global = moyenne des deltas de classe pondérée par le mélange de jours « après ». Gain après = −delta × jours après ; annuel = Σ −delta_c × {255, 104, 6}. Profil horaire médian avant/après sur les jours ouvrés (sinon tous). |

Tous les calculs sont purs (pas de React) et testables en Node/Bun avec un
`SeriesContext` construit à la main.

## 6. Comparaison de deux relevés (`lib/model-comparison.ts`)

1. **Pas commun** : le plus grossier des deux pas natifs, arrondi à un pas standard
   (5 min → 1 jour) ; forçable.
2. **Recouvrement** : période commune (sinon erreur explicite), restreignable.
3. **Ré-échantillonnage** par famille : puissances de même famille → moyenne par pas en
   unité de base ; énergies → somme en Wh/VAh/varh ; puissance contre énergie → la
   puissance est intégrée ; autres grandeurs → moyenne, unités identiques exigées
   (sinon avertissement).
4. **Décalage d'horloge** de B (`detectClockOffset()`) : recherche dans ± N minutes, au
   pas le plus fin des deux natifs, du décalage maximisant la corrélation.
5. **Sorties** : lignes `{t, a, b, delta, deltaPct}`, statistiques A/B (moyenne, min,
   max, σ, cumul), biais, écart absolu moyen, RMSE, corrélation, **régression B = a·A + b**
   (R²) avec diagnostic textuel ; tolérance ± % appliquée à l'affichage.
6. **Exports** (`ModelComparisonPanel.tsx`) : PNG du graphique, CSV du tableau, Excel
   3 feuilles (Résumé, Indicateurs, Écarts) via `lib/excel-utils.ts`.

Le mode **Compteur général / sous-compteurs** (`SensorComparisonPanel.tsx`,
`lib/sensor-comparison.ts`) compare un relevé de référence à la somme de plusieurs relevés
après conversion dans une unité commune.

## 7. Exports d'images

Tous les graphiques passent par `html2canvas` (échelle 2, fond `#0f111a`) avec le filtre
`lib/chart-export.ts › isHoverArtifact()` qui exclut l'infobulle Recharts, le curseur de
survol, les points actifs et tout élément marqué `data-no-export` (sélecteurs, boutons).
Nom de fichier : slug du relevé + vue.

## 8. Sécurité des données (audit du 15/09/2026)

Migration `supabase/migrations/20260915_security_audit_app_tables.sql` (appliquée) :
- RLS actif sur **toutes** les tables `public` ; isolation par organisation via
  `organization_users` (helpers `SECURITY DEFINER` non récursifs `user_org_ids()`,
  `user_admin_org_ids()`, `is_org_creator()`).
- `organization_users` : lecture = membres ; modification/suppression = admins ;
  insertion directe = créateur de l'organisation ; toute autre adhésion passe par la RPC
  `accept_invitation(code)` (vérifie code, expiration, e-mail invité).
  `get_invitation_by_code(code)` renvoie une invitation sans permettre l'énumération.
- Rôle `anon` : aucun accès aux tables (sauf `auth_events INSERT`), privilèges par défaut
  corrigés. Rôle `authenticated` : sans TRUNCATE / REFERENCES / TRIGGER ; Shelly en
  lecture seule ; `fn_aggregate_*` réservées à `service_role`.
- Invitations : générées côté front (`createInvitation`, code 12 caractères, 7 jours),
  acceptées via RPC ; l'ancien endpoint backend `/auth/invite` n'existe plus.
- Restent à traiter : e-mail super-admin codé en dur dans `join_requests`,
  `building_type_params` modifiable par tout utilisateur connecté, bucket
  `audit-documents` sans isolation par organisation.

## 9. Module IOT — Sources et rôles des appareils (chantier 2, 16/09/2026)

### Modèle
- **Table `shelly_device_roles`** (migration `SHELLY_GCP_00/.../20260901_create_shelly_device_roles.sql`) :
  `device_id` (clé — jamais le nom, qui change côté Shelly Cloud) → `role`
  (`M1_RESEAU | M2_SELECTEUR | M3_CHARGE | M4_GROUPE | M5_PV | BESS | DEPART | AMBIANCE | AUTRE`),
  `libelle`, `sens_inverse` (TC monté à l'envers), `origine` (`auto | manuel`),
  `confirme_at` (`NULL` = proposition non validée, jamais présentée comme acquise).
  Règle : **aucun distributeur ni pays dans le vocabulaire** (`M1_SENELEC` a été renommé).
- **Une source = un rôle sur un site.** Le catalogue des appareils vient de la vue
  `shelly_devices_catalog` (`fetchDisponibles()`), les rôles de `fetchDeviceRoles()`
  (`lib/shelly-device-role-service.ts`). Plus rien n'est stocké en localStorage pour les
  sources ; l'ancien modèle riche (`Source`, `SourceType`, modes A–F, transfert, tableaux,
  `ProfilMi`, liens) a été supprimé de `components/iot/shared.ts` et du contexte
  (`STORAGE_KEY` `sime-iot-v2` → `v3`, reset propre).

### Écrans
| Fichier | Rôle |
|---|---|
| `components/iot/ShellyDeviceRolesPanel.tsx` | Paramètres → Rôles : propositions à confirmer, appareils sans rôle par site avec pré-remplissage par famille (`ENERGIE_1PH/LUMIERE → DEPART`, `CAPTEUR_ENV → AMBIANCE`, `ETAT → AUTRE` ; 3PH/2PH/INCONNU sans suggestion), rattachements confirmés, `sens_inverse` |
| `components/iot/SourcesTab.tsx` | Lecture : `buildSites()` regroupe le catalogue par site puis par rôle (`SOURCE_ORDER`), rôles non confirmés à part, `NON_CLASSE` pour les appareils sans rôle ; légende (9 rôles + schémas A–F `public/images/modes/*.png`, aperçu au survol) |
| `components/iot/IOTContext.tsx` | `analysePreset: { label, site, deviceIds } \| null` (non persisté) posé par **Analyser** |
| `components/iot/AnalyseTab.tsx › SupabaseExportPanel` | Consomme le préréglage : `site` posé, `deviceFamily = ''`, appareils pré-cochés, bandeau « Pré-sélection depuis la source … modifiable » |

### Règle de conception (posée par l'utilisateur)
Une source est un **raccourci, jamais un préalable** : `exporterDonneesSupabase()` ne connaît
que site / famille / appareils / période ; un appareil sans rôle reste extractible ; les rôles
non confirmés ne sont jamais utilisés silencieusement.

### Piège d'implémentation
La pré-sélection doit être appliquée par un effet **déclaré après** l'effet de purge de
`selectedDeviceIds` (qui retire tout appareil absent des filtres courants) et **seulement
une fois le catalogue reçu** (`metaLoaded`) ; sinon la purge, exécutée dans le même commit
avec les filtres de l'ancien rendu, vide la sélection. D'où `pendingPresetIds` appliqué au
rendu suivant.

### Détection des feuilles Excel « profil Mi »
`UploadTab.tsx` garde un type local `ProfilMi` (`M1_RESEAU`…) et des motifs
(`RESEAU|SENELEC|M1`, …) uniquement pour reconnaître les feuilles M1..M5 des anciens
classeurs ; c'est du parsing, pas un modèle de source.

## 9 bis. Module IOT — Persistance serveur des fichiers (16/09/2026)

### Avant
Tout l'état du module (`files` avec `rawData`, `shellyRows`, calendriers…) était sérialisé
en `localStorage` (`sime-iot-v3`) : aucune reprise sur un autre poste, aucune isolation entre
utilisateurs d'un même navigateur, et **perte silencieuse** au-delà du quota (~5 Mo, soit
~4 000 lignes nettoyées à ~1,3 Ko la `ShellyRow` sérialisée — `saveToStorage` avalait
l'erreur).

### Modèle (migration `sime-front/supabase/migrations/20260916_iot_files.sql`)
- **Table `iot_files`** : métadonnées (`name`, `type`, `statut`, `row_count`, `columns`,
  `preview` = 10 lignes, `taille`, `parent_id` nettoyé → original en `on delete set null`,
  `device_location`, `device_room`) + `storage_path` / `content_encoding`.
  `id` est un **uuid généré côté client** (`crypto.randomUUID()`) pour que les onglets
  puissent référencer le fichier avant la réponse serveur.
- **Bucket privé `iot-files`** : le contenu (`rawData`) en JSON **gzippé dans le navigateur**
  (`CompressionStream`, repli `identity` si l'API manque), chemin `{auth.uid()}/{id}.json.gz`.
  Ordre de grandeur : 240 `ShellyRow` = 5,3 Ko au lieu de ~310 Ko.
- **Isolation par utilisateur** (décision manager du 27/08) : policies `created_by = auth.uid()`
  sur la table, `(storage.foldername(name))[1] = auth.uid()` sur les objets. `organization_id`
  est stocké (nullable) pour un partage d'équipe futur sans migration de données. `anon` n'a
  rien, `authenticated` n'a pas TRUNCATE.

### Front
| Fichier | Rôle |
|---|---|
| `lib/iot-file-service.ts` | `listFiles`, `createFile` (ligne puis objet ; un envoi interrompu laisse `storage_path NULL`, signalé à l'ouverture), `updateFile` (métadonnées, et contenu si `rawData` fourni), `deleteFile` (objet puis ligne), `fetchFileContent` (+ `dateReviver`, même convention que l'ancien localStorage) |
| `components/iot/IOTContext.tsx` | Liste chargée à la connexion (`filesLoading` / `filesLoaded`) ; `addFile` / `updateFile` / `removeFile` mettent l'UI à jour immédiatement puis persistent — un échec remonte en **toast destructif**, jamais silencieux ; **`ensureFileContent(id)`** télécharge `rawData` à la demande (dédoublonné via `pendingContent`) et pose `contentLoaded` ; `STORAGE_KEY` `v3 → v4`, le localStorage ne garde plus que `selectedFileId`, `donneesTechniques`, `joursFerier`, `calendriers`, `activeTab` |
| `components/iot/shared.ts` | `ImportedFile.contentLoaded?: boolean` — ne pas tester `rawData.length` pour savoir si un fichier est vide |
| `NettoyageTab` / `AnalyseTab` / `StockageTab` | Tous les chemins qui lisent `rawData` passent par `ensureFileContent` (bouton Charger, Procéder au Nettoyage, effet sur `selectedFileId`, panneau « Voir » qui affiche `preview` en attendant) ; `NettoyageTab` réagit désormais à un fichier choisi depuis la bibliothèque (une fois par sélection, seulement si l'onglet est visible — pas de rechargement après « Sauvegarder et stocker ») ; spinner de chargement dans la bibliothèque ; filtre « Facturation » corrigé (`type === 'facture'`) |

### Conséquence assumée
`shellyRows` (jeu actif) n'est plus persisté : après rechargement, le fichier sélectionné est
rechargé par Analyse et Nettoyage depuis la base ; le badge « jours » de l'en-tête n'apparaît
qu'une fois un fichier ouvert.

### Validation (16/09/2026, localhost)
Import xlsx 240 lignes → ligne + objet gzip (931 o) ; rechargement → liste depuis la base,
localStorage à 1 Ko ; Nettoyer → téléchargement du contenu, 240 lignes parsées ;
« Sauvegarder et stocker » → fichier nettoyé créé (`parent_id` posé, 5,3 Ko) puis **mis à jour
en place** au second enregistrement ; Analyse après rechargement → dates restaurées ;
suppression → ligne et objet retirés.

### Point ouvert
L'import **CSV** échoue (« Can't find end of central directory ») : `processFile` passe tout
par `parseExcelBuffer` (ExcelJS) alors que la zone accepte `.csv`. Préexistant, hors de ce
chantier.

## 10. Limites connues / hors périmètre du chantier 1

- **Pas de persistance** des relevés (état React). Prévu : stockage serveur.
- Les modèles d'analyse portent sur la **grandeur principale** ; l'extension aux colonnes
  secondaires (phases, T°…) n'est pas faite.
- Jours fériés = dates fixes du Sénégal uniquement (pas les fêtes mobiles).
- Backend : encodage `chardet` fragile sur les très petits fichiers texte.
- ESLint : 3 erreurs préexistantes dans `MeasurementCharts.tsx` (`any`, expression
  inutilisée), sans effet fonctionnel.

## 11. Validation (15/09/2026)

- Modèles : jeu synthétique de 28 jours (talon 300 W, trou de 5 h, pic, valeur figée,
  action à J+14) passé par l'API réelle (`PV_SOLAREDGE`, 2 668 mesures) : les 4 modèles
  retrouvent exactement les événements injectés (talon 0,29 kW, complétude 99,3 %,
  3 anomalies, −14,9 % ouvré / −1 % week-end, écart jugé net).
- Comparaison : C.A 8335 (xlsx, 10 min, W) contre SolarEdge (csv, 15 min, kW) avec un
  biais injecté A = 1,03·B + 15 W : pas auto 15 min, biais −32,9 W, a = 0,971,
  b = −14,6 W, exports PNG + Excel vérifiés dans le navigateur.
- `tsc --noEmit`, `eslint` (hors erreurs préexistantes), `bun run build` : OK.
