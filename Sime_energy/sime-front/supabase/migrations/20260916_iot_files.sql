-- ============================================================
--  Module IOT — persistance serveur des fichiers importés
--
--  Jusqu'ici l'onglet Fichiers vivait entièrement en localStorage
--  (clé sime-iot-v3) : aucune reprise sur un autre poste, aucune
--  isolation entre utilisateurs d'un même navigateur, et perte
--  SILENCIEUSE au-delà du quota (~5 Mo, atteint dès ~4 000 lignes
--  nettoyées puisque chaque ShellyRow sérialisée pèse ~1,3 Ko).
--
--  Découpage :
--    · iot_files      → métadonnées + aperçu (10 lignes), petites
--                       lignes lues à chaque ouverture du module ;
--    · bucket iot-files → le contenu complet (rawData) en JSON gzippé,
--                       téléchargé à la première ouverture du fichier.
--  On ne met pas 12 Mo de jsonb dans une colonne : PostgREST
--  sérialiserait tout à chaque liste.
--
--  Isolation PAR UTILISATEUR (décision manager 2026-08-27) : chacun
--  ne voit que ses propres fichiers — contrairement au module Audits
--  qui partage par organisation. organization_id est tout de même
--  stocké pour permettre un partage d'équipe plus tard sans migration
--  de données ; il est nullable car un utilisateur peut ne pas avoir
--  d'organisation (OrganizationContext → null).
-- ============================================================

create table if not exists iot_files (
  id               uuid        primary key,
  organization_id  uuid        references organizations (id) on delete set null,
  created_by       uuid        not null references auth.users (id) on delete cascade,

  name             text        not null,
  type             text        not null check (type in ('shelly','autre','facture')),
  statut           text        not null default 'original' check (statut in ('original','nettoyé','analysé')),
  row_count        integer     not null default 0,
  columns          jsonb       not null default '[]',
  preview          jsonb       not null default '[]',
  taille           integer,
  -- Fichier nettoyé → son original. Pas de cascade : supprimer un
  -- original ne doit pas faire disparaître le travail de nettoyage.
  parent_id        uuid        references iot_files (id) on delete set null,
  device_location  text,
  device_room      text,

  -- Objet du bucket iot-files portant rawData. NULL tant que l'envoi
  -- n'a pas abouti : la ligne existe (liste), le contenu non.
  storage_path     text,
  content_encoding text        not null default 'gzip' check (content_encoding in ('gzip','identity')),

  uploaded_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists iot_files_created_by_idx on iot_files (created_by, uploaded_at desc);
create index if not exists iot_files_parent_idx     on iot_files (parent_id) where parent_id is not null;

comment on table iot_files is
  'Fichiers importés du module IOT (métadonnées + aperçu). Le contenu complet est dans le bucket iot-files. Isolation par utilisateur : created_by = auth.uid().';

-- ── updated_at (même pattern que shelly_accounts / shelly_device_roles) ──
create or replace function update_iot_files_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_iot_files_updated_at on iot_files;
create trigger trg_iot_files_updated_at
  before update on iot_files
  for each row execute function update_iot_files_updated_at();

-- ── RLS : l'utilisateur ne voit et ne touche que ses fichiers ──────
alter table iot_files enable row level security;

drop policy if exists "iot_files_owner_select" on iot_files;
drop policy if exists "iot_files_owner_insert" on iot_files;
drop policy if exists "iot_files_owner_update" on iot_files;
drop policy if exists "iot_files_owner_delete" on iot_files;

create policy "iot_files_owner_select" on iot_files
  for select to authenticated using (created_by = auth.uid());
create policy "iot_files_owner_insert" on iot_files
  for insert to authenticated with check (created_by = auth.uid());
create policy "iot_files_owner_update" on iot_files
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "iot_files_owner_delete" on iot_files
  for delete to authenticated using (created_by = auth.uid());

-- Même hygiène que l'audit du 2026-09-15 : rien pour anon, pas de TRUNCATE.
revoke all on iot_files from anon, public;
grant select, insert, update, delete on iot_files to authenticated;

-- ── Bucket privé pour le contenu ───────────────────────────────────
-- 50 Mo comme audit-documents ; le JSON est gzippé côté navigateur
-- (CompressionStream), 'identity' n'est qu'un repli pour les
-- navigateurs sans cette API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('iot-files', 'iot-files', false, 52428800, array['application/gzip', 'application/json'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Chemin des objets : {auth.uid()}/{iot_files.id}.json[.gz]
-- Le premier segment du chemin EST le propriétaire : c'est ce que les
-- policies vérifient, pas la colonne owner (posée par le client).
drop policy if exists "iot_files_storage_select" on storage.objects;
drop policy if exists "iot_files_storage_insert" on storage.objects;
drop policy if exists "iot_files_storage_update" on storage.objects;
drop policy if exists "iot_files_storage_delete" on storage.objects;

create policy "iot_files_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'iot-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "iot_files_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'iot-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "iot_files_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'iot-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'iot-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "iot_files_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'iot-files' and (storage.foldername(name))[1] = auth.uid()::text);
