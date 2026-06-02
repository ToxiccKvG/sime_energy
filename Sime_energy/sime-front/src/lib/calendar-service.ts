import { supabase } from '@/lib/supabase';

export interface OrgCalendarEvent {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  event_date: string; // ISO date string YYYY-MM-DD
  end_date: string | null;
  all_day: boolean;
  color: string;
  created_by: string | null;
  created_at: string;
}

export type NewOrgCalendarEvent = Pick<OrgCalendarEvent,
  'organization_id' | 'title' | 'description' | 'event_date' | 'end_date' | 'all_day' | 'color'
> & { created_by: string };

export async function listCalendarEvents(organizationId: string, year: number): Promise<OrgCalendarEvent[]> {
  const { data, error } = await supabase
    .from('org_calendar_events')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('event_date', `${year}-01-01`)
    .lte('event_date', `${year}-12-31`)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return data as OrgCalendarEvent[];
}

export async function createCalendarEvent(event: NewOrgCalendarEvent): Promise<OrgCalendarEvent> {
  const { data, error } = await supabase
    .from('org_calendar_events')
    .insert(event)
    .select()
    .single();
  if (error) throw error;
  return data as OrgCalendarEvent;
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('org_calendar_events')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
