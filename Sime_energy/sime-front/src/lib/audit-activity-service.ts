import { supabase } from '@/lib/supabase';

export interface AuditActivity {
  id: string;
  organization_id: string;
  audit_id: string;
  user_id: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  entity_type: 'audit' | 'site' | 'building';
  entity_id: string;
  changes?: Record<string, any>;
  description?: string;
  created_at: string;
}

// Log an audit activity
export async function logAuditActivity(
  organizationId: string,
  auditId: string,
  userId: string,
  action: 'created' | 'updated' | 'deleted' | 'status_changed',
  entityType: 'audit' | 'site' | 'building',
  entityId: string,
  changes?: Record<string, any>,
  description?: string
) {
  const { data, error } = await supabase
    .from('audit_activity')
    .insert([
      {
        organization_id: organizationId,
        audit_id: auditId,
        user_id: userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        changes: changes || {},
        description,
      },
    ])
    .select();

  if (error) {
    console.error('Error logging activity:', error);
    throw error;
  }

  return data?.[0];
}

// Get audit activity log
export async function getAuditActivityLog(auditId: string) {
  const { data, error } = await supabase
    .from('audit_activity')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching activity log:', error);
    throw error;
  }

  return data;
}

// Get organization activity log
export async function getOrganizationActivityLog(organizationId: string, limit = 50) {
  const { data, error } = await supabase
    .from('audit_activity')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching organization activity log:', error);
    throw error;
  }

  return data;
}

// Helper to format activity for display
export function formatActivityDescription(activity: AuditActivity): string {
  const actionLabels = {
    created: 'Créé',
    updated: 'Mis à jour',
    deleted: 'Supprimé',
    status_changed: 'Statut modifié',
  };

  const entityLabels = {
    audit: 'l\'audit',
    site: 'le site',
    building: 'le bâtiment',
  };

  const action = actionLabels[activity.action];
  const entity = entityLabels[activity.entity_type];

  return activity.description || `${action} ${entity}`;
}

// Helper to get changes description
export function getChangesDescription(changes: Record<string, any>): string[] {
  if (!changes || Object.keys(changes).length === 0) {
    return [];
  }

  return Object.entries(changes).map(([key, value]) => {
    if (typeof value === 'object' && value !== null) {
      const oldValue = value.old ? JSON.stringify(value.old) : 'N/A';
      const newValue = value.new ? JSON.stringify(value.new) : 'N/A';
      return `${key}: ${oldValue} → ${newValue}`;
    }
    return `${key}: ${String(value)}`;
  });
}
