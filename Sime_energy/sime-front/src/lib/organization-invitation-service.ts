import { supabase } from '@/lib/supabase';

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  code: string;
  inviter_id: string;
  invited_email?: string;
  created_at: string;
  expires_at?: string;
  accepted_at?: string;
  accepted_by_user_id?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  role?: 'member' | 'admin';
}

// Generate a unique invitation code
function generateInvitationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Create an invitation for an organization
export async function createInvitation(
  organizationId: string,
  inviterId: string,
  invitedEmail?: string,
  expiresAtDays?: number
): Promise<OrganizationInvitation> {
  const code = generateInvitationCode();
  const expiresAt = expiresAtDays
    ? new Date(Date.now() + expiresAtDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('organization_invitations')
    .insert([
      {
        organization_id: organizationId,
        code,
        inviter_id: inviterId,
        invited_email: invitedEmail,
        expires_at: expiresAt,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Lecture d'une invitation par son code — via RPC SECURITY DEFINER :
// la table n'est plus lisible par code (sinon n'importe qui pouvait
// lister toutes les invitations). La RPC renvoie aussi le nom de
// l'organisation, que le futur membre n'a pas encore le droit de lire.
export interface InvitationPreview {
  id: string;
  organization_id: string;
  organization_name: string;
  invited_email: string | null;
  expires_at: string | null;
  status: string;
}

export async function getInvitationByCode(code: string): Promise<InvitationPreview | null> {
  const { data, error } = await supabase.rpc('get_invitation_by_code', { p_code: code });
  if (error) throw error;
  return (data as InvitationPreview[] | null)?.[0] ?? null;
}

// Acceptation — via RPC : c'est la base qui vérifie le code, l'expiration
// et l'e-mail invité, puis crée l'adhésion (les utilisateurs n'ont plus le
// droit d'insérer eux-mêmes dans organization_users).
export async function acceptInvitation(invitationCode: string): Promise<{ organization_id: string }> {
  const { data, error } = await supabase.rpc('accept_invitation', { p_code: invitationCode });
  if (error) throw error;
  return { organization_id: data as string };
}

// Get invitations for an organization
export async function getOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Annuler une invitation — seulement si elle est encore en attente : une
// invitation déjà acceptée garde son statut (test du 22/10 : la liste de
// l'admin, pas encore rafraîchie, permettait d'« annuler » une invitation
// déjà utilisée). Retirer un membre est une autre action.
export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('status', 'pending');

  if (error) throw error;
}

// Get all pending invitations for a user's email
export async function getPendingInvitationsForEmail(email: string): Promise<OrganizationInvitation[]> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('invited_email', email)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString()); // Not expired

  if (error) throw error;
  return data || [];
}

// ── Invitation par la plateforme (accès sur invitation seulement, 21/10/2026) ──
// La fonction serveur `inviter-membre` vérifie que l'appelant est admin,
// enregistre l'invitation et renvoie le lien personnel à transmettre :
// lien de création de compte (choix du mot de passe) si la personne n'a pas
// encore de compte, lien /invite?code=… sinon.
export interface InvitationCreee {
  lien: string;
  compte_existant: boolean;
  code: string;
  expires_at: string;
  role: 'member' | 'admin';
}

export async function inviterMembre(
  organizationId: string,
  email: string,
  role: 'member' | 'admin',
): Promise<InvitationCreee> {
  const { data, error } = await supabase.functions.invoke('inviter-membre', {
    body: { organization_id: organizationId, email, role, origin: window.location.origin },
  });
  if (error) {
    // Message d'erreur renvoyé par la fonction, s'il y en a un
    const ctx = (error as { context?: Response }).context;
    const detail = ctx ? await ctx.json().then((b: { error?: string }) => b?.error).catch(() => undefined) : undefined;
    throw new Error(detail ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as InvitationCreee;
}

/** Rôle de l'utilisateur connecté dans l'organisation (null s'il n'en est pas membre). */
export async function getMonRole(organizationId: string, userId: string): Promise<'member' | 'admin' | null> {
  const { data, error } = await supabase
    .from('organization_users')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as 'member' | 'admin' | undefined) ?? null;
}
