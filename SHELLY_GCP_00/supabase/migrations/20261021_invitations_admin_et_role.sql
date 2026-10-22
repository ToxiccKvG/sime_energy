-- ============================================================
--  Invitations : réservées aux admins, avec un rôle — 2026-10-21
--
--  Décision de Maurice (21/10) : accès à la plateforme sur invitation
--  seulement (plus d'inscription libre). Il faut donc :
--   1. un rôle dans l'invitation (membre ou admin) : jusqu'ici
--      accept_invitation donnait toujours « member » ;
--   2. des invitations créées, modifiées, annulées par les admins de
--      l'organisation seulement (avant : par n'importe quel membre) ;
--   3. la création d'une organisation réservée à quelqu'un qui est déjà
--      admin d'une organisation (avant : tout compte, d'où un compte
--      libre qui devenait admin de « sa » organisation).
--  Tables de la zone de Kevin : à faire relire par lui avant la fusion.
-- ============================================================

-- ── 1. Rôle de l'invitation ─────────────────────────────────
alter table organization_invitations
  add column if not exists role text not null default 'member';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_invitations_role_check') then
    alter table organization_invitations
      add constraint organization_invitations_role_check check (role in ('member', 'admin'));
  end if;
end $$;

create or replace function public.accept_invitation(p_code text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Rôle de l'invitation ; un membre déjà présent invité comme admin est promu
  insert into organization_users (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do update
    set role = 'admin'
    where excluded.role = 'admin' and organization_users.role <> 'admin';

  update organization_invitations
     set status = 'accepted', accepted_at = now(), accepted_by_user_id = v_uid
   where id = v_inv.id;

  return v_inv.organization_id;
end;
$function$;

-- ── 2. Invitations : admins de l'organisation seulement ─────
drop policy if exists "Users can insert organization invitations" on organization_invitations;
drop policy if exists "Users can update organization invitations" on organization_invitations;
drop policy if exists "Users can delete organization invitations" on organization_invitations;
drop policy if exists organization_invitations_admin_insert on organization_invitations;
drop policy if exists organization_invitations_admin_update on organization_invitations;
drop policy if exists organization_invitations_admin_delete on organization_invitations;
create policy organization_invitations_admin_insert on organization_invitations
  for insert to authenticated
  with check (organization_id in (select public.user_admin_org_ids()) and inviter_id = auth.uid());
create policy organization_invitations_admin_update on organization_invitations
  for update to authenticated
  using (organization_id in (select public.user_admin_org_ids()))
  with check (organization_id in (select public.user_admin_org_ids()));
create policy organization_invitations_admin_delete on organization_invitations
  for delete to authenticated
  using (organization_id in (select public.user_admin_org_ids()));

-- ── 3. Création d'organisation : réservée aux admins existants ──
drop policy if exists "Users can create organizations" on organizations;
drop policy if exists organizations_creation_par_admin on organizations;
create policy organizations_creation_par_admin on organizations
  for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.user_admin_org_ids()));
