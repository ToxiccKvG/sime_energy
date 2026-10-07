-- Rattrapage ponctuel de pluie_mm sur l'historique (stations avec compteur de pluie).
-- À lancer une fois, après 20261007_pluie_par_periode.sql.
update shelly_cl c
set pluie_mm = x.p
from (
  select id,
         round((case when precipitation_mm >= lag(precipitation_mm) over w then precipitation_mm - lag(precipitation_mm) over w
                     when precipitation_mm < lag(precipitation_mm) over w * 0.5 then precipitation_mm
                     else 0 end)::numeric, 2) as p,
         lag(precipitation_mm) over w as prec
  from shelly_cl
  where device_id in (select distinct device_id from shelly_cl_horaire where precipitation_mm is not null)
    and precipitation_mm is not null
  window w as (partition by device_id order by ts, id)
) x
where c.id = x.id and x.prec is not null;

update shelly_cl_horaire h
set pluie_mm = s.somme
from (
  select device_id, date_trunc('hour', ts at time zone 'UTC') as hr, sum(pluie_mm) as somme
  from shelly_cl
  where device_id in (select distinct device_id from shelly_cl_horaire where precipitation_mm is not null)
    and pluie_mm is not null
  group by 1, 2
) s
where h.device_id = s.device_id and h.ts_heure = s.hr;
