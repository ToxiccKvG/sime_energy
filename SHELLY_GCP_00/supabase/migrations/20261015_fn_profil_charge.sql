-- ============================================================
--  fn_profil_charge — courbe de charge agrégée par appareil et par jour
--  2026-10-15
--
--  Bug corrigé : l'onglet Courbe de charge lisait shelly_cl_horaire
--  ligne à ligne, sans pagination. PostgREST s'arrête à 1000 lignes :
--  à Ma Maison (~20 appareils × 24 h) tout ce qui dépasse ~2 jours était
--  coupé sans avertissement. On agrège ici (une ligne par appareil-jour),
--  le front pagine par-dessus : aucune troncature possible.
--
--  Plage horaire : De/À s'appliquent CHAQUE JOUR (heures d'activité),
--  plus « du jour D à H1 jusqu'au jour D' à H2 ». Une plage qui passe
--  minuit (22 → 6) est acceptée ; chaque heure reste rattachée à son jour
--  calendaire. ts_heure est en UTC = heure locale (Sénégal, Burkina).
--
--  Ce que la fonction fournit en plus des énergies, pour le nettoyage
--  côté front (la base n'est jamais modifiée) :
--   - nb_heures           : heures présentes, à comparer aux heures attendues
--   - min_coupure_site    : minutes de coupure du site ce jour-là, méthode
--                           validée le 24/09 : appareils secteur muets
--                           pendant que les capteurs à pile (SB*, S3SN*)
--                           émettent. Un échec de poll fait taire les deux,
--                           il ne compte donc pas comme coupure.
--   - h_coupure_site      : heures entièrement coupées (≥ 55 min)
--   - wh_reprise          : énergie des heures qui suivent une heure absente.
--                           Le compteur étant cumulatif, l'énergie d'un trou
--                           de collecte retombe sur l'heure de reprise : le
--                           total du jour est juste, la courbe horaire montre
--                           un pic. Signalé, jamais retiré.
--   - role / sens_inverse : depuis shelly_device_roles. sens_inverse
--                           (TC monté à l'envers) est appliqué ici :
--                           conso et injection sont échangées.
--
--  Écarté volontairement : un test « énergie de l'heure > puissance max ×
--  1 h ». Essayé sur Ma Maison (01→15/10), il ne ressortait que des faux
--  positifs : le micro-ondes chauffe quelques minutes entre deux relevés à
--  la minute, la puissance max relevée rate le pic alors que le compteur
--  d'énergie est juste. Il aurait mis de la vraie consommation en quarantaine.
-- ============================================================

create or replace function fn_profil_charge(
  p_date_debut  date,
  p_date_fin    date,
  p_heure_debut int     default 0,
  p_heure_fin   int     default 23,
  p_sites       text[]  default null,
  p_device_ids  text[]  default null
)
returns table(
  jour              date,
  site              text,
  device_id         text,
  name              text,
  device_family     text,
  role              text,
  sens_inverse      boolean,
  wh_conso          float8,
  wh_inj            float8,
  wh_a              float8,
  wh_b              float8,
  wh_c              float8,
  nb_heures         int,
  nb_mesures        int,
  min_coupure_site  int,
  h_coupure_site    int,
  wh_reprise        float8,
  nb_h_reprise      int
)
language sql
stable
security invoker
set search_path = public
set statement_timeout = '55s'
as $$
  with base as (
    -- Toutes les heures de la période (+1 h avant) : la reprise se juge sur
    -- la vraie heure précédente, pas sur la précédente de la plage horaire
    select h.*,
           (h.device_type like 'SB%' or h.device_type like 'S3SN%') as pile,
           (lag(h.ts_heure) over w is distinct from h.ts_heure - interval '1 hour') as reprise
    from shelly_cl_horaire h
    where h.ts_heure >= p_date_debut::timestamp at time zone 'UTC' - interval '1 hour'
      and h.ts_heure <  (p_date_fin + 1)::timestamp at time zone 'UTC'
      and (p_sites is null or h.site = any(p_sites))
    window w as (partition by h.device_id order by h.ts_heure)
  ),
  fenetre as (
    select b.*
    from base b
    where b.ts_heure >= p_date_debut::timestamp at time zone 'UTC'
      and case when p_heure_debut <= p_heure_fin
               then extract(hour from b.ts_heure at time zone 'UTC') between p_heure_debut and p_heure_fin
               else extract(hour from b.ts_heure at time zone 'UTC') >= p_heure_debut
                 or extract(hour from b.ts_heure at time zone 'UTC') <= p_heure_fin
          end
  ),
  -- Coupure par site et par heure : tous les appareils du site comptent
  -- (même hors sélection) ; c'est le site qui est coupé, pas l'appareil.
  site_heure as (
    select f.site, f.ts_heure,
           greatest(0,
             coalesce(max(f.nb_mesures) filter (where f.pile), 0)
             - coalesce(max(f.nb_mesures) filter (where not f.pile), 0)
           ) as min_coupure
    from fenetre f
    group by 1, 2
    having count(*) filter (where f.pile) > 0
  ),
  site_jour as (
    select s.site, s.ts_heure::date as jour,
           sum(s.min_coupure)::int                          as min_coupure,
           count(*) filter (where s.min_coupure >= 55)::int as h_coupure
    from site_heure s
    group by 1, 2
  ),
  energie as (
    select f.*,
           coalesce(r.sens_inverse, false) as inverse,
           r.role
    from fenetre f
    left join shelly_device_roles r on r.device_id = f.device_id
    where (p_device_ids is null or f.device_id = any(p_device_ids))
      and coalesce(f.device_family, '') not in ('CAPTEUR_ENV', 'ETAT')
  )
  select
    e.ts_heure::date                                            as jour,
    e.site,
    e.device_id,
    max(e.name)                                                 as name,
    max(e.device_family)                                        as device_family,
    max(e.role)                                                 as role,
    bool_or(e.inverse)                                          as sens_inverse,
    sum(case when e.inverse then e.wh_inj   else e.wh_conso end) as wh_conso,
    sum(case when e.inverse then e.wh_conso else e.wh_inj   end) as wh_inj,
    sum(greatest(0, coalesce(e.p_a_moy, 0)))                    as wh_a,
    sum(greatest(0, coalesce(e.p_b_moy, 0)))                    as wh_b,
    sum(greatest(0, coalesce(e.p_c_moy, 0)))                    as wh_c,
    count(*)::int                                               as nb_heures,
    sum(e.nb_mesures)::int                                      as nb_mesures,
    coalesce(max(sj.min_coupure), 0)                            as min_coupure_site,
    coalesce(max(sj.h_coupure), 0)                              as h_coupure_site,
    coalesce(sum(e.wh_conso) filter (where e.reprise and e.wh_conso > 0), 0) as wh_reprise,
    (count(*) filter (where e.reprise and e.wh_conso > 0))::int              as nb_h_reprise
  from energie e
  left join site_jour sj on sj.site = e.site and sj.jour = e.ts_heure::date
  group by 1, 2, 3
  order by 1, 2, 3
$$;

comment on function fn_profil_charge is
  'Courbe de charge par appareil et par jour sur une plage horaire quotidienne, avec indicateurs de nettoyage (complétude, coupures, reprises après trou). Remplace une lecture ligne à ligne tronquée à 1000 lignes.';

revoke all on function fn_profil_charge(date, date, int, int, text[], text[]) from public;
grant execute on function fn_profil_charge(date, date, int, int, text[], text[]) to authenticated;
