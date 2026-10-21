import { supabase } from '@/lib/supabase';

export function getOrganization(organizationId: string) {
  return supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single();
}
