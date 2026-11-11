-- ============================================================
--  Audit sécurité des tables applicatives (avant mise en ligne)
--
--  Constat (2026-09-15, inventaire pg_class / pg_policies / grants) :
--    · RLS DÉSACTIVÉ sur organizations, organization_users, audits,
--      annotation_dictionaries, annotation_settings : les policies
--      existent mais ne sont pas appliquées → n'importe quel porteur
--      de la clé anon (publique, dans le bundle JS) lit et écrit tout.
--      Cause : les policies d'organization_users se lisent elles-mêmes
--      → « infinite recursion detected in policy », d'où le RLS coupé.
--    · organization_users : tout membre pouvait modifier les rôles
--      (UPDATE) et tout utilisateur connecté pouvait s'ajouter à
--      n'importe quelle organisation (INSERT user_id = auth.uid()).
--    · organization_invitations : policy « lecture par code »
--      `using (code is not null)` = lecture de TOUTES les invitations
--      (codes, e-mails) par anon.
--    · anon : grants complets (SELECT…TRUNCATE) sur toutes les tables ;
--      authenticated : TRUNCATE (qui ignore le RLS) sur toutes les tables.
--    · shelly_cl / shelly_cl_horaire : policy INSERT `check (true)` pour
--      tout le monde ; authenticated avait INSERT/UPDATE/DELETE.
--    · fn_aggregate_horaire(_env) : SECURITY DEFINER exécutables par anon.
--
--  Le front n'utilise anon que pour l'écran de connexion (auth_events).
--  Les Edge Functions et le cron utilisent service_role (bypass RLS).
-- ============================================================

-- ── 1. Helpers non récursifs ───────────────────────────────
-- SECURITY DEFINER : lisent organization_users sans passer par ses
-- policies, ce qui casse la récursion. STABLE pour être évalués une
-- fois par requête.
create or replace function public.user_org_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.organization_users where user_id = auth.uid()
$$;

create or replace function public.user_admin_org_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.organization_users
  where user_id = auth.uid() and role = 'admin'
$$;

-- Même rôle pour organizations : une policy d'organization_users qui
-- lirait organizations « en clair » ferait ré-entrer organization_users
-- via la policy d'organizations → récursion détectée par Postgres.
create or replace function public.is_org_creator(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.organizations
                 where id = p_org and created_by = auth.uid())
$$;

revoke execute on function public.user_org_ids(), public.user_admin_org_ids(), public.is_org_creator(uuid) from public, anon;
grant  execute on function public.user_org_ids(), public.user_admin_org_ids(), public.is_org_creator(uuid) to authenticated;

-- ── 2. organization_users : policies réécrites ─────────────
drop policy if exists "Users can read organization members"        on organization_users;
drop policy if exists "Users can update organization memberships"  on organization_users;
drop policy if exists "Organization admins can delete memberships" on organization_users;
drop policy if exists "Users can insert their own memberships"     on organization_users;
-- Conservées : "Users can read their organization memberships" (user_id = auth.uid())
--              "Users can delete their own memberships"         (user_id = auth.uid())

create policy "org_users_select_members" on organization_users
  for select to authenticated
  using (organization_id in (select public.user_org_ids()));

-- Seuls les admins de l'organisation changent les rôles / retirent des membres.
create policy "org_users_admin_update" on organization_users
  for update to authenticated
  using      (organization_id in (select public.user_admin_org_ids()))
  with check (organization_id in (select public.user_admin_org_ids()));

create policy "org_users_admin_delete" on organization_users
  for delete to authenticated
  using (organization_id in (select public.user_admin_org_ids()));

-- Insertion directe : uniquement le créateur de l'organisation (flux
-- de création). Toute autre adhésion passe par accept_invitation().
create policy "org_users_creator_insert" on organization_users
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_creator(organization_id));

-- ── 3. Invitations : lecture ciblée et acceptation via RPC ──
drop policy if exists "Users can read invitations by code" on organization_invitations;

-- Renvoie UNE invitation par son code (et le nom de l'organisation,
-- que le futur membre n'a pas encore le droit de lire), sans permettre
-- d'énumérer la table. Une invitation expirée est marquée au passage.
create or replace function public.get_invitation_by_code(p_code text)
returns table (
  id uuid, organization_id uuid, organization_name text,
  invited_email text, expires_at timestamp, status text
)
language plpgsql security definer
set search_path = public
as $$
begin
  if p_code is null or length(p_code) < 6 then return; end if;

  -- Colonnes qualifiées : les noms de sortie (status, expires_at…) sont aussi
  -- des variables PL/pgSQL.
  update organization_invitations i
     set status = 'expired'
   where i.code = p_code and i.status = 'pending'
     and i.expires_at is not null and i.expires_at < now();

  return query
    select i.id, i.organization_id, o.name, i.invited_email, i.expires_at, i.status
      from organization_invitations i
      join organizations o on o.id = i.organization_id
     where i.code = p_code and i.status = 'pending';
end;
$$;

-- Accepte une invitation pour l'utilisateur connecté : vérifie le code,
-- l'expiration et — si l'invitation nomme un e-mail — que c'est bien
-- celui du compte connecté. Renvoie l'organization_id rejoint.
create or replace function public.accept_invitation(p_code text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv   organization_invitations%rowtype;
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;

  select * into v_inv from organization_invitations
   where code = p_code and status = 'pending'
   for update;

  if not found then
    raise exception 'Invitation introuvable ou déjà utilisée' using errcode = 'P0002';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update organization_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'Invitation expirée' using errcode = 'P0002';
  end if;
  if v_inv.invited_email is not null and lower(v_inv.invited_email) <> v_email then
    raise exception 'Cette invitation est destinée à % ', v_inv.invited_email using errcode = '42501';
  end if;

  insert into organization_users (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, 'member')
  on conflict do nothing;

  update organization_invitations
     set status = 'accepted', accepted_at = now(), accepted_by_user_id = v_uid
   where id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

revoke execute on function public.get_invitation_by_code(text), public.accept_invitation(text) from public, anon;
grant  execute on function public.get_invitation_by_code(text), public.accept_invitation(text) to authenticated;

-- ── 4. RLS activé partout ───────────────────────────────────
alter table organizations           enable row level security;
alter table organization_users      enable row level security;
alter table audits                  enable row level security;
alter table annotation_dictionaries enable row level security;
alter table annotation_settings     enable row level security;

-- ── 5. anon : plus aucun accès direct aux tables ────────────
-- Le seul besoin pré-connexion est la journalisation des tentatives
-- de connexion (auth_events, policy allow_insert).
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on table public.%I from anon', r.tablename);
  end loop;
  for r in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('revoke all on table public.%I from anon', r.table_name);
  end loop;
  for r in select sequencename from pg_sequences where schemaname = 'public' loop
    execute format('revoke all on sequence public.%I from anon', r.sequencename);
  end loop;
end $$;
grant insert on table public.auth_events to anon;
-- Les prochaines tables créées depuis le dashboard ne seront plus
-- ouvertes à anon par défaut.
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- ── 6. authenticated : plus de TRUNCATE / REFERENCES / TRIGGER ─
-- TRUNCATE ignore le RLS : un utilisateur connecté pouvait vider
-- n'importe quelle table.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', r.tablename);
  end loop;
  for r in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', r.table_name);
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- ── 7. Données Shelly : lecture seule pour les utilisateurs ─
drop policy if exists shelly_cl_service_insert         on shelly_cl;
drop policy if exists shelly_cl_horaire_service_insert on shelly_cl_horaire;
revoke insert, update, delete on shelly_cl, shelly_cl_horaire from authenticated;

-- ── 8. Fonctions d'agrégation : service_role uniquement ─────
revoke execute on function
  fn_aggregate_horaire(timestamptz, timestamptz),
  fn_aggregate_horaire_env(timestamptz, timestamptz),
  aggregate_shelly_hourly()
from public, anon, authenticated;

-- ── Vérification ────────────────────────────────────────────
-- select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and relkind='r' and not relrowsecurity;      -- attendu : 0 ligne
-- select table_name, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and grantee='anon';                        -- attendu : auth_events INSERT
-- select table_name from information_schema.role_table_grants
--  where table_schema='public' and grantee='authenticated' and privilege_type='TRUNCATE'; -- attendu : 0
