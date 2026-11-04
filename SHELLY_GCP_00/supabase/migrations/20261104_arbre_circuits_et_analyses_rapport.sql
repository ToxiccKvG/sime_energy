-- ============================================================
--  Arbre des circuits + données du rapport enrichi — 2026-11-04
--
--  1. shelly_device_roles.parent_device_id : quel compteur alimente ce
--     circuit. Sans cet arbre, des départs imbriqués étaient additionnés :
--     à la Mosquée le 31/10, 18,46 kWh de « départs » pour 8,94 kWh d'arrivée,
--     d'où une fausse alerte « Départs supérieurs à l'arrivée ».
--     Un site sans arbre déclaré reste à plat, comme avant.
--  2. fn_qualite : cette alerte ne compare que les départs de premier niveau.
--  3. Fonctions de lecture du rapport (heures, voies, pics, cohérence). Elles
--     sont en security invoker : la RLS de l'organisation s'applique.
--     Aucune n'écrit, et aucune n'appelle fn_qualite : elles sont lues par
--     pages, et fn_qualite serait réévaluée à chaque page.
-- ============================================================

-- ── 1. Arbre ─────────────────────────────────────────────────
alter table shelly_device_roles
  add column if not exists parent_device_id text
    references shelly_device_roles(device_id) on delete set null;

alter table shelly_device_roles drop constraint if exists shelly_device_roles_parent_distinct;
alter table shelly_device_roles
  add constraint shelly_device_roles_parent_distinct check (parent_device_id is null or parent_device_id <> device_id);

comment on column shelly_device_roles.parent_device_id is
  'Compteur qui alimente ce circuit (ex. Morgue alimentée par RDC + morgue). null = pas de compteur amont déclaré. Une branche imbriquée n''est jamais additionnée à son parent.';

-- Mosquée Sacré Cœur : câblage de la campagne de mesure (bilan du 01/11/2026)
update shelly_device_roles set parent_device_id = '34945475ec75' where device_id in ('08f9e047b1b2', '483fdac3b59d'); -- SENELEC → Nouveau, Ancien
update shelly_device_roles set parent_device_id = '08f9e047b1b2' where device_id in ('483fdac3d79c', '34945475f173'); -- Nouveau → RDC + morgue, R+1
update shelly_device_roles set parent_device_id = '483fdac3d79c' where device_id = '841fe890f0d0';                     -- RDC + morgue → Morgue
update shelly_device_roles set parent_device_id = '34945475f173' where device_id in ('8c4f00dba0c4', '8c4f00dba0c4_1'); -- R+1 → Éclairage, Sono

insert into site_bilan (site, methode, explication)
values ('Mosquée Sacré Cœur', 'arrivee', 'Le compteur général SENELEC alimente toute la mosquée : il mesure la consommation.')
on conflict (site) do nothing;

-- ── 2. Alerte « Départs supérieurs à l'arrivée » ─────────────
do $migration$
declare
  v_def text;
  v_avant constant text := $t$coalesce(sum(fe.wh) filter (where fe.role = 'DEPART'), 0)$t$;
  v_apres constant text := $t$coalesce(sum(fe.wh) filter (where fe.role = 'DEPART' and fe.device_id not in (
             select d.device_id from shelly_device_roles d
             join shelly_device_roles pa on pa.device_id = d.parent_device_id
             where pa.role = 'DEPART')), 0)$t$;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'fn_qualite';
  if position(v_apres in v_def) > 0 then
    return; -- déjà appliquée
  end if;
  if position(v_avant in v_def) = 0 then
    raise exception 'fn_qualite : calcul des départs introuvable, migration à revoir';
  end if;
  execute replace(v_def, v_avant, v_apres);
end
$migration$;

-- ── 3a. Énergie par heure et par appareil ────────────────────
drop function if exists fn_profil_horaire(date, date, int, int, text[], text[]);
create function fn_profil_horaire(
  p_date_debut  date,
  p_date_fin    date,
  p_heure_debut int     default 0,
  p_heure_fin   int     default 23,
  p_sites       text[]  default null,
  p_device_ids  text[]  default null
)
returns table(
  ts_heure timestamptz, site text, device_id text, name text, device_family text,
  role text, parent_device_id text,
  wh_conso float8, wh_inj float8, w_moy float8, w_max float8,
  wh_a float8, wh_b float8, wh_c float8,
  nb_mesures_reelles int
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
as $$
  select h.ts_heure, h.site, h.device_id, h.name, h.device_family,
         r.role, r.parent_device_id,
         -- Même convention que fn_profil_charge : TC inversé = compteurs permutés
         case when coalesce(r.sens_inverse, false) then h.wh_inj else h.wh_conso end,
         case when coalesce(r.sens_inverse, false) then h.wh_conso else h.wh_inj end,
         h.power_w_moy, h.power_w_max,
         greatest(0, coalesce(h.p_a_moy, 0)), greatest(0, coalesce(h.p_b_moy, 0)), greatest(0, coalesce(h.p_c_moy, 0)),
         h.nb_mesures_reelles
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
  order by h.ts_heure, h.device_id
$$;

revoke all on function fn_profil_horaire(date, date, int, int, text[], text[]) from public;
grant execute on function fn_profil_horaire(date, date, int, int, text[], text[]) to authenticated;

-- ── 3b. Grille de puissance à la minute ──────────────────────
--  Les Shelly 3EM n'envoient une nouvelle mesure que si la valeur change, ou
--  au plus toutes les ~10 min : la dernière mesure reste valable, au plus
--  12 minutes. Au-delà, la minute reste sans valeur (jamais 0).
create or replace function fn_grille_puissance_minute(p_debut timestamptz, p_fin timestamptz, p_device_ids text[])
returns table(minute timestamptz, device_id text, power_w float8)
language sql
stable
security invoker
set search_path = public
as $$
  with
  brut as (
    select c.device_id, date_trunc('minute', c.ts) as m, (array_agg(c.power_w order by c.ts desc))[1] as p
    from shelly_cl c
    where c.ts >= p_debut - interval '12 minutes' and c.ts < p_fin
      and c.device_id = any(p_device_ids) and c.power_w is not null
    group by 1, 2
  ),
  grille as (
    select d as device_id, m
    from unnest(p_device_ids) d
    cross join generate_series(date_trunc('minute', p_debut - interval '12 minutes'), p_fin - interval '1 minute', interval '1 minute') m
  ),
  jointe as (
    select g.device_id, g.m, b.p,
           count(b.p) over (partition by g.device_id order by g.m) as grp
    from grille g left join brut b on b.device_id = g.device_id and b.m = g.m
  ),
  reportee as (
    select j.device_id, j.m,
           first_value(j.p) over (partition by j.device_id, j.grp order by j.m) as v,
           row_number() over (partition by j.device_id, j.grp order by j.m) - 1 as age
    from jointe j
  )
  select r.m, r.device_id, r.v
  from reportee r
  where r.age <= 12 and r.v is not null and r.m >= p_debut
$$;

revoke all on function fn_grille_puissance_minute(timestamptz, timestamptz, text[]) from public;
grant execute on function fn_grille_puissance_minute(timestamptz, timestamptz, text[]) to authenticated;

-- Appareils d'énergie présents sur le périmètre
create or replace function fn_appareils_energie(p_debut timestamptz, p_fin timestamptz, p_sites text[], p_device_ids text[])
returns text[]
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(array_agg(distinct h.device_id), '{}')
  from shelly_cl_horaire h
  left join shelly_familles f on f.code = h.device_family
  where h.ts_heure >= date_trunc('hour', p_debut) and h.ts_heure < p_fin
    and (p_sites is null or h.site = any(p_sites))
    and (p_device_ids is null or h.device_id = any(p_device_ids))
    and coalesce(f.mesure_energie, true)
    and h.nb_mesures_reelles > 0
$$;

revoke all on function fn_appareils_energie(timestamptz, timestamptz, text[], text[]) from public;
grant execute on function fn_appareils_energie(timestamptz, timestamptz, text[], text[]) to authenticated;

-- ── 3c. Synthèse d'une voie : puissances, talon, tensions ────
--  Un appel par appareil : l'index (device_id, ts) porte chacun, et un appareil
--  qui échoue n'emporte pas les autres. Aucun appel n'atteint le délai sur un
--  mois, alors qu'une lecture groupée de 18 appareils le dépassait.
--  La puissance moyenne se déduit de l'énergie et des heures couvertes (côté rapport).
--  Talon = médiane de la puissance moyenne horaire sur [p_talon_debut ; p_talon_fin[ .
--  Tensions inférieures à 50 V ignorées : relais ouvert, pas une mesure réseau.
drop function if exists fn_voies_minute(timestamptz, timestamptz, text[], text[], int, int);
create or replace function fn_voie_minute(
  p_device_id text, p_debut timestamptz, p_fin timestamptz,
  p_talon_debut int default 0, p_talon_fin int default 3
)
returns table(
  device_id text, nb_releves int, p_max float8, heure_p_max timestamptz,
  p_min float8, talon_w float8, v_min float8, v_max float8
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
as $$
  with
  brut as materialized (
    select c.ts, c.power_w, c.v_a, c.v_b, c.v_c, c.voltage_v
    from shelly_cl c
    where c.device_id = p_device_id and c.ts >= p_debut and c.ts < p_fin
  ),
  stats as (
    select count(b.power_w)::int as n, max(b.power_w) as maxi, min(b.power_w) as mini,
           (array_agg(b.ts order by b.power_w desc nulls last, b.ts))[1] as ts_max
    from brut b
  ),
  tensions as (
    select min(t.v) as vmin, max(t.v) as vmax
    from (select unnest(array[b.v_a, b.v_b, b.v_c, b.voltage_v]) as v from brut b) t
    where t.v >= 50
  ),
  talon as (
    select percentile_cont(0.5) within group (order by h.power_w_moy) as w
    from shelly_cl_horaire h
    where h.device_id = p_device_id
      and h.ts_heure >= date_trunc('hour', p_debut) and h.ts_heure < p_fin
      and extract(hour from h.ts_heure at time zone 'UTC') >= p_talon_debut
      and extract(hour from h.ts_heure at time zone 'UTC') <  p_talon_fin
      and h.power_w_moy is not null
  )
  select p_device_id, s.n, s.maxi, date_trunc('minute', s.ts_max), s.mini, ta.w, t.vmin, t.vmax
  from stats s, tensions t, talon ta
  where s.n > 0
$$;

revoke all on function fn_voie_minute(text, timestamptz, timestamptz, int, int) from public;
grant execute on function fn_voie_minute(text, timestamptz, timestamptz, int, int) to authenticated;

-- ── 3d. Les minutes les plus fortes d'un compteur, et chaque circuit à ce moment ──
--  Pour chaque circuit : sa dernière mesure dans les 12 minutes précédentes.
create or replace function fn_pics_minute(
  p_debut timestamptz, p_fin timestamptz, p_compteur text,
  p_sites text[] default null, p_device_ids text[] default null, p_nb int default 15
)
returns table(minute timestamptz, power_w float8, circuits jsonb)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
as $$
  with
  top as (
    select date_trunc('minute', c.ts) as m, max(c.power_w) as p
    from shelly_cl c
    where c.device_id = p_compteur and c.ts >= p_debut and c.ts < p_fin and c.power_w is not null
    group by 1
    order by 2 desc, 1
    limit p_nb
  ),
  ids as (select unnest(fn_appareils_energie(p_debut, p_fin, p_sites, p_device_ids)) as id)
  select t.m, t.p,
         coalesce((
           select jsonb_object_agg(ids.id, round(d.power_w::numeric, 1))
           from ids
           cross join lateral (
             select c.power_w from shelly_cl c
             where c.device_id = ids.id
               and c.ts > t.m - interval '12 minutes' and c.ts < t.m + interval '1 minute'
               and c.power_w is not null
             order by c.ts desc limit 1
           ) d
         ), '{}'::jsonb)
  from top t
  order by t.p desc, t.m
$$;

revoke all on function fn_pics_minute(timestamptz, timestamptz, text, text[], text[], int) from public;
grant execute on function fn_pics_minute(timestamptz, timestamptz, text, text[], text[], int) to authenticated;

-- ── 3e. Cohérence de l'arbre : parent = somme de ses enfants, minute par minute ──
--  Concordance à ± max(30 W ; 5 % du parent), sur les minutes où le parent et
--  tous ses enfants ont une valeur. Un parent sans enfant déclaré n'est pas évalué.
create or replace function fn_coherence_circuits(
  p_debut timestamptz, p_fin timestamptz,
  p_sites text[] default null, p_device_ids text[] default null
)
returns table(
  parent_device_id text, nb_enfants int, minutes_communes int, minutes_ok int,
  ecart_median_w float8, ecart_p95_w float8
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
set enable_nestloop = off
as $$
  with
  ids as materialized (select fn_appareils_energie(p_debut, p_fin, p_sites, p_device_ids) as a),
  liens as materialized (
    select r.parent_device_id as parent, r.device_id as enfant
    from shelly_device_roles r, ids
    where r.parent_device_id = any(ids.a) and r.device_id = any(ids.a)
  ),
  -- Grille sur les seuls appareils de l'arbre : un site à plat ne coûte rien
  arbre as materialized (
    select coalesce(array_agg(distinct x), '{}') as a
    from liens l, unnest(array[l.parent, l.enfant]) x
  ),
  g as materialized (select x.* from arbre, fn_grille_puissance_minute(p_debut, p_fin, arbre.a) x),
  enfants as (
    select l.parent, g.minute, sum(g.power_w) as somme, count(*) as nb
    from liens l join g on g.device_id = l.enfant
    group by 1, 2
  ),
  nb as (select l.parent, count(*)::int as n from liens l group by 1),
  ecarts as (
    select e.parent, p.power_w - e.somme as ecart, greatest(30, 0.05 * abs(p.power_w)) as tol
    from enfants e
    join nb on nb.parent = e.parent and nb.n = e.nb
    join g p on p.device_id = e.parent and p.minute = e.minute
  )
  select x.parent, nb.n, count(*)::int, (count(*) filter (where abs(x.ecart) <= x.tol))::int,
         percentile_cont(0.5) within group (order by x.ecart),
         percentile_cont(0.95) within group (order by abs(x.ecart))
  from ecarts x join nb on nb.parent = x.parent
  group by x.parent, nb.n
$$;

revoke all on function fn_coherence_circuits(timestamptz, timestamptz, text[], text[]) from public;
grant execute on function fn_coherence_circuits(timestamptz, timestamptz, text[], text[]) to authenticated;
