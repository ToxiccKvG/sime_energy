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

// Get invitation by code
export async function getInvitationByCode(code: string): Promise<OrganizationInvitation | null> {
  const { data, error } = await supabase
    .from('organization_invitations')
    .select('*')
    .eq('code', code)
    .eq('status', 'pending')
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw error;
  }

  if (!data) return null;

  // Check if invitation has expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('organization_invitations')
      .update({ status: 'expired' })
      .eq('id', data.id);
    return null;
  }

  return data;
}

// Accept invitation and add user to organization
export async function acceptInvitation(
  invitationCode: string,
  userId: string
): Promise<{ organization_id: string; invitation_id: string }> {
  // Get the invitation
  const invitation = await getInvitationByCode(invitationCode);
  if (!invitation) {
    throw new Error('Invitation not found or has expired');
  }

  // Add user to organization
  const { error: memberError } = await supabase
    .from('organization_users')
    .insert([
      {
        organization_id: invitation.organization_id,
        user_id: userId,
        role: 'member',
      },
    ]);

  if (memberError) {
    // If user is already a member, that's ok
    if (memberError.code !== '23505') { // 23505 = unique constraint violation
      throw memberError;
    }
  }

  // Mark invitation as accepted
  const { error: updateError } = await supabase
    .from('organization_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: userId,
    })
    .eq('id', invitation.id);

  if (updateError) throw updateError;

  return {
    organization_id: invitation.organization_id,
    invitation_id: invitation.id,
  };
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
