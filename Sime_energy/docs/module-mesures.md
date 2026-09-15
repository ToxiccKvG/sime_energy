# Module Mesures — Documentation technique

> Plateforme SIMEE (CER2E) — Module 3 « Campagne de mesure »
> Référence : formats supportés, architecture, contrats de données, algorithmes.
> Dernière mise à jour : 15/09/2026 (clôture du chantier 1 du plan de travail).
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

## 8. Limites connues / hors périmètre du chantier 1

- **Pas de persistance** des relevés (état React). Prévu : stockage serveur.
- Les modèles d'analyse portent sur la **grandeur principale** ; l'extension aux colonnes
  secondaires (phases, T°…) n'est pas faite.
- Jours fériés = dates fixes du Sénégal uniquement (pas les fêtes mobiles).
- Backend : encodage `chardet` fragile sur les très petits fichiers texte.
- ESLint : 3 erreurs préexistantes dans `MeasurementCharts.tsx` (`any`, expression
  inutilisée), sans effet fonctionnel.

## 9. Validation (15/09/2026)

- Modèles : jeu synthétique de 28 jours (talon 300 W, trou de 5 h, pic, valeur figée,
  action à J+14) passé par l'API réelle (`PV_SOLAREDGE`, 2 668 mesures) : les 4 modèles
  retrouvent exactement les événements injectés (talon 0,29 kW, complétude 99,3 %,
  3 anomalies, −14,9 % ouvré / −1 % week-end, écart jugé net).
- Comparaison : C.A 8335 (xlsx, 10 min, W) contre SolarEdge (csv, 15 min, kW) avec un
  biais injecté A = 1,03·B + 15 W : pas auto 15 min, biais −32,9 W, a = 0,971,
  b = −14,6 W, exports PNG + Excel vérifiés dans le navigateur.
- `tsc --noEmit`, `eslint` (hors erreurs préexistantes), `bun run build` : OK.
