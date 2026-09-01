// ============================================================
// Service — Profil temporel d'un ensemble de compteurs
//
// Source : RPC fn_energy_profile (migration 20260901), qui agrège
// shelly_cl_horaire côté serveur. Lire la table directement ne
// tenait pas : 30 j × 24 h × 19 appareils = 13 680 lignes, très
// au-dessus du plafond de 1 000 lignes de PostgREST — le profil
// aurait été silencieusement tronqué, comme l'était le calendrier
// d'activité avant fn_energy_by_day.
// ============================================================

import { supabase } from '@/lib/supabase';
import type { Filters } from '@/lib/iot-dashboard-service';
import { getHistoricRange } from '@/lib/iot-dashboard-service';

export type Bucket = 'hour' | 'day';

/** Où se trouve physiquement un appareil. */
export interface LieuAppareil {
  site: string;
  room: string | null;
}

/**
 * Index device_id → site / pièce.
 *
 * Indispensable côté popup : `fn_energy_by_device` ne renvoie PAS la pièce
 * (elle vaut `null` dans EnergyAgg), et le snapshot ne couvre que les 5
 * dernières minutes. Le catalogue (fenêtre 7 j) est donc la source
 * principale, le snapshot ne servant qu'à rattraper un appareil trop récent
 * pour y figurer.
 */
export function indexLieux(
  ...sources: { device_id: string; site: string; room?: string | null }[][]
): Map<string, LieuAppareil> {
  const map = new Map<string, LieuAppareil>();
  for (const source of sources) {
    for (const d of source) {
      const connu = map.get(d.device_id);
      // Une pièce renseignée l'emporte sur une pièce absente, quelle que soit
      // la source : mieux vaut « Atelier » venu du snapshot que le `null` du
      // catalogue pour un appareil déplacé récemment.
      if (connu && (connu.room != null || d.room == null)) continue;
      map.set(d.device_id, { site: d.site, room: d.room ?? null });
    }
  }
  return map;
}

export interface EnergyProfilePoint {
  /** Début du pas de temps. TIMESTAMP sans fuseau, comme ts_heure. */
  bucket: string;
  kwh: number | null;
  kwh_inj: number | null;
  p_moy_w: number | null;
  p_max_w: number | null;
  v_a: number | null;
  v_b: number | null;
  v_c: number | null;
  v_mono: number | null;
  p_a: number | null;
  p_b: number | null;
  p_c: number | null;
  nb_devices: number | null;
  nb_mesures: number | null;
}

/** Plage analysée par la popup, déduite des filtres du dashboard. */
export interface PlageDetail {
  since: string;
  until: string;
  bucket: Bucket;
  libelle: string;
}

const jourFr = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
  });

/**
 * En mode live, les filtres ne définissent qu'une fenêtre de 5 minutes :
 * trop courte pour un profil. La popup regarde alors les 24 dernières
 * heures — c'est le contexte qui manque à la valeur instantanée, pas
 * l'instant lui-même, déjà affiché sur la carte.
 */
export function plageDetail(filters: Filters): PlageDetail {
  if (filters.period === 'live') {
    const until = new Date();
    const since = new Date(until.getTime() - 24 * 3_600_000);
    return {
      since: since.toISOString(),
      until: until.toISOString(),
      bucket: 'hour',
      libelle: '24 dernières heures',
    };
  }

  const { since, until } = getHistoricRange(filters);

  if (filters.period === '1h') {
    return { since, until, bucket: 'hour', libelle: `${jourFr(filters.historicDate)} · ${String(filters.historicHour).padStart(2, '0')} h` };
  }
  if (filters.period === '24h') {
    return { since, until, bucket: 'hour', libelle: jourFr(filters.historicDate) };
  }

  // 7 j / 30 j : au-delà de trois jours, la courbe horaire devient illisible
  // (720 barres) et le pas journalier est celui qui porte le sens métier.
  const jours =
    (new Date(`${filters.historicDateEnd}T00:00:00`).getTime()
      - new Date(`${filters.historicDateStart}T00:00:00`).getTime()) / 86_400_000;
  return {
    since,
    until,
    bucket: jours <= 3 ? 'hour' : 'day',
    libelle: `${jourFr(filters.historicDateStart)} → ${jourFr(filters.historicDateEnd)}`,
  };
}

/** Une ligne de répartition : ce qu'un appareil a pesé dans le total. */
export interface EnergyDevicePart {
  device_id: string;
  name: string;
  site: string;
  kwh: number | null;
  kwh_inj: number | null;
  p_moy_w: number | null;
  nb_heures: number | null;
}

export async function fetchEnergyProfile(opts: {
  since: string;
  until: string;
  deviceIds: string[];
  bucket: Bucket;
  /** Appareils dont le TC est monté à l'envers (conso enregistrée en injection). */
  inverses?: string[];
}): Promise<EnergyProfilePoint[]> {
  if (opts.deviceIds.length === 0) return [];
  // Même convention que fn_energy_by_device : les bornes issues de
  // getHistoricRange sont sans Z pour les modes horaires, la fonction les
  // compare en UTC.
  const z = (s: string) => (s.endsWith('Z') ? s : `${s}Z`);
  const { data, error } = await supabase.rpc('fn_energy_profile', {
    p_since:      z(opts.since),
    p_until:      z(opts.until),
    p_device_ids: opts.deviceIds,
    p_bucket:     opts.bucket,
    p_inverses:   opts.inverses && opts.inverses.length > 0 ? opts.inverses : null,
  });
  if (error) throw error;
  return (data ?? []) as EnergyProfilePoint[];
}

/**
 * Contribution de chaque appareil du groupe, sur la MÊME période et avec les
 * mêmes règles que le profil : la somme des lignes égale donc le total de la
 * courbe. C'est ce qui manquait à la première version, où la répartition
 * venait de la puissance instantanée et affichait des zéros sous un total non
 * nul.
 */
export async function fetchEnergyRepartition(opts: {
  since: string;
  until: string;
  deviceIds: string[];
  inverses?: string[];
}): Promise<EnergyDevicePart[]> {
  if (opts.deviceIds.length === 0) return [];
  const z = (s: string) => (s.endsWith('Z') ? s : `${s}Z`);
  const { data, error } = await supabase.rpc('fn_energy_repartition', {
    p_since:      z(opts.since),
    p_until:      z(opts.until),
    p_device_ids: opts.deviceIds,
    p_inverses:   opts.inverses && opts.inverses.length > 0 ? opts.inverses : null,
  });
  if (error) throw error;
  return (data ?? []) as EnergyDevicePart[];
}
