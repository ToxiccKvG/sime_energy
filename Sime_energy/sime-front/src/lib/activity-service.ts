import { supabase } from '@/lib/supabase';

export interface AuditActivityLog {
  id: string;
  organization_id: string;
  audit_id: string;
  user_id: string;
  action_type: 'invoice_imported' | 'invoice_verified' | 'measurement_recorded' | 'task_created' | 'task_completed' | 'site_visited' | 'custom';
  title: string;
  description: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export async function logActivity(
  auditId: string,
  organizationId: string,
  userId: string,
  actionType: AuditActivityLog['action_type'],
  title: string,
  description: string,
  metadata?: Record<string, any>
) {
  try {
    const { data, error } = await supabase
      .from('audit_activity')
      .insert([
        {
          organization_id: organizationId,
          audit_id: auditId,
          user_id: userId,
          action_type: actionType,
          title,
          description,
          metadata: metadata || {},
        },
      ])
      .select()
      .single();

    if (error) {
      const errorMsg = error.message || JSON.stringify(error);
      console.error('Activity insert error:', errorMsg);
      throw new Error(`Failed to log activity: ${errorMsg}`);
    }

    if (!data) {
      throw new Error('No data returned from activity insert');
    }

    return data;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('Activity logging failed:', errorMessage);
    throw new Error(errorMessage);
  }
}

export async function getAuditActivity(auditId: string) {
  const { data, error } = await supabase
    .from('audit_activity')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getAuditActivityWithUserNames(auditId: string) {
  // Get activities with user names from auth.users table
  const { data, error } = await supabase
    .from('audit_activity')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Get user names for all activities
  const activities = data || [];
  const uniqueUserIds = [...new Set(activities.map(a => a.user_id))];

  if (uniqueUserIds.length === 0) {
    return activities;
  }

  // Try to get user info from auth.users (this might fail due to RLS)
  const enrichedActivities = activities.map(activity => ({
    ...activity,
    user_email: 'Utilisateur', // Fallback since we can't access auth.users from client
  }));

  return enrichedActivities;
}
