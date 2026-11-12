-- ============================================================
-- HIGH 2 (audit sécurité) — cloisonner l'écriture des rôles et
-- des types d'appareils, et réserver la suppression des coupures
-- et des absences aux admins du site.
-- 12/11/2026
--
-- Avant : tout admin d'AU MOINS UN site pouvait modifier les rôles
-- et les types de TOUS les sites ; tout membre d'un site pouvait
-- supprimer ses coupures et absences.
-- Après :
--   shelly_device_roles : lecture/écriture limitées aux appareils
--     des sites de l'utilisateur ; les éditeurs de règles gardent la
--     main partout (rôles pré-rattachés, appareils hors catalogue).
--   shelly_device_types : écriture réservée aux éditeurs de règles
--     (catalogue commun) ; lecture inchangée.
--   coupures, site_absences : les membres du site lisent, créent et
--     modifient ; seuls les admins du site suppriment.
-- Le collecteur (service_role) n'est pas concerné : il contourne la RLS.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Site d'un appareil, d'après le catalogue (90 derniers jours)
--    'c8f09e83ea14_1' (voie) retombe sur 'c8f09e83ea14' si la voie
--    n'est pas au catalogue. NULL = appareil inconnu du catalogue.
-- ------------------------------------------------------------
create or replace function public.device_site(p_device_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select site
  from shelly_devices_catalog
  where device_id in (p_device_id, split_part(p_device_id, '_', 1))
  order by (device_id = p_device_id) desc
  limit 1
$$;

revoke all on function public.device_site(text) from public, anon;
grant execute on function public.device_site(text) to authenticated;

comment on function public.device_site(text) is
  'Site d''un appareil Shelly d''après shelly_devices_catalog (voie _N → appareil). Sert aux règles RLS de shelly_device_roles.';

-- ------------------------------------------------------------
-- 2. shelly_device_roles
-- ------------------------------------------------------------
drop policy if exists shelly_device_roles_admin   on public.shelly_device_roles;
drop policy if exists shelly_device_roles_lecture on public.shelly_device_roles;

create policy shelly_device_roles_lecture on public.shelly_device_roles
  for select to authenticated
  using (
    (select public.est_editeur_regles())
    or public.device_site(device_id) = any ((select public.user_sites())::text[])
  );

create policy shelly_device_roles_admin_insert on public.shelly_device_roles
  for insert to authenticated
  with check (
    (select public.est_editeur_regles())
    or public.device_site(device_id) = any ((select public.user_admin_sites())::text[])
  );

create policy shelly_device_roles_admin_update on public.shelly_device_roles
  for update to authenticated
  using (
    (select public.est_editeur_regles())
    or public.device_site(device_id) = any ((select public.user_admin_sites())::text[])
  )
  with check (
    (select public.est_editeur_regles())
    or public.device_site(device_id) = any ((select public.user_admin_sites())::text[])
  );

create policy shelly_device_roles_admin_delete on public.shelly_device_roles
  for delete to authenticated
  using (
    (select public.est_editeur_regles())
    or public.device_site(device_id) = any ((select public.user_admin_sites())::text[])
  );

-- ------------------------------------------------------------
-- 3. shelly_device_types (catalogue commun à tous les sites)
--    La règle de lecture shelly_device_types_lecture reste en place.
-- ------------------------------------------------------------
drop policy if exists shelly_device_types_admin on public.shelly_device_types;

create policy shelly_device_types_editeur_insert on public.shelly_device_types
  for insert to authenticated
  with check ((select public.est_editeur_regles()));

create policy shelly_device_types_editeur_update on public.shelly_device_types
  for update to authenticated
  using ((select public.est_editeur_regles()))
  with check ((select public.est_editeur_regles()));

create policy shelly_device_types_editeur_delete on public.shelly_device_types
  for delete to authenticated
  using ((select public.est_editeur_regles()));

-- ------------------------------------------------------------
-- 4. coupures et site_absences : suppression réservée aux admins
-- ------------------------------------------------------------
drop policy if exists coupures_membres_site on public.coupures;

create policy coupures_lecture_site on public.coupures
  for select to authenticated
  using (site = any ((select public.user_sites())::text[]));

create policy coupures_insert_site on public.coupures
  for insert to authenticated
  with check (site = any ((select public.user_sites())::text[]));

create policy coupures_update_site on public.coupures
  for update to authenticated
  using (site = any ((select public.user_sites())::text[]))
  with check (site = any ((select public.user_sites())::text[]));

create policy coupures_delete_admin on public.coupures
  for delete to authenticated
  using (site = any ((select public.user_admin_sites())::text[]));

drop policy if exists site_absences_membres_site on public.site_absences;

create policy site_absences_lecture_site on public.site_absences
  for select to authenticated
  using (site = any ((select public.user_sites())::text[]));

create policy site_absences_insert_site on public.site_absences
  for insert to authenticated
  with check (site = any ((select public.user_sites())::text[]));

create policy site_absences_update_site on public.site_absences
  for update to authenticated
  using (site = any ((select public.user_sites())::text[]))
  with check (site = any ((select public.user_sites())::text[]));

create policy site_absences_delete_admin on public.site_absences
  for delete to authenticated
  using (site = any ((select public.user_admin_sites())::text[]));

commit;
