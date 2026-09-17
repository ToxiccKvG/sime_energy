-- ============================================================
--  Module Mesures — persistance serveur des relevés
--
--  Jusqu'ici un relevé (fichier C.A 8335, logger H&T, export PV…) n'existait
--  que dans la session du navigateur : perdu au rechargement de la page.
--  Même découpage que iot_files (17/09) :
--    · measurement_files → métadonnées, listées à l'ouverture du module ;
--    · bucket measurement-files → le contenu (mesures normalisées renvoyées
--      par le backend) en JSON gzippé, un objet par relevé.
--  Isolation PAR UTILISATEUR (décision manager 2026-08-27), organization_id
--  conservé (nullable) pour un partage d'équipe futur.
-- ============================================================

create table if not exists measurement_files (
  id                uuid        primary key,
  organization_id   uuid        references organizations (id) on delete set null,
  created_by        uuid        not null references auth.users (id) on delete cascade,

  file_name         text        not null,
  alias             text,
  sensor_type       text        not null,          -- clé du registre backend ou 'CUSTOM'
  sensor_label      text,                          -- libellé du capteur (processing_info.sensor_label)
  metric_label      text,
  unit              text,
  quantity_kind     text        check (quantity_kind in ('power','energy','other')),
  measurement_count integer     not null default 0,
  period_start      timestamptz,
  period_end        timestamptz,

  storage_path      text,                          -- NULL tant que l'envoi n'a pas abouti
  content_encoding  text        not null default 'gzip' check (content_encoding in ('gzip','identity')),

  uploaded_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists measurement_files_created_by_idx on measurement_files (created_by, uploaded_at);

comment on table measurement_files is
  'Relevés du module Mesures (métadonnées). Contenu dans le bucket measurement-files. Isolation par utilisateur : created_by = auth.uid().';

create or replace function update_measurement_files_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_measurement_files_updated_at on measurement_files;
create trigger trg_measurement_files_updated_at
  before update on measurement_files
  for each row execute function update_measurement_files_updated_at();

alter table measurement_files enable row level security;

drop policy if exists "measurement_files_owner_select" on measurement_files;
drop policy if exists "measurement_files_owner_insert" on measurement_files;
drop policy if exists "measurement_files_owner_update" on measurement_files;
drop policy if exists "measurement_files_owner_delete" on measurement_files;

create policy "measurement_files_owner_select" on measurement_files
  for select to authenticated using (created_by = auth.uid());
create policy "measurement_files_owner_insert" on measurement_files
  for insert to authenticated with check (created_by = auth.uid());
create policy "measurement_files_owner_update" on measurement_files
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "measurement_files_owner_delete" on measurement_files
  for delete to authenticated using (created_by = auth.uid());

revoke all on measurement_files from anon, public;
grant select, insert, update, delete on measurement_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('measurement-files', 'measurement-files', false, 52428800, array['application/gzip', 'application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "measurement_files_storage_select" on storage.objects;
drop policy if exists "measurement_files_storage_insert" on storage.objects;
drop policy if exists "measurement_files_storage_update" on storage.objects;
drop policy if exists "measurement_files_storage_delete" on storage.objects;

create policy "measurement_files_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'measurement-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "measurement_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'measurement-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "measurement_files_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'measurement-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'measurement-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "measurement_files_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'measurement-files' and (storage.foldername(name))[1] = auth.uid()::text);
