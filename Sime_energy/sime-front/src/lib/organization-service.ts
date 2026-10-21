import { supabase } from '@/lib/db';

export function getOrganization(organizationId: string) {
  return supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();
}
