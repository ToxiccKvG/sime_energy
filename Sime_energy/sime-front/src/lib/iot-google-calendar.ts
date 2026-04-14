// ============================================================
// IOT MODULE — Service Google Calendar API v3
// Endpoint : GET /calendars/{calendarId}/events
// Doc      : https://developers.google.com/workspace/calendar/api/v3/reference/events/list
//
// Auth     : API key uniquement (calendriers publics, pas d'OAuth requis)
// Config   : VITE_GOOGLE_CALENDAR_API_KEY dans .env
// Calendrier Sénégal : en.sn#holiday@group.v.calendar.google.com
// ============================================================

import type { JourFerie } from '@/components/iot/shared';

export const GOOGLE_CALENDAR_ID_SENEGAL = 'fr.sn#holiday@group.v.calendar.google.com';

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

// ---- Types réponse API ----

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  start: { date?: string; dateTime?: string; timeZone?: string };
  end:   { date?: string; dateTime?: string; timeZone?: string };
}

interface GoogleCalendarResponse {
  kind: string;
  summary: string;
  items: GoogleCalendarEvent[];
  nextPageToken?: string;        // pagination
  error?: { message: string; code: number; status: string };
}

// ---- Inférence du type JourFerie ----

function inferType(summary: string): JourFerie['type'] {
  const s = summary.toLowerCase();
  // Fêtes religieuses islamiques (dates variables)
  if (
    s.includes('korité') || s.includes('korite') ||
    s.includes('tabaski') ||
    s.includes('maouloud') ||
    s.includes('tamkharit') ||
    s.includes('magal') ||
    s.includes('gamou') ||
    s.includes('aïd') || s.includes('eid') ||
    s.includes('ramadan')
  ) return 'fête';
  return 'férie';
}

// ---- Mapping GoogleCalendarEvent → JourFerie ----

function toJourFerie(ev: GoogleCalendarEvent): JourFerie {
  const dateStr = ev.start.date ?? ev.start.dateTime?.split('T')[0] ?? '';
  return {
    date:  new Date(dateStr + 'T00:00:00'),
    nom:   ev.summary,
    type:  inferType(ev.summary),
    actif: true,
  };
}

// ---- Fetch une page ----

async function fetchPage(
  apiKey: string,
  calId: string,
  year: number,
  pageToken?: string,
): Promise<{ events: GoogleCalendarEvent[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    key:          apiKey,
    timeMin:      `${year}-01-01T00:00:00Z`,
    timeMax:      `${year + 1}-01-01T00:00:00Z`,
    singleEvents: 'true',          // développe les récurrences
    orderBy:      'startTime',
    maxResults:   '250',           // max recommandé par page
    showDeleted:  'false',
    timeZone:     'Africa/Dakar',  // fuseau Sénégal (UTC+0 toute l'année)
  });
  if (pageToken) params.set('pageToken', pageToken);

  const url = `${GCAL_BASE}/calendars/${encodeURIComponent(calId)}/events?${params}`;
  const res  = await fetch(url);
  const json: GoogleCalendarResponse = await res.json();

  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Google Calendar API : ${msg}`);
  }

  return {
    events:        (json.items ?? []).filter(ev => ev.status !== 'cancelled'),
    nextPageToken: json.nextPageToken,
  };
}

/**
 * Récupère tous les jours fériés d'une année (pagination automatique).
 * La clé API est lue depuis VITE_GOOGLE_CALENDAR_API_KEY (.env).
 *
 * @param year       — Année cible (défaut : année courante)
 * @param calendarId — ID du calendrier (défaut : Sénégal public)
 */
export async function fetchHolidaysGoogleCalendar(
  year: number = new Date().getFullYear(),
  calendarId: string = GOOGLE_CALENDAR_ID_SENEGAL,
): Promise<JourFerie[]> {
  const apiKey = (import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('VITE_GOOGLE_CALENDAR_API_KEY manquant dans .env');

  const allEvents: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  // Boucle de pagination — récupère toutes les pages
  do {
    const page = await fetchPage(apiKey, calendarId, year, pageToken);
    allEvents.push(...page.events);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return allEvents.map(toJourFerie);
}
