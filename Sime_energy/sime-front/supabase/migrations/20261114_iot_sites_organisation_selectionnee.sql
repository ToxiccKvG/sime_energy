-- IOT : limiter les sites visibles à l'organisation sélectionnée dans l'application.
--
-- Bug (2026-11-14) : user_sites() renvoyait les sites de TOUTES les organisations dont
-- l'utilisateur est membre. Un membre de deux organisations voyait donc les données IOT
-- de l'une en ayant sélectionné l'autre : le sélecteur d'organisation était sans effet.
-- Pas de fuite vers un non-membre (l'appartenance restait vérifiée), mais un cloisonnement
-- faux pour les comptes multi-organisations.
--
-- Correctif : le front envoie l'organisation sélectionnée dans l'en-tête HTTP
-- `x-organisation-id` (lib/supabase.ts). PostgREST l'expose dans request.headers.
--   - en-tête absent  → comportement inchangé (toutes les organisations du membre) :
--                       ancienne application, backend service_role, scripts ;
--   - en-tête valide  → seulement cette organisation, ET seulement si l'utilisateur en est
--                       membre (intersection avec user_org_ids / user_admin_org_ids) ;
--   - en-tête invalide → aucun site.
-- Toutes les politiques IOT (shelly_*, coupures, site_absences, site_bilan, vue
-- shelly_devices_catalog_visible) et les fonctions fn_* (SECURITY INVOKER) passent par
-- user_sites() / user_admin_sites() : elles sont toutes corrigées par ce seul changement.

create or replace function public.organisation_selectionnee()
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  -- null : pas d'en-tête ; uuid nul (ne correspond à rien) : en-tête présent mais invalide
  select case
    when h is null or h = '' then null
    when h ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then h::uuid
    else '00000000-0000-0000-0000-000000000000'::uuid
  end
  from (
    select nullif(current_setting('request.headers', true), '')::json ->> 'x-organisation-id' as h
  ) t
$function$;

create or replace function public.user_sites()
returns text[]
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(site), '{}') from site_organisation
  where organization_id in (select public.user_org_ids())
    and (public.organisation_selectionnee() is null or organization_id = public.organisation_selectionnee())
$function$;

create or replace function public.user_admin_sites()
returns text[]
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(site), '{}') from site_organisation
  where organization_id in (select public.user_admin_org_ids())
    and (public.organisation_selectionnee() is null or organization_id = public.organisation_selectionnee())
$function$;

-- Retour arrière (définitions d'avant le 2026-11-14) :
--   create or replace function public.user_sites() returns text[] language sql stable security definer
--     set search_path to 'public' as $$ select coalesce(array_agg(site), '{}') from site_organisation
--     where organization_id in (select public.user_org_ids()) $$;
--   create or replace function public.user_admin_sites() returns text[] language sql stable security definer
--     set search_path to 'public' as $$ select coalesce(array_agg(site), '{}') from site_organisation
--     where organization_id in (select public.user_admin_org_ids()) $$;
--   drop function public.organisation_selectionnee();
