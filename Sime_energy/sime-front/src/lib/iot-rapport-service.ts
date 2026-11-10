// ============================================================
// IOT — Données du rapport enrichi (lecture seule)
//
// Heures, voies, pics et cohérence viennent de fonctions SQL dédiées
// (migration 20261104_arbre_circuits_et_analyses_rapport). La RLS de
// l'organisation s'y applique. Une mesure absente reste absente, jamais 0.
// ============================================================

import { supabase } from '@/lib/supabase';

export interface LigneHoraire {
  /** Instant de début d'heure (UTC = heure de Dakar). */
  ts: Date;
  site: string;
  deviceId: string;
  nom: string;
  famille: string | null;
  role: string | null;
  parentId: string | null;
  wh: number;
  whInj: number;
  wMoy: number | null;
  wMax: number | null;
  whA: number;
  whB: number;
  whC: number;
  nbMesures: number;
}

export interface PerimetreRapport {
  dateDebut: string;
  dateFin: string;
  heureDebut: number;
  heureFin: number;
  sites: string[] | null;
  deviceIds: string[] | null;
}

export async function fetchProfilHoraire(p: PerimetreRapport): Promise<LigneHoraire[]> {
  const PAGE = 1000;
  const lignes: LigneHoraire[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('fn_profil_horaire', {
        p_date_debut: p.dateDebut, p_date_fin: p.dateFin,
        p_heure_debut: p.heureDebut, p_heure_fin: p.heureFin,
        p_sites: p.sites, p_device_ids: p.deviceIds,
      })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      lignes.push({
        ts: new Date(r.ts_heure), site: r.site, deviceId: r.device_id, nom: r.name ?? r.device_id,
        famille: r.device_family, role: r.role, parentId: r.parent_device_id,
        wh: r.wh_conso ?? 0, whInj: r.wh_inj ?? 0, wMoy: r.w_moy, wMax: r.w_max,
        whA: r.wh_a ?? 0, whB: r.wh_b ?? 0, whC: r.wh_c ?? 0, nbMesures: r.nb_mesures_reelles ?? 0,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return lignes;
}

export interface VoieMinute {
  device_id: string;
  nb_releves: number;
  p_max: number | null;
  heure_p_max: string | null;
  p_min: number | null;
  talon_w: number | null;
  v_min: number | null;
  v_max: number | null;
}

const bornes = (p: PerimetreRapport) => {
  const fin = new Date(`${p.dateFin}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return { p_debut: `${p.dateDebut}T00:00:00Z`, p_fin: fin.toISOString() };
};

/** Un appel par appareil, 4 à la fois : un appareil qui échoue n'emporte pas les autres. */
export async function fetchVoiesMinute(
  p: PerimetreRapport, deviceIds: string[], talon: { debut: number; fin: number }, onAppareil?: () => void,
): Promise<{ voies: VoieMinute[]; echecs: number }> {
  const voies: VoieMinute[] = [];
  let echecs = 0;
  const { p_debut, p_fin } = bornes(p);
  const file = [...deviceIds];
  const ouvrier = async () => {
    for (let id = file.shift(); id; id = file.shift()) {
      const { data, error } = await supabase.rpc('fn_voie_minute', {
        p_device_id: id, p_debut, p_fin, p_talon_debut: talon.debut, p_talon_fin: talon.fin,
      });
      if (error) echecs++;
      else voies.push(...((data ?? []) as VoieMinute[]));
      onAppareil?.();
    }
  };
  await Promise.all(Array.from({ length: 4 }, ouvrier));
  return { voies, echecs };
}

export interface PicMinute { minute: string; power_w: number; circuits: Record<string, number> }

export async function fetchPicsMinute(p: PerimetreRapport, compteur: string, nb = 15): Promise<PicMinute[]> {
  const { data, error } = await supabase.rpc('fn_pics_minute', {
    ...bornes(p), p_compteur: compteur, p_sites: p.sites, p_device_ids: p.deviceIds, p_nb: nb,
  });
  if (error) throw error;
  return (data ?? []) as PicMinute[];
}

export interface CoherenceCircuit {
  parent_device_id: string;
  nb_enfants: number;
  minutes_communes: number;
  minutes_ok: number;
  ecart_median_w: number | null;
  ecart_p95_w: number | null;
}

export async function fetchCoherence(p: PerimetreRapport): Promise<CoherenceCircuit[]> {
  const { data, error } = await supabase.rpc('fn_coherence_circuits', {
    ...bornes(p), p_sites: p.sites, p_device_ids: p.deviceIds,
  });
  if (error) throw error;
  return (data ?? []) as CoherenceCircuit[];
}

/** Température moyenne par jour des capteurs du périmètre (clé AAAA-MM-JJ). */
export async function fetchTemperatureJour(p: PerimetreRapport): Promise<Map<string, number>> {
  const PAGE = 1000;
  const parJour = new Map<string, { somme: number; n: number }>();
  const { p_debut, p_fin } = bornes(p);
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('shelly_cl_horaire')
      .select('ts_heure,temperature_moy')
      .gte('ts_heure', p_debut).lt('ts_heure', p_fin)
      .not('temperature_moy', 'is', null)
      .order('ts_heure').order('device_id')
      .range(from, from + PAGE - 1);
    if (p.sites) q = q.in('site', p.sites);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data ?? []) {
      const cle = new Date(r.ts_heure as string).toISOString().slice(0, 10);
      const c = parJour.get(cle) ?? { somme: 0, n: 0 };
      c.somme += r.temperature_moy as number;
      c.n += 1;
      parJour.set(cle, c);
    }
    if (!data || data.length < PAGE) break;
  }
  return new Map([...parJour].map(([k, v]) => [k, v.somme / v.n]));
}

// ── Capteurs (tout ce qui n'est pas de l'énergie) ────────────
export interface LigneCapteur {
  ts: Date;
  site: string;
  deviceId: string;
  nom: string;
  famille: string | null;
  type: string | null;
  /** Grandeurs mesurées cette heure-là ; absente = pas de mesure. */
  valeurs: Record<string, number>;
  nbMesures: number;
}

const COLONNES_CAPTEUR = [
  'temperature', 'temperature_min', 'temperature_max', 'humidite', 'ressenti', 'point_rosee',
  'uv', 'uv_max', 'lux', 'lux_max', 'pression', 'pluie_mm', 'vent', 'rafale',
  'inclinaison', 'gaz_ppm', 'temp_interne', 'batterie', 'signal',
] as const;

export async function fetchCapteursHoraire(p: PerimetreRapport): Promise<LigneCapteur[]> {
  const PAGE = 1000;
  const lignes: LigneCapteur[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('fn_capteurs_horaire', {
        p_date_debut: p.dateDebut, p_date_fin: p.dateFin,
        p_heure_debut: p.heureDebut, p_heure_fin: p.heureFin,
        p_sites: p.sites, p_device_ids: p.deviceIds,
      })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data ?? []) {
      const valeurs: Record<string, number> = {};
      for (const c of COLONNES_CAPTEUR) if (typeof r[c] === 'number') valeurs[c] = r[c];
      lignes.push({
        ts: new Date(r.ts_heure), site: r.site, deviceId: r.device_id, nom: r.name ?? r.device_id,
        famille: r.device_family, type: r.device_type, valeurs, nbMesures: r.nb_mesures_reelles ?? 0,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return lignes;
}

export interface EtatAppareil {
  device_id: string;
  etat: string;
  nb_entrees: number;
  duree_s: number;
  nb_releves: number;
  par_heure: number[];
  par_jour: Record<string, number>;
  duree_inconnue_s: number;
}

/** Un appel par appareil, 4 à la fois : un appareil qui échoue n'emporte pas les autres. */
export async function fetchEtatsAppareils(p: PerimetreRapport, deviceIds: string[], onAppareil?: () => void): Promise<{ etats: EtatAppareil[]; echecs: number }> {
  const etats: EtatAppareil[] = [];
  let echecs = 0;
  const { p_debut, p_fin } = bornes(p);
  const file = [...deviceIds];
  const ouvrier = async () => {
    for (let id = file.shift(); id; id = file.shift()) {
      const { data, error } = await supabase.rpc('fn_etats_appareil', {
        p_device_id: id, p_debut, p_fin, p_heure_debut: p.heureDebut, p_heure_fin: p.heureFin,
      });
      if (error) echecs++;
      else etats.push(...((data ?? []) as EtatAppareil[]));
      onAppareil?.();
    }
  };
  await Promise.all(Array.from({ length: 4 }, ouvrier));
  return { etats, echecs };
}

// ── Relevés bruts (onglets facultatifs Brut / Nettoyé) ───────
const COLONNES_BRUT = 'ts,measured_at,device_id,name,state,power_w,p_a,p_b,p_c,v_a,v_b,v_c,i_a,i_b,i_c,wh_tot,wh_rtot';

export type ReleveBrut = Record<string, string | number | null>;

/** Lecture par curseur sur (device_id, ts), appareil par appareil : l'index porte chaque page. */
export async function fetchRelevesBruts(p: PerimetreRapport, deviceIds: string[], onProgress?: (n: number) => void): Promise<ReleveBrut[]> {
  const PAGE = 1000;
  const { p_debut, p_fin } = bornes(p);
  const lignes: ReleveBrut[] = [];
  for (const id of deviceIds) {
    let curseur = p_debut;
    let premier = true;
    for (;;) {
      let q = supabase.from('shelly_cl').select(COLONNES_BRUT).eq('device_id', id).lt('ts', p_fin).order('ts').limit(PAGE);
      q = premier ? q.gte('ts', curseur) : q.gt('ts', curseur);
      const { data, error } = await q;
      if (error) throw error;
      const page = (data ?? []) as unknown as ReleveBrut[];
      lignes.push(...page);
      onProgress?.(lignes.length);
      if (page.length < PAGE) break;
      curseur = page[page.length - 1].ts as string;
      premier = false;
    }
  }
  return lignes;
}
