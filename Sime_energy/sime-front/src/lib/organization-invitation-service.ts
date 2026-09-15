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

// Revoke an invitation
export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('organization_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);

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
