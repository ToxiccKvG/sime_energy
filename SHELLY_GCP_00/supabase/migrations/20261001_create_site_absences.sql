-- ============================================================
--  Absences déclarées d'un site (voyage, fermeture, arrêt volontaire)
--
--  Pourquoi : quand les occupants coupent le disjoncteur ou débranchent
--  des appareils, la signature est la même qu'une coupure SENELEC
--  (appareils secteur muets, capteurs à pile actifs). Sans cette table,
--  la détection des coupures compterait un départ en voyage comme une
--  panne, et le profil de référence de l'énergie non distribuée serait
--  faussé par des jours à consommation de veille.
--
--  Utilisée par : scripts/routine_collecte.py (ne pas alerter sur les
--  appareils muets pendant l'absence) et la détection des coupures.
--  end_at NULL = absence en cours.
-- ============================================================

create table if not exists site_absences (
  id         uuid        primary key default gen_random_uuid(),
  site       text        not null,              -- même valeur que shelly_cl.site
  start_at   timestamptz not null,
  end_at     timestamptz,                       -- NULL = en cours
  note       text,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint site_absences_dates_ck check (end_at is null or end_at > start_at)
);

create index if not exists site_absences_site_start_idx on site_absences (site, start_at);

alter table site_absences enable row level security;

-- Même niveau que shelly_device_roles : lecture/écriture pour les utilisateurs connectés, rien en anonyme.
drop policy if exists site_absences_authenticated_rw on site_absences;
create policy site_absences_authenticated_rw on site_absences
  for all to authenticated
  using (true) with check (true);
