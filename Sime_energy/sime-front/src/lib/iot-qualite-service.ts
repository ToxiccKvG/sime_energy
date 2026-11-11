// ============================================================
// IOT — Qualité des données : lecture du moteur fn_qualite
//
// Les règles (seuils, portée, action) vivent en base dans qualite_regles ;
// fn_qualite les évalue et renvoie des SIGNALEMENTS, jamais des mesures.
// Aucun écran ne recode une règle : il lit ces signalements et choisit
// seulement ce qu'il exclut (migrations 20261016_qualite_regles,
// 20261016_fn_qualite).
// ============================================================

import { supabase } from '@/lib/supabase';

export type ActionQualite = 'signaler' | 'quarantaine' | 'doublon';

export interface RegleQualite {
  code: string;
  libelle: string;
  explication: string;
  action: ActionQualite;
  actif: boolean;
  ordre: number;
  parametres: Record<string, unknown>;
  modifie_le: string;
}

/** Une plage signalée : heures consécutives d'une règle, ou une journée. */
export interface Signalement {
  regle: string;
  action: ActionQualite;
  niveau: 'heure' | 'jour' | 'appareil'; // appareil : muet, de sa dernière mesure à la fin
  debut: string;            // ISO, inclus
  fin: string;              // ISO, exclu
  nb_heures: number | null;
  site: string;
  device_id: string | null; // NULL = règle de site (coupure, départs > arrivée)
  nom: string | null;
  kwh: number | null;
  valeur: number | null;
  detail: Record<string, unknown> | null;
}

export interface PerimetreQualite {
  dateDebut: string;
  dateFin: string;
  heureDebut: number;
  heureFin: number;
  sites: string[];
  deviceIds?: string[];
}

export async function fetchRegles(): Promise<RegleQualite[]> {
  const { data, error } = await supabase
    .from('qualite_regles')
    .select('code,libelle,explication,action,actif,ordre,parametres,modifie_le')
    .order('ordre');
  if (error) throw error;
  return (data ?? []) as RegleQualite[];
}

export async function fetchSignalements(p: PerimetreQualite): Promise<Signalement[]> {
  const PAGE = 1000;
  const lignes: Signalement[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('fn_qualite', {
        p_date_debut: p.dateDebut,
        p_date_fin: p.dateFin,
        p_heure_debut: p.heureDebut,
        p_heure_fin: p.heureFin,
        p_sites: p.sites,
        p_device_ids: p.deviceIds ?? null,
      })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    lignes.push(...((data ?? []) as Signalement[]));
    if (!data || data.length < PAGE) break;
  }
  return lignes;
}

/** Version la plus récente des règles : à citer dans un rapport. */
export function versionRegles(regles: RegleQualite[]): string | null {
  const dates = regles.map(r => r.modifie_le).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
