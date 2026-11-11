import type { HolidayEntry } from '@/constants/senegal-holidays';
import { backendHeaders } from './backend-client';

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Jours fériés du Sénégal lus dans Google Agenda par le backend (la clé Google reste sur le serveur).
 * Renvoie null si le backend ou Google ne répond pas : l'appelant prend alors la liste locale.
 */
export async function fetchJoursFeriesGoogle(annee: number): Promise<HolidayEntry[] | null> {
  try {
    const res = await fetch(`${API_URL}/calendrier/jours-feries?annee=${annee}`, {
      headers: await backendHeaders(),
    });
    if (!res.ok) return null;
    const { jours } = (await res.json()) as { jours: { date: string; title: string }[] };
    return jours.length > 0 ? jours.map(j => ({ ...j, type: 'fixed' as const })) : null;
  } catch {
    return null;
  }
}
