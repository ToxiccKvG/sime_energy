-- ============================================================
--  fn_profil_charge branchée sur le moteur de qualité — 2026-10-16
--
--  Avant : la fonction calculait elle-même coupures et reprises, et
--  écartait les familles sans énergie par une liste en dur
--  ('CAPTEUR_ENV', 'ETAT'). Ces règles vivent maintenant dans
--  qualite_regles / shelly_familles, évaluées par fn_qualite.
--
--  Maintenant :
--   - familles sans énergie lues dans shelly_familles.mesure_energie
--     (une famille inconnue est gardée : on ne jette pas ce qu'on ne
--     connaît pas) ;
--   - pour chaque appareil-jour, l'énergie BRUTE et la part en
--     QUARANTAINE (heures couvertes par une règle d'action « quarantaine »
--     de niveau horaire, ex. HORS_AFFECTATION), avec les règles en cause.
--     L'écran choisit d'exclure ou non, sans recharger ; rien n'est caché.
--   - coupures, reprises, journées incomplètes : demandées à fn_qualite
--     par l'écran (lib/iot-qualite-service.ts), plus calculées ici.
--
--  La signature de retour change : DROP puis CREATE.
-- ============================================================

drop function if exists fn_profil_charge(date, date, int, int, text[], text[]);

create function fn_profil_charge(
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
    select h.*, r.role, coalesce(r.sens_inverse, false) as inverse
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
    max(m.name),
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

comment on function fn_profil_charge is
  'Courbe de charge par appareil et par jour (plage horaire appliquée chaque jour), avec la part en quarantaine selon fn_qualite. Lue par pages par le front.';

revoke all on function fn_profil_charge(date, date, int, int, text[], text[]) from public;
grant execute on function fn_profil_charge(date, date, int, int, text[], text[]) to authenticated;
