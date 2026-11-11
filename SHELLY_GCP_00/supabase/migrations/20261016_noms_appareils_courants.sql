-- ============================================================
--  Noms d'appareils : le dernier connu, pas le plus grand — 2026-10-16
--
--  Constaté à Donsin (01→15/10) : un même capteur remonte sous deux
--  noms, son nom actuel et, certaines heures, son ancien nom (une
--  ancienne collecte écrit encore) :
--    0892724e2c28 « PC1 FOND_BUREAU KHEOPS »  / « Shelly Plug M_Donsin »
--    9070694642a8 « PC2 ENTREE_KHEOPS »       / « PC2_TBEA_DONSIN »
--  fn_profil_charge et fn_qualite prenaient max(name) : l'ordre
--  alphabétique affichait l'ancien nom la plupart des jours. Les totaux
--  étaient justes (regroupement par device_id), seuls les libellés
--  étaient faux. Désormais : le dernier nom connu sur la période.
--
--  Redéfinit les deux fonctions à l'identique, à ce point près.
-- ============================================================

create or replace function fn_qualite(
  p_date_debut  date,
  p_date_fin    date,
  p_heure_debut int     default 0,
  p_heure_fin   int     default 23,
  p_sites       text[]  default null,
  p_device_ids  text[]  default null
)
returns table(
  regle      text,
  action     text,
  niveau     text,
  debut      timestamptz,
  fin        timestamptz,
  nb_heures  int,
  site       text,
  device_id  text,
  nom        text,
  kwh        float8,
  valeur     float8,
  detail     jsonb
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
-- Les étapes intermédiaires (CTE) sont estimées à ~1 ligne au lieu de
-- milliers : Postgres choisissait des boucles imbriquées et la requête
-- dépassait 55 s sur 15 jours d'un seul site. Jointures par hachage forcées.
set enable_nestloop = off
as $$
with
-- ── Règles actives ─────────────────────────────────────────
regles as (
  select q.code, q.action, q.parametres p, q.familles, q.roles, q.sites
  from qualite_regles q
  where q.actif
),
-- ── Mesures : période + 1 h avant (pour « l'heure précédente ») ─
base as (
  select h.ts_heure, h.site, h.device_id, h.name, h.device_family, h.device_type,
         h.nb_mesures, h.nb_mesures_env, h.power_w_max,
         h.p_a_moy, h.p_b_moy, h.p_c_moy, h.v_a_moy, h.v_b_moy, h.v_c_moy, h.voltage_v_moy,
         h.temperature_min, h.temperature_max, h.temperature_moy, h.humidity_moy,
         coalesce(r.sens_inverse, false) as inverse,
         case when coalesce(r.sens_inverse, false) then h.wh_inj   else h.wh_conso end as wh,
         case when coalesce(r.sens_inverse, false) then h.wh_conso else h.wh_inj   end as wh_inj,
         r.role,
         coalesce(t.alimentation, 'inconnue')  as alimentation,
         coalesce(f.mesure_energie, false)     as mesure_energie,
         coalesce(f.emission_continue, false)  as emission_continue,
         -- Nom courant : le dernier connu sur la période (un capteur renommé, ou
         -- relu par une ancienne collecte, remonte sous deux noms)
         first_value(h.name) over (partition by h.device_id order by h.ts_heure desc) as nom_courant,
         lag(h.ts_heure)        over w as ts_prec,
         lag(h.temperature_moy) over w as temp_prec,
         lag(h.humidity_moy)    over w as hum_prec
  from shelly_cl_horaire h
  left join shelly_device_types t on t.device_type = h.device_type
  left join shelly_familles     f on f.code        = h.device_family
  left join shelly_device_roles r on r.device_id   = h.device_id
  where h.ts_heure >= p_date_debut::timestamp at time zone 'UTC' - interval '1 hour'
    and h.ts_heure <  (p_date_fin + 1)::timestamp at time zone 'UTC'
    and (p_sites is null or h.site = any(p_sites))
  window w as (partition by h.device_id order by h.ts_heure)
),
-- ── Fenêtre analysée (tous les appareils des sites : sert aux règles de site)
fenetre as (
  select b.*, b.ts_heure::date as jour
  from base b
  where b.ts_heure >= p_date_debut::timestamp at time zone 'UTC'
    and case when p_heure_debut <= p_heure_fin
             then extract(hour from b.ts_heure at time zone 'UTC') between p_heure_debut and p_heure_fin
             else extract(hour from b.ts_heure at time zone 'UTC') >= p_heure_debut
               or extract(hour from b.ts_heure at time zone 'UTC') <= p_heure_fin
        end
),
-- ── Appareils analysés (sélection) ──
sel as (
  select * from fenetre
  where p_device_ids is null or device_id = any(p_device_ids)
),
-- ── Heures attendues : la plage, chaque jour, jusqu'à l'heure en cours (exclue)
grille as (
  select g as ts_heure, g::date as jour
  from generate_series(p_date_debut::timestamp at time zone 'UTC',
                       (p_date_fin + 1)::timestamp at time zone 'UTC' - interval '1 hour',
                       interval '1 hour') g
  where g < date_trunc('hour', now())
    and case when p_heure_debut <= p_heure_fin
             then extract(hour from g at time zone 'UTC') between p_heure_debut and p_heure_fin
             else extract(hour from g at time zone 'UTC') >= p_heure_debut
               or extract(hour from g at time zone 'UTC') <= p_heure_fin
        end
),
attendues as (
  select jour, count(*)::int as h_attendues from grille group by 1
),
-- ── Appareils qui émettent réellement en continu ─────────────
--  Surveillés : tous les appareils des sites choisis vus dans les
--  historique_jours AVANT la période ou pendant celle-ci. Un appareil muet
--  du début à la fin de la période reste donc visible (Académie : la
--  plupart des appareils étaient déjà muets avant le 20/09).
--
--  Continu = famille à émission continue (jamais une lampe) + secteur +
--  les jours où il est EN VIE, il émet au moins presence_min des 24 h
--  (médiane). Une prise coupée au mur émet quelques heures puis se tait :
--  intermittente (Ventilo Air Flux, médiane 19,5 h). Un appareil mort
--  garde le profil de ses jours en vie : chaque heure de silence compte.
--  L'historique ne peut que rétrograder un appareil, jamais promouvoir une
--  famille intermittente.
param_continu as (
  select coalesce((p->>'presence_min')::float8, 0.9)   as presence_min,
         coalesce((p->>'historique_jours')::int, 30)   as historique_jours
  from (select p from regles where code = 'PERTE_COLLECTE'
        union all select '{}'::jsonb where not exists (select 1 from regles where code = 'PERTE_COLLECTE')) x
),
jours_vie as (
  select h.device_id, h.ts_heure::date as d, count(*) as h,
         (array_agg(h.name order by h.ts_heure desc))[1] as nom, max(h.site) as site, max(h.device_family) as famille, max(h.device_type) as device_type,
         min(h.ts_heure) as premier
  from shelly_cl_horaire h, param_continu pc
  where h.ts_heure >= p_date_debut::timestamp at time zone 'UTC' - make_interval(days => pc.historique_jours)
    and h.ts_heure <  (p_date_fin + 1)::timestamp at time zone 'UTC'
    and (p_sites      is null or h.site      = any(p_sites))
    and (p_device_ids is null or h.device_id = any(p_device_ids))
  group by 1, 2
),
continuite as (
  select j.device_id, (array_agg(j.nom order by j.d desc))[1] as nom, max(j.site) as site, max(j.famille) as famille, r.role,
         min(j.premier) as premier,
         percentile_cont(0.5) within group (order by j.h) as mediane_h,
         coalesce(t.alimentation, 'inconnue') = 'secteur'
           and coalesce(f.emission_continue, false)
           and percentile_cont(0.5) within group (order by j.h) >= max(pc.presence_min) * 24 as continu
  from jours_vie j
  cross join param_continu pc
  left join shelly_device_types t on t.device_type = j.device_type
  left join shelly_familles     f on f.code        = j.famille
  left join shelly_device_roles r on r.device_id   = j.device_id
  group by j.device_id, r.role, t.alimentation, f.emission_continue
),
-- ── Coupures par site et par heure (méthode validée le 24/09) ──
--  Minutes coupées = relevés des capteurs à pile − relevés des appareils
--  sur secteur. Un échec de poll fait taire les deux : il ne compte pas.
site_heure as (
  select fe.site, fe.ts_heure,
         greatest(0,
           coalesce(max(fe.nb_mesures) filter (where fe.alimentation = 'pile'), 0)
         - coalesce(max(fe.nb_mesures) filter (where fe.alimentation = 'secteur'), 0)
         ) as min_coupure
  from fenetre fe
  group by 1, 2
  having count(*) filter (where fe.alimentation = 'pile') > 0
),

-- ════════════════ Signalements horaires ════════════════
-- Colonnes : regle, action, ts_heure, site, device_id, nom, wh, valeur, detail

f_hors_affectation as (
  select 'HORS_AFFECTATION'::text as regle,
         case when cov.statut = 'incertain' and cov.site = s.site then 'signaler' else rg.action end as action,
         s.ts_heure, s.site, s.device_id, s.nom_courant as nom, s.wh, null::float8 as valeur,
         case when cov.device_id is null then jsonb_build_object('motif', 'hors de toute période d''affectation')
              when cov.site <> s.site   then jsonb_build_object('motif', 'affecté à un autre site', 'site_affecte', cov.site, 'libelle', cov.libelle)
              else jsonb_build_object('motif', 'affectation incertaine', 'libelle', cov.libelle) end as detail
  from sel s
  join regles rg on rg.code = 'HORS_AFFECTATION'
  left join lateral (
    select pe.device_id, pe.site, pe.libelle, pe.statut
    from shelly_device_periodes pe
    where pe.device_id = s.device_id
      and s.ts_heure >= pe.du and (pe.au is null or s.ts_heure < pe.au)
    order by pe.du desc limit 1
  ) cov on true
  where exists (select 1 from shelly_device_periodes pe where pe.device_id = s.device_id)
    and (cov.device_id is null or cov.site <> s.site or cov.statut = 'incertain')
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

f_fige as (
  select 'FIGE', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, null::float8, null::float8,
         jsonb_build_object('methode', 'à l''heure : ≤ 1 mesure distincte et mêmes valeurs que l''heure précédente')
  from sel s join regles rg on rg.code = 'FIGE'
  where coalesce(s.nb_mesures_env, 0) <= 1
    and s.ts_prec = s.ts_heure - interval '1 hour'
    and s.temperature_moy is not distinct from s.temp_prec
    and s.humidity_moy    is not distinct from s.hum_prec
    and (s.temperature_moy is not null or s.humidity_moy is not null)
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

f_hors_bornes as (
  select 'HORS_BORNES_ENV', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, null::float8,
         coalesce(case when s.temperature_min < (rg.p->'temperature_c'->>0)::float8 then s.temperature_min end,
                  case when s.temperature_max > (rg.p->'temperature_c'->>1)::float8 then s.temperature_max end,
                  s.humidity_moy),
         jsonb_build_object('temperature_min', s.temperature_min, 'temperature_max', s.temperature_max, 'humidite', s.humidity_moy)
  from sel s join regles rg on rg.code = 'HORS_BORNES_ENV'
  where (s.temperature_min < (rg.p->'temperature_c'->>0)::float8
      or s.temperature_max > (rg.p->'temperature_c'->>1)::float8
      or s.humidity_moy    < (rg.p->'humidite_pct'->>0)::float8
      or s.humidity_moy    > (rg.p->'humidite_pct'->>1)::float8)
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

f_tension as (
  -- 0 V n'est pas une tension : sur une prise, c'est le relais ouvert
  select 'TENSION_HORS_PLAGE', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, null::float8, v.v,
         jsonb_build_object('tension_v', round(v.v::numeric, 1))
  from sel s join regles rg on rg.code = 'TENSION_HORS_PLAGE'
  cross join lateral (
    select x as v from unnest(array[s.voltage_v_moy, s.v_a_moy, s.v_b_moy, s.v_c_moy]) x
    where x > 0 and (x < (rg.p->'tension_v'->>0)::float8 or x > (rg.p->'tension_v'->>1)::float8)
    order by abs(x - 230) desc limit 1
  ) v
  where (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

f_coupure as (
  select 'COUPURE', rg.action, sh.ts_heure, sh.site, null::text, null::text, null::float8, sh.min_coupure::float8,
         '{}'::jsonb
  from site_heure sh join regles rg on rg.code = 'COUPURE'
  where sh.min_coupure >= coalesce((rg.p->>'duree_min_minutes')::int, 5)
    and (rg.sites is null or sh.site = any(rg.sites))
),

-- Perte de collecte : heure entière absente pour un appareil continu,
-- sans coupure du site cette heure-là. Comptée à partir de sa première
-- apparition (un appareil installé en cours de période n'est pas « perdu »
-- avant), y compris s'il est muet pendant toute la période.
continus as (
  select ct.device_id, ct.nom, ct.site, ct.famille, ct.role, ct.premier
  from continuite ct
  where ct.continu
),
f_perte as (
  select 'PERTE_COLLECTE', rg.action, g.ts_heure, c.site, c.device_id, c.nom, null::float8, 60::float8,
         '{}'::jsonb
  from continus c
  join grille g on g.ts_heure >= c.premier
  join regles rg on rg.code = 'PERTE_COLLECTE'
  left join sel s on s.device_id = c.device_id and s.ts_heure = g.ts_heure
  left join site_heure sh on sh.site = c.site and sh.ts_heure = g.ts_heure
  where s.device_id is null
    and coalesce(sh.min_coupure, 0) < 55
    -- Affectation terminée (shelly_device_periodes) : plus attendu après
    and (not exists (select 1 from shelly_device_periodes pe where pe.device_id = c.device_id)
         or exists (select 1 from shelly_device_periodes pe
                    where pe.device_id = c.device_id and pe.site = c.site
                      and g.ts_heure >= pe.du and (pe.au is null or g.ts_heure < pe.au)))
    and (rg.familles is null or c.famille = any(rg.familles))
    and (rg.roles    is null or c.role    = any(rg.roles))
    and (rg.sites    is null or c.site    = any(rg.sites))
),

f_reprise as (
  select 'REPRISE', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, s.wh, s.wh,
         jsonb_build_object('heure_precedente', s.ts_prec)
  from sel s join regles rg on rg.code = 'REPRISE'
  where s.mesure_energie and s.wh > 0
    and s.ts_prec is distinct from s.ts_heure - interval '1 hour'
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

-- Valeur inhabituelle : > facteur × P99 de l'appareil sur son historique
-- (heures complètes), au moins min_wh, et assez d'historique.
p99 as (
  select h.device_id,
         percentile_cont(0.99) within group (order by case when coalesce(r.sens_inverse, false) then h.wh_inj else h.wh_conso end) as p99,
         count(distinct h.ts_heure::date) as jours
  from shelly_cl_horaire h
  left join shelly_device_roles r on r.device_id = h.device_id
  cross join (select p from regles where code = 'ABERRANT') rg
  where h.device_id in (select distinct device_id from sel where mesure_energie)
    and h.ts_heure >= (p_date_fin + 1)::timestamp at time zone 'UTC' - make_interval(days => coalesce((rg.p->>'historique_jours')::int, 90))
    and h.ts_heure <  (p_date_fin + 1)::timestamp at time zone 'UTC'
    and h.nb_mesures >= 55
  group by 1
),
f_aberrant as (
  select 'ABERRANT', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, s.wh, s.wh,
         jsonb_build_object('p99_wh', round(p.p99::numeric), 'facteur', (rg.p->>'facteur_p99')::float8)
  from sel s
  join p99 p on p.device_id = s.device_id
  join regles rg on rg.code = 'ABERRANT'
  where p.jours >= coalesce((rg.p->>'historique_min_jours')::int, 14)
    and s.wh > coalesce((rg.p->>'facteur_p99')::float8, 2) * p.p99
    and s.wh > coalesce((rg.p->>'min_wh')::float8, 20)
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

f_negatif as (
  select 'NEGATIF', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, s.wh, least(s.wh, s.wh_inj),
         jsonb_build_object('wh_conso', s.wh, 'wh_inj', s.wh_inj)
  from sel s join regles rg on rg.code = 'NEGATIF'
  where (s.wh < 0 or s.wh_inj < 0)
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

f_zero_arrivee as (
  select 'ZERO_ARRIVEE', rg.action, s.ts_heure, s.site, s.device_id, s.nom_courant, 0::float8, 0::float8,
         '{}'::jsonb
  from sel s
  join regles rg on rg.code = 'ZERO_ARRIVEE'
  left join site_heure sh on sh.site = s.site and sh.ts_heure = s.ts_heure
  where s.nb_mesures >= 55
    and coalesce(s.wh, 0) = 0
    and coalesce(sh.min_coupure, 0) < 5
    and (rg.roles    is null or s.role          = any(rg.roles))
    and (rg.familles is null or s.device_family = any(rg.familles))
    and (rg.sites    is null or s.site          = any(rg.sites))
),

horaires as (
  select * from f_hors_affectation
  union all select * from f_fige
  union all select * from f_hors_bornes
  union all select * from f_tension
  union all select * from f_coupure
  union all select * from f_perte
  union all select * from f_reprise
  union all select * from f_aberrant
  union all select * from f_negatif
  union all select * from f_zero_arrivee
),
-- Îlots : heures consécutives d'une même règle / action / appareil / site
ilots as (
  select hr.*,
         hr.ts_heure - (row_number() over (
           partition by hr.regle, hr.action, hr.site, hr.device_id
           order by hr.ts_heure) * interval '1 hour') as grp
  from horaires hr
),
plages as (
  select i.regle, i.action, 'heure'::text as niveau,
         min(i.ts_heure) as debut, max(i.ts_heure) + interval '1 hour' as fin,
         count(*)::int as nb_heures,
         i.site, i.device_id, max(i.nom) as nom,
         sum(i.wh) / 1000.0 as kwh,
         case when i.regle in ('COUPURE', 'PERTE_COLLECTE') then sum(i.valeur) else max(i.valeur) end as valeur,
         (array_agg(i.detail order by i.ts_heure))[1] as detail
  from ilots i
  group by i.regle, i.action, i.site, i.device_id, i.grp
),

-- ════════════════ Signalements journaliers ════════════════

-- Journée incomplète, pour chaque appareil à émission continue : une heure
-- entièrement coupée compte comme présente. Le jour en cours est toujours
-- incomplet (détail « en_cours »).
jours_app as (
  select s.device_id, max(s.nom_courant) nom, max(s.site) site, max(s.device_family) famille, max(s.role) role,
         s.jour, count(*)::int as h_presentes,
         sum(s.wh) / 1000.0 as kwh
  from sel s
  join continuite ct on ct.device_id = s.device_id and ct.continu
  group by s.device_id, s.jour
),
coupures_jour as (
  select sh.site, sh.ts_heure::date as jour, count(*) filter (where sh.min_coupure >= 55)::int as h_coupees
  from site_heure sh group by 1, 2
),
f_jour_incomplet as (
  select 'JOUR_INCOMPLET'::text as regle, rg.action, 'jour'::text as niveau,
         ja.jour::timestamp at time zone 'UTC' as debut,
         (ja.jour + 1)::timestamp at time zone 'UTC' as fin,
         ja.h_presentes as nb_heures, ja.site, ja.device_id, ja.nom, ja.kwh,
         (ja.h_presentes + coalesce(cj.h_coupees, 0))::float8 / nullif(a.h_attendues, 0) as valeur,
         jsonb_build_object('heures_presentes', ja.h_presentes, 'heures_coupees', coalesce(cj.h_coupees, 0),
                            'heures_attendues', a.h_attendues,
                            'en_cours', ja.jour = (now() at time zone 'UTC')::date) as detail
  from jours_app ja
  join regles rg on rg.code = 'JOUR_INCOMPLET'
  left join attendues a on a.jour = ja.jour
  left join coupures_jour cj on cj.site = ja.site and cj.jour = ja.jour
  where (ja.jour = (now() at time zone 'UTC')::date
         or (ja.h_presentes + coalesce(cj.h_coupees, 0)) < coalesce((rg.p->>'part_min_heures')::float8, 0.95) * a.h_attendues)
    and (rg.familles is null or ja.famille = any(rg.familles))
    and (rg.roles    is null or ja.role    = any(rg.roles))
    and (rg.sites    is null or ja.site    = any(rg.sites))
),

-- Départs > arrivée : règle de SITE, sur tous les appareils du site
f_departs as (
  select 'DEPARTS_SUP_ARRIVEE'::text, rg.action, 'jour'::text,
         d.jour::timestamp at time zone 'UTC', (d.jour + 1)::timestamp at time zone 'UTC',
         null::int, d.site, null::text, null::text, d.dep / 1000.0,
         d.dep / nullif(d.arr, 0),
         jsonb_build_object('kwh_arrivee', round((d.arr / 1000.0)::numeric, 3), 'kwh_departs', round((d.dep / 1000.0)::numeric, 3))
  from (
    select fe.site, fe.jour,
           coalesce(sum(fe.wh) filter (where fe.role = 'M1_RESEAU'), 0) arr,
           coalesce(sum(fe.wh) filter (where fe.role = 'DEPART'), 0)    dep
    from fenetre fe group by 1, 2
    having count(*) filter (where fe.role = 'M1_RESEAU') > 0
  ) d
  join regles rg on rg.code = 'DEPARTS_SUP_ARRIVEE'
  where d.dep > d.arr * (1 + coalesce((rg.p->>'tolerance_pct')::float8, 5) / 100.0)
    and (rg.sites is null or d.site = any(rg.sites))
),

-- Phases ≠ total : heures complètes seulement (sinon les coupures faussent l'écart)
f_phases as (
  select 'PHASES_TOTAL'::text, rg.action, 'jour'::text,
         x.jour::timestamp at time zone 'UTC', (x.jour + 1)::timestamp at time zone 'UTC',
         x.h::int, x.site, x.device_id, x.nom, x.tot / 1000.0,
         100.0 * (x.ph - x.tot) / nullif(x.tot, 0),
         jsonb_build_object('kwh_compteur', round((x.tot / 1000.0)::numeric, 3), 'kwh_phases', round((x.ph / 1000.0)::numeric, 3))
  from (
    select s.device_id, max(s.nom_courant) nom, max(s.site) site, max(s.device_family) famille, s.jour, count(*) h,
           sum(s.wh) tot,
           sum(greatest(0, coalesce(s.p_a_moy, 0)) + greatest(0, coalesce(s.p_b_moy, 0)) + greatest(0, coalesce(s.p_c_moy, 0))) ph
    from sel s
    join regles rg0 on rg0.code = 'PHASES_TOTAL'
    where s.nb_mesures >= coalesce((rg0.p->>'min_mesures_heure')::int, 55)
    group by s.device_id, s.jour
  ) x
  join regles rg on rg.code = 'PHASES_TOTAL'
  where x.tot > 100   -- au moins 0,1 kWh : en dessous l'écart relatif n'a pas de sens
    and abs(x.ph - x.tot) > coalesce((rg.p->>'tolerance_pct')::float8, 5) / 100.0 * x.tot
    and (rg.familles is null or x.famille = any(rg.familles))
    and (rg.sites    is null or x.site    = any(rg.sites))
)

select * from plages
union all select * from f_jour_incomplet
union all select * from f_departs
union all select * from f_phases
order by 4, 1, 7, 8
$$;


create or replace function fn_profil_charge(
  p_date_debut  date,
  p_date_fin    date,
  p_heure_debut int     default 0,
  p_heure_fin   int     default 23,
  p_sites       text[]  default null,
  p_device_ids  text[]  default null
)
returns table(
  jour            date,
  site            text,
  device_id       text,
  name            text,
  device_family   text,
  role            text,
  sens_inverse    boolean,
  wh_conso        float8,
  wh_inj          float8,
  wh_a            float8,
  wh_b            float8,
  wh_c            float8,
  nb_heures       int,
  nb_mesures      int,
  wh_conso_exclu  float8,
  wh_inj_exclu    float8,
  wh_a_exclu      float8,
  wh_b_exclu      float8,
  wh_c_exclu      float8,
  nb_h_exclues    int,
  regles_exclues  text[]
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
set enable_nestloop = off
as $$
  with
  -- MATERIALIZED : sinon fn_qualite peut être réévaluée pour chaque ligne
  quarantaine as materialized (
    select q.device_id, q.debut, q.fin, q.regle
    from fn_qualite(p_date_debut, p_date_fin, p_heure_debut, p_heure_fin, p_sites, p_device_ids) q
    where q.action = 'quarantaine' and q.niveau = 'heure' and q.device_id is not null
  ),
  fenetre as (
    select h.*, r.role, coalesce(r.sens_inverse, false) as inverse,
           first_value(h.name) over (partition by h.device_id order by h.ts_heure desc) as nom_courant
    from shelly_cl_horaire h
    left join shelly_device_roles r on r.device_id = h.device_id
    left join shelly_familles     f on f.code      = h.device_family
    where h.ts_heure >= p_date_debut::timestamp at time zone 'UTC'
      and h.ts_heure <  (p_date_fin + 1)::timestamp at time zone 'UTC'
      and (p_sites      is null or h.site      = any(p_sites))
      and (p_device_ids is null or h.device_id = any(p_device_ids))
      and coalesce(f.mesure_energie, true)
      and case when p_heure_debut <= p_heure_fin
               then extract(hour from h.ts_heure at time zone 'UTC') between p_heure_debut and p_heure_fin
               else extract(hour from h.ts_heure at time zone 'UTC') >= p_heure_debut
                 or extract(hour from h.ts_heure at time zone 'UTC') <= p_heure_fin
          end
  ),
  marque as (
    select fe.*,
           case when fe.inverse then fe.wh_inj   else fe.wh_conso end as conso,
           case when fe.inverse then fe.wh_conso else fe.wh_inj   end as inj,
           (select array_agg(distinct q.regle) from quarantaine q
             where q.device_id = fe.device_id and fe.ts_heure >= q.debut and fe.ts_heure < q.fin) as regles
    from fenetre fe
  )
  select
    m.ts_heure::date,
    m.site,
    m.device_id,
    max(m.nom_courant),
    max(m.device_family),
    max(m.role),
    bool_or(m.inverse),
    sum(m.conso),
    sum(m.inj),
    sum(greatest(0, coalesce(m.p_a_moy, 0))),
    sum(greatest(0, coalesce(m.p_b_moy, 0))),
    sum(greatest(0, coalesce(m.p_c_moy, 0))),
    count(*)::int,
    sum(m.nb_mesures)::int,
    coalesce(sum(m.conso) filter (where m.regles is not null), 0),
    coalesce(sum(m.inj)   filter (where m.regles is not null), 0),
    coalesce(sum(greatest(0, coalesce(m.p_a_moy, 0))) filter (where m.regles is not null), 0),
    coalesce(sum(greatest(0, coalesce(m.p_b_moy, 0))) filter (where m.regles is not null), 0),
    coalesce(sum(greatest(0, coalesce(m.p_c_moy, 0))) filter (where m.regles is not null), 0),
    (count(*) filter (where m.regles is not null))::int,
    -- string_agg plutôt qu'array_agg : des tableaux de longueurs différentes ne s'empilent pas
    (select array_agg(distinct x)
       from unnest(string_to_array(string_agg(array_to_string(m.regles, ','), ','), ',')) x)
  from marque m
  group by m.ts_heure::date, m.site, m.device_id
  order by 1, 2, 3
$$;

