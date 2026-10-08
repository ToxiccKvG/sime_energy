# Runbook data — collecte Shelly et exploitation des données

> Objectif : pouvoir exploiter, surveiller et dépanner la donnée **sans dépendre de l'assistant**.
> État vérifié le 2026-10-01. En cas de doute, la base fait foi : interroger Supabase avant de croire ce document.

## 1. Le flux en une page

```
Appareils Shelly ──► Shelly Cloud (3 comptes) ──► Edge Function poll-shelly ──► shelly_cl (brut, 1 ligne / appareil / minute)
                                                      ▲ déclenchée par pg_cron chaque minute
                                                 shelly-webhook (événements, secret obligatoire)

shelly_cl ──► fn_aggregate_horaire (H+05) / fn_aggregate_horaire_env (H+07) ──► shelly_cl_horaire ──► vue shelly_cl_journalier
          ──► fn_energy_by_device / by_day / profile / repartition (calcul kWh, appelés par le front)
```

- **Sites** : `Ma Maison` (~25 appareils actifs), `Académie CER2E` (incident en cours), `Donsin` (4 appareils, dont la station météo).
- **La plateforme ne fait que LIRE Shelly.** Les appareils et les comptes se créent dans l'app Shelly. Le pilotage on/off est un chantier futur.
- Les **rôles** (`shelly_device_roles`, 83 lignes) disent à quoi sert chaque `device_id` : `M1_RESEAU` (arrivée réseau), `M2_SELECTEUR`, `M3_CHARGE`, `M4_GROUPE`, `M5_PV`, `DEPART`, `AMBIANCE`, `AUTRE`. Un appareil sans rôle n'apparaît pas dans les analyses.

## 2. Accès (aucune clé dans le dépôt)

| Besoin | Comment |
|---|---|
| SQL en lecture/écriture | `cd SHELLY_GCP_00 && supabase db query --linked -o json "select …"` |
| Clé service-role (extraction ponctuelle) | `supabase projects api-keys --project-ref amctayugahwhxwytqiqf -o json` → entrée `service_role`. À garder en variable d'environnement le temps du script, **jamais dans un fichier** |
| Se reconnecter | `supabase login` (navigateur) |
| Fonctions déployées | `supabase functions list --project-ref amctayugahwhxwytqiqf` |

Pièges d'accès :
- **Le projet est lié depuis `SHELLY_GCP_00/` seulement.** Depuis la racine : « Cannot find project ref ». Se placer dans `SHELLY_GCP_00/` ou ajouter `--project-ref amctayugahwhxwytqiqf`.
- Le `.env` local contient la clé **anon** sous le nom `SUPABASE_SERVICE_ROLE_KEY` (nom trompeur). Depuis la migration du 2026-09-14, l'accès anon à `shelly_cl`, aux agrégats et à `fn_energy_*` est **fermé** : les anciens scripts (`check_supabase.py`, etc.) échouent avec `permission denied`.
- La sortie JSON du CLI est précédée d'une ligne de texte (« Initialising login role… ») : couper avant le premier `{`.
- Les comptes Shelly (clé d'API + serveur) sont dans la table `shelly_accounts`, **source de vérité**. Écriture réservée aux admins (migration du 2026-09-25).

## 3. Routine quotidienne (5 minutes)

```bash
python SHELLY_GCP_00/scripts/routine_collecte.py            # résumé + PDF sur le Desktop
python SHELLY_GCP_00/scripts/routine_collecte.py --no-pdf   # résumé seul
```

Dépendance du PDF : `pip install reportlab`. Code de sortie : `0` fraîche, `1` en retard (> 10 min), `2` accès impossible.

Lecture du résumé :
- **Dernière ligne < 10 min** et ~43 000 lignes / 24 h → la collecte tourne. Sinon voir §6.
- **Appareils actifs par site** : comparer à la veille (§3 du PDF). Une chute brutale sur un site = problème physique ou compte Shelly.
- **Mesure trop ancienne** : un capteur est collecté mais ne transmet plus (pile, portée). La plateforme relit alors sa dernière valeur.
- **Sans rôle** : à classer dans `shelly_device_roles`.

### Déclarer une absence (voyage, fermeture, arrêt volontaire)

Quand les occupants coupent le disjoncteur ou débranchent des appareils, la signature est celle d'une coupure SENELEC. À déclarer pour éviter les fausses alertes et les fausses coupures :

```bash
cd SHELLY_GCP_00
supabase db query --linked "insert into site_absences (site, start_at, note) values ('Ma Maison', '2026-10-15 08:00+00', 'Voyage …')"
# au retour :
supabase db query --linked "update site_absences set end_at='2026-10-20 18:00+00' where site='Ma Maison' and end_at is null"
```
`site` = valeur exacte de `shelly_cl.site`. Absence en cours déclarée : **Ma Maison depuis le 28/09/2026 15:30 UTC** (fin à renseigner au retour).

### Coupures SENELEC et énergie non distribuée

**Tables** `coupures` (une ligne par coupure : site, début, fin, END estimée, cause déclencheur, cause aggravante, statut `proposee`/`confirmee`, indice, commentaire) et `coupure_causes` (liste des causes, modifiable par migration). **Écran** : module IOT > onglet « Coupures » (liste, confirmation des causes, camembert des causes confirmées).

Cycle : `detect_coupures.py --save` enregistre les coupures détectées avec une cause **proposée** → on la confirme dans l'écran → le camembert ne compte que les causes **confirmées**. Une cause déjà confirmée n'est jamais écrasée par une nouvelle détection. Règles de proposition : tension de l'arrivée < 70 % de la normale dans les 10 min avant l'arrêt → réseau SENELEC ; dans les 6 h autour du départ ou du retour d'une absence déclarée → arrêt volontaire ; en pleine absence → « à vérifier » ; sinon cause inconnue. Pendant une absence, l'END est calculée sur la veille de la maison (~170 W), pas sur le profil habituel.

```bash
python SHELLY_GCP_00/scripts/detect_coupures.py --site "Ma Maison" --days 35 --csv coupures.csv
python SHELLY_GCP_00/scripts/detect_coupures.py --site "Ma Maison" --days 35 --save    # enregistre dans la table coupures
```
Signature : appareils secteur muets pendant que les capteurs à pile émettent ; trous < 5 min fusionnés ; seuil 5 min ; END = Σ P_réf(heure) × durée (P_réf = moyenne de l'arrivée à la même heure, hors coupures et hors absences). Résultat de référence, Ma Maison au 01/10/2026 : **18 coupures, 12,1 h, ≈ 5,8 kWh** (dont une de 3 h le 23/09). Les coupures tombant dans une absence sont signalées et ne sont pas à attribuer à SENELEC. Pour un autre site, passer `--arrivee <device_id du compteur d'arrivée>`.

## 4. Tables et fonctions clés

| Objet | Rôle | Remarque |
|---|---|---|
| `shelly_cl` | Brut, 1 ligne par appareil et par passage du poller | ~9,8 M lignes, 3,1 Go. **61,5 % de doublons mesurés sur la station météo** (même `measured_at`) |
| `shelly_cl_horaire` | Agrégat horaire | alimenté par cron |
| `shelly_cl_journalier` | Vue journalière | lourde sans filtre de date (timeout) |
| `shelly_device_roles` | `device_id` → rôle | table de référence |
| `shelly_device_types`, `shelly_device_channels` | Types et canaux configurables | self-service (phase B de nettoyage du code dur restante) |
| `shelly_accounts` | 3 comptes Shelly Cloud | source de vérité |
| `fn_energy_by_device / by_day / profile / repartition` | Calcul des kWh | contourner le plafond de 1 000 lignes de PostgREST |
| `site_absences` | Absences déclarées d'un site (`site`, `start_at`, `end_at` NULL = en cours, `note`) | Lue par la routine et la détection des coupures : un appareil muet pendant une absence n'est pas une panne |
| `iot_files`, `measurement_files` | Fichiers importés par utilisateur (+ buckets) | |

**Tâches planifiées (pg_cron)** : `poll-shelly-every-minute` (`* * * * *`), `aggregate-shelly-hourly` (`0 * * * *`), `aggregate-shelly-cl-horaire` (`5 * * * *`), `aggregate-shelly-cl-horaire-env` (`7 * * * *`), `refresh-shelly-devices-catalog` (`10 * * * *`, vue matérialisée).

**Edge Functions déployées** : `poll-shelly` (v25), `shelly-webhook` (v5, durcie), `test-shelly-account`. Deux fonctions orphelines subsistent (`swift-processor`, `shelly-web-hook`, avril 2026) : à supprimer ou à trancher.

## 5. Règles d'interprétation (à ne pas oublier)

1. **Dédoublonner sur `measured_at`** avant toute analyse d'un capteur : `shelly_cl` contient une ligne par minute même quand l'appareil n'a rien transmis.
2. **Appareil muet ≠ appareil éteint.** Pour chiffrer les coupures SENELEC : capteurs à pile actifs + appareils secteur muets = coupure. La tension à 0 V ne marche pas.
3. **Pagination sur `ts`, pas sur `id`** pour lire `shelly_cl` par l'API REST (la pagination par `id` renvoie 500 / timeout). Via SQL direct, toujours borner par `ts`.
4. **Un index utile sur `shelly_cl` a `ts` en tête** ou juste après une égalité. `idx_readings_dashboard` a été supprimé (1,2 Go jamais utilisés).
5. **Station météo Donsin** (`XB211299189491624`) : ne transmet que ~07:20 → 17:56 UTC (cause probable : veille faute de charge solaire, à confirmer). Pas de minimum nocturne ni de moyenne 24 h. `battery_level` figé à 67 % : utiliser `battery_voltage_v`. Pluie = compteur cumulatif.
6. **Capteur d'ouverture / bouton** : la « dernière mesure » peut dater de plusieurs jours sans que ce soit une panne.
7. **Câblage Académie** : 3 arrivées SENELEC (building, EPT, bureau Woyofal) ; M4 et TD désactivés ; PV Donsin en aval non mesuré ; injection M1 absente (anomalie à instruire).
8. Les capteurs **FOUTA POIDS LOURDS** (M1/M2/M4) sont débranchés volontairement depuis fin juillet : ce n'est pas une panne.
9. **Énergie par appareil : à partir du 18/05/2026 seulement.** Du 16/04 au 17/05, les appareils sur prise (Ma Maison : frigo, congélateur, box, chauffe-eau, lampes… ; Académie : multiprise, PC) remontaient la puissance mais pas `wh_tot` : `fn_energy_by_device` leur donne 0 kWh sur cette période. Les compteurs principaux (Ma Maison EM-SENELEC ; Académie M1, M2, M3, PV building, TGBT EPT) avaient bien `wh_tot` : **les totaux par site sont justes**. Faire démarrer toute répartition par appareil au 18/05. Si une analyse a vraiment besoin de cette période : reconstruire Σ P × Δt (trous > 5 min non comblés), validé contre `wh_tot` après le 18/05, dans une table à part marquée « reconstruit » — jamais dans `shelly_cl` (décision du 08/10/2026).

## 6. Dépannage

| Symptôme | Où regarder |
|---|---|
| Plus aucune ligne récente | Tableau Supabase → Edge Functions → `poll-shelly` → logs. Vérifier que `poll-shelly-every-minute` est actif : `select jobname, active from cron.job;` puis `select * from cron.job_run_details order by start_time desc limit 10;` |
| Un seul site muet | Compte Shelly du site : table `shelly_accounts` + app Shelly. Un appareil absent de `device/list` est « retiré du compte » ; `all_status` ne liste que les appareils **en ligne** |
| Un seul appareil muet | Piles (capteurs BLU / H&T), alimentation, Wi-Fi sur place. Ne pas confondre « hors ligne » et « retiré du compte » |
| Agrégats vides | `select fn_aggregate_horaire();` à la main, puis relire `cron.job_run_details` |
| `permission denied for table …` | Vous utilisez la clé anon : passer par le CLI (`supabase db query --linked`) ou la clé service-role |
| Timeout sur `shelly_cl_journalier` | Ajouter un filtre `ts`/jour étroit |

**Incident Académie (depuis le 25/09)** : 16 appareils muets, cause physique sur site (piles pleines, PV OK). Test de retour à l'état normal : relancer `routine_collecte.py` et vérifier que les appareils du site repassent au-dessus de 15 actifs.

## 7. Sauvegarde et capacité

- **Sauvegardes Supabase** : une sauvegarde physique par jour (~07:15 UTC), ~7 jours conservés, **sans PITR**. Vérifier : `supabase backups list --project-ref amctayugahwhxwytqiqf`. Elles sont dans le même compte que la base : insuffisant seul.
- **Export à toi** : `python SHELLY_GCP_00/scripts/export_supabase.py --out /Volumes/Lexar/SIME_BACKUP_SUPABASE` (SSD branché ; ~40 min pour tout, `--from AAAA-MM-JJ` pour l'incrémental). Produit tables en JSON, `shelly_cl` et `shelly_cl_horaire` en CSV.gz par mois, schéma (fonctions, cron, RLS) et `manifest.json` ; chaque mois est vérifié ligne par ligne. `shelly_accounts` (clés Shelly) est exclue. **Premier export fait le 2026-10-01** (10 019 467 lignes de `shelly_cl`, 178 Mo). **À refaire chaque mois** ; les buckets de stockage et `auth.users` ne sont pas inclus.
- Restaurer un mois : décompresser le CSV.gz et le recharger dans la table (colonnes = en-tête du fichier ; cellule vide = NULL).
- Capacité : base 3,46 Go (1er oct. 2026), seuil de 8 Go repoussé à mi-2028 ; la vraie question est la **rétention du brut**. Dédoublonner à l'ingestion réduirait le volume.
- Contrôle : `select pg_size_pretty(pg_database_size(current_database()));`

## 8. Gouvernance

- Périmètre Maurice : **module Mesures + IOT**. Facturation, Audits, Inventaire, Paramètres : Kevin.
- Git : commits sur `shift/Maurice` ; merge vers `dev` uniquement sur demande explicite.
- **Pas de déploiement front (Vercel) ni backend** pour l'instant (consigne du 2026-09-28). Autorisé sans redemander : Edge Functions, migrations, SQL prod, secrets Supabase.
- Backend sécurité reporté après la fusion avec Kevin ; voir `docs/securite.md`.

## 9. Analyses ponctuelles déjà faites

| Sujet | Scripts | Sorties |
|---|---|---|
| Météo Donsin, septembre 2026 | `SHELLY_GCP_00/analyses/meteo_donsin_2026-09/` (`analyse.py`, `build_outputs.py`) | Excel + PDF dans `~/Desktop/Meteo_Donsin_2026-09/` |
| Rapport de collecte quotidien | `SHELLY_GCP_00/scripts/routine_collecte.py` | PDF sur le Desktop |

Pour une autre période météo : changer les bornes de date dans la requête d'extraction (pagination par `ts`), puis relancer les deux scripts dans un venv avec `pandas matplotlib openpyxl reportlab`.
