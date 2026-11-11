-- ============================================================
--  Recettes de nettoyage — 2026-10-16
--
--  Avant : « Sauvegarder » dans le Nettoyage écrivait une COPIE des
--  données nettoyées (iot_files). Une copie abîmée le restait : les
--  fichiers « Ma Maison … nettoyé » et « Académie PV … nettoyé » ne
--  gardaient que l'heure de 23 h de chaque jour (supprimés le 16/10).
--
--  Maintenant : on enregistre une RECETTE — ce qu'on a chargé, selon
--  quelles règles, et ce qu'on a exclu. La rouvrir rejoue exactement la
--  même analyse sur les données brutes, qui ne sont jamais réécrites.
--
--  Visibilité : toute l'organisation (décision de Maurice, 16/10) — une
--  analyse validée doit pouvoir être reprise par un collègue. Seul
--  l'auteur peut la modifier ou la supprimer.
-- ============================================================

create table if not exists analyse_recettes (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null,
  nom               text        not null,
  description       text,
  -- Chargement à rejouer : sites, appareils, dates, granularité, colonnes…
  chargement        jsonb       not null,
  -- Règles de qualité dont les plages sont exclues des calculs
  regles_exclues    text[]      not null default '{}',
  -- Exclusions manuelles : [{ device_id, debut, fin, motif }]
  exclusions        jsonb       not null default '[]'::jsonb,
  -- Version des règles au moment de l'enregistrement (qualite_regles.modifie_le max)
  regles_au         timestamptz,
  cree_par          uuid        references auth.users (id) on delete set null default auth.uid(),
  cree_le           timestamptz not null default now(),
  modifie_le        timestamptz not null default now()
);
create index if not exists analyse_recettes_org_idx on analyse_recettes (organization_id, cree_le desc);

comment on table analyse_recettes is
  'Recette de nettoyage : chargement + règles exclues + exclusions manuelles. Rejouée sur les données brutes, jamais une copie.';

alter table analyse_recettes enable row level security;

drop policy if exists analyse_recettes_lecture on analyse_recettes;
create policy analyse_recettes_lecture on analyse_recettes
  for select to authenticated
  using (organization_id in (select ou.organization_id from organization_users ou where ou.user_id = auth.uid()));

drop policy if exists analyse_recettes_creation on analyse_recettes;
create policy analyse_recettes_creation on analyse_recettes
  for insert to authenticated
  with check (cree_par = auth.uid()
              and organization_id in (select ou.organization_id from organization_users ou where ou.user_id = auth.uid()));

drop policy if exists analyse_recettes_modification on analyse_recettes;
create policy analyse_recettes_modification on analyse_recettes
  for update to authenticated
  using (cree_par = auth.uid()) with check (cree_par = auth.uid());

drop policy if exists analyse_recettes_suppression on analyse_recettes;
create policy analyse_recettes_suppression on analyse_recettes
  for delete to authenticated
  using (cree_par = auth.uid());
