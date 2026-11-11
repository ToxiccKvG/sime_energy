-- ============================================================
--  Accès aux données IoT par organisation — 2026-10-21
--
--  Constat (audit 13/10, revu le 21/10) : tout compte connecté lisait
--  toutes les mesures Shelly, pouvait réécrire les rôles d'appareils
--  (donc fausser les bilans), les coupures et les absences ; et tout
--  admin de N'IMPORTE quelle organisation pouvait modifier les comptes
--  Shelly (clé, serveur). Comme l'inscription était libre et que chacun
--  pouvait créer sa propre organisation, n'importe qui y avait accès.
--
--  Décision de Maurice (21/10) : accès sur invitation seulement, et
--  données IoT réservées à l'organisation propriétaire du site.
--
--  Ce qui change :
--   1. site_organisation : à quelle organisation appartient chaque site
--      (source de vérité ; les 6 sites existants → CER2E).
--   2. user_sites() / user_admin_sites() : sites visibles / administrés.
--   3. Règles : lecture pour les membres de l'organisation du site,
--      écriture pour ses admins (coupures et absences : ses membres ;
--      règles qualité, retraits, méthode du site : éditeurs déclarés).
--   4. Catalogue des appareils (vue matérialisée, sans RLS possible) :
--      lu au travers de shelly_devices_catalog_visible, filtrée.
--   5. fn_energy_* passent en SECURITY INVOKER : elles appliquent les
--      règles au lieu de les contourner.
--  La collecte (service_role) n'est pas concernée. Aucune donnée n'est
--  modifiée ni supprimée.
-- ============================================================

-- ── 1. Site → organisation ──────────────────────────────────
create table if not exists site_organisation (
  site            text        primary key,
  organization_id uuid        not null references organizations(id) on delete restrict,
  created_at      timestamptz not null default now()
);

comment on table site_organisation is
  'Organisation propriétaire de chaque site IoT : ses membres lisent les données du site, ses admins les administrent.';

-- Organisation CER2E principale (membres : Maurice, Daouda, kpharci, Kpode)
insert into site_organisation (site, organization_id) values
  ('Ma Maison',          'a03b8124-0c57-4f66-9728-9895b4d43236'),
  ('Donsin',             'a03b8124-0c57-4f66-9728-9895b4d43236'),
  ('Académie CER2E',     'a03b8124-0c57-4f66-9728-9895b4d43236'),
  ('Bureau CER2E Dakar', 'a03b8124-0c57-4f66-9728-9895b4d43236'),
  ('Bureau CER2E Thiès', 'a03b8124-0c57-4f66-9728-9895b4d43236'),
  ('Prestation CER2E',   'a03b8124-0c57-4f66-9728-9895b4d43236')
on conflict (site) do nothing;

alter table site_organisation enable row level security;
drop policy if exists site_organisation_lecture on site_organisation;
create policy site_organisation_lecture on site_organisation
  for select to authenticated using (organization_id in (select public.user_org_ids()));
drop policy if exists site_organisation_admin_insert on site_organisation;
create policy site_organisation_admin_insert on site_organisation
  for insert to authenticated with check (organization_id in (select public.user_admin_org_ids()));
drop policy if exists site_organisation_admin_update on site_organisation;
create policy site_organisation_admin_update on site_organisation
  for update to authenticated
  using (organization_id in (select public.user_admin_org_ids()))
  with check (organization_id in (select public.user_admin_org_ids()));
drop policy if exists site_organisation_admin_delete on site_organisation;
create policy site_organisation_admin_delete on site_organisation
  for delete to authenticated using (organization_id in (select public.user_admin_org_ids()));

-- ── 2. Sites de l'utilisateur ───────────────────────────────
create or replace function public.user_sites() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(site), '{}') from site_organisation
  where organization_id in (select public.user_org_ids())
$$;

create or replace function public.user_admin_sites() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(site), '{}') from site_organisation
  where organization_id in (select public.user_admin_org_ids())
$$;

revoke all on function public.user_sites() from public, anon;
revoke all on function public.user_admin_sites() from public, anon;
grant execute on function public.user_sites() to authenticated;
grant execute on function public.user_admin_sites() to authenticated;

-- « (select …) » : évalué une fois par requête (InitPlan), pas à chaque ligne
-- de shelly_cl.

-- ── 3. Règles ───────────────────────────────────────────────
-- Mesures brutes et horaires : lecture par les membres du site
drop policy if exists shelly_cl_authenticated_read on shelly_cl;
drop policy if exists shelly_cl_lecture_site on shelly_cl;
create policy shelly_cl_lecture_site on shelly_cl
  for select to authenticated using (site = any ((select public.user_sites())::text[]));

drop policy if exists shelly_cl_horaire_authenticated_read on shelly_cl_horaire;
drop policy if exists shelly_cl_horaire_lecture_site on shelly_cl_horaire;
create policy shelly_cl_horaire_lecture_site on shelly_cl_horaire
  for select to authenticated using (site = any ((select public.user_sites())::text[]));

-- Comptes Shelly : lecture membres, écriture admins de l'organisation du site
drop policy if exists shelly_accounts_read on shelly_accounts;
drop policy if exists shelly_accounts_admin_insert on shelly_accounts;
drop policy if exists shelly_accounts_admin_update on shelly_accounts;
drop policy if exists shelly_accounts_admin_delete on shelly_accounts;
create policy shelly_accounts_read on shelly_accounts
  for select to authenticated using (site = any ((select public.user_sites())::text[]));
create policy shelly_accounts_admin_insert on shelly_accounts
  for insert to authenticated with check (site = any ((select public.user_admin_sites())::text[]));
create policy shelly_accounts_admin_update on shelly_accounts
  for update to authenticated
  using (site = any ((select public.user_admin_sites())::text[]))
  with check (site = any ((select public.user_admin_sites())::text[]));
create policy shelly_accounts_admin_delete on shelly_accounts
  for delete to authenticated using (site = any ((select public.user_admin_sites())::text[]));

-- Voies d'appareils et périodes d'affectation : lecture membres, écriture admins du site
do $$
declare t text; p record;
begin
  foreach t in array array['shelly_device_channels', 'shelly_device_periodes'] loop
    for p in select polname from pg_policy where polrelid = ('public.' || t)::regclass loop
      execute format('drop policy %I on public.%I', p.polname, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (site = any ((select public.user_sites())::text[]))', t || '_lecture_site', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (site = any ((select public.user_admin_sites())::text[]))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (site = any ((select public.user_admin_sites())::text[])) with check (site = any ((select public.user_admin_sites())::text[]))', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (site = any ((select public.user_admin_sites())::text[]))', t || '_admin_delete', t);
  end loop;
end $$;

-- Coupures et absences : lecture et écriture par les membres du site
-- (la confirmation d'une coupure est faite par l'équipe, pas seulement les admins)
drop policy if exists coupures_authenticated_rw on coupures;
drop policy if exists coupures_membres_site on coupures;
create policy coupures_membres_site on coupures
  for all to authenticated
  using (site = any ((select public.user_sites())::text[]))
  with check (site = any ((select public.user_sites())::text[]));

drop policy if exists site_absences_authenticated_rw on site_absences;
drop policy if exists site_absences_membres_site on site_absences;
create policy site_absences_membres_site on site_absences
  for all to authenticated
  using (site = any ((select public.user_sites())::text[]))
  with check (site = any ((select public.user_sites())::text[]));

-- Méthode de consommation du site : lecture membres, écriture éditeurs sur leurs sites
drop policy if exists site_bilan_read on site_bilan;
drop policy if exists site_bilan_write on site_bilan;
create policy site_bilan_read on site_bilan
  for select to authenticated using (site = any ((select public.user_sites())::text[]));
create policy site_bilan_write on site_bilan
  for all to authenticated
  using (public.est_editeur_regles() and site = any ((select public.user_sites())::text[]))
  with check (public.est_editeur_regles() and site = any ((select public.user_sites())::text[]));

-- Rôles et types d'appareils (sans colonne site) : lecture pour qui a au
-- moins un site, écriture pour les admins d'un site
drop policy if exists shelly_device_roles_authenticated_rw on shelly_device_roles;
drop policy if exists shelly_device_roles_lecture on shelly_device_roles;
drop policy if exists shelly_device_roles_admin on shelly_device_roles;
create policy shelly_device_roles_lecture on shelly_device_roles
  for select to authenticated using (cardinality((select public.user_sites())) > 0);
create policy shelly_device_roles_admin on shelly_device_roles
  for all to authenticated
  using (cardinality((select public.user_admin_sites())) > 0)
  with check (cardinality((select public.user_admin_sites())) > 0);

drop policy if exists shelly_device_types_authenticated_rw on shelly_device_types;
drop policy if exists shelly_device_types_lecture on shelly_device_types;
drop policy if exists shelly_device_types_admin on shelly_device_types;
create policy shelly_device_types_lecture on shelly_device_types
  for select to authenticated using (cardinality((select public.user_sites())) > 0);
create policy shelly_device_types_admin on shelly_device_types
  for all to authenticated
  using (cardinality((select public.user_admin_sites())) > 0)
  with check (cardinality((select public.user_admin_sites())) > 0);

-- Retraits d'appareils : lecture pour qui a au moins un site (écriture inchangée : éditeurs)
drop policy if exists shelly_device_retraits_read on shelly_device_retraits;
create policy shelly_device_retraits_read on shelly_device_retraits
  for select to authenticated using (cardinality((select public.user_sites())) > 0);

-- ── 4. Catalogue des appareils ──────────────────────────────
-- Une vue matérialisée ne porte pas de RLS : on la ferme et on la lit au
-- travers d'une vue filtrée (exécutée avec les droits de son propriétaire,
-- le filtre s'appuie sur l'utilisateur connecté via user_sites()).
revoke select on public.shelly_devices_catalog from anon, authenticated;
create or replace view public.shelly_devices_catalog_visible with (security_barrier = true) as
  select * from public.shelly_devices_catalog
  where site = any (public.user_sites());
revoke all on public.shelly_devices_catalog_visible from public, anon;
grant select on public.shelly_devices_catalog_visible to authenticated;

-- ── 5. Fonctions d'énergie : appliquer les règles au lieu de les contourner ──
alter function public.fn_energy_by_day(timestamptz, timestamptz, text[], text[], text[]) security invoker;
alter function public.fn_energy_by_device(timestamptz, timestamptz, text[], text[], text[]) security invoker;
alter function public.fn_energy_profile(timestamptz, timestamptz, text[], text, text[]) security invoker;
alter function public.fn_energy_repartition(timestamptz, timestamptz, text[], text[]) security invoker;
