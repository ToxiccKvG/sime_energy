// ============================================================
// Quarantaine des mesures aberrantes — module Mesures
//
// Demande du manager (réunion du 18/09), reprise mot pour mot :
//   « Il ne va pas l'éliminer dans la base. Pour la base, les données
//     doivent rester telles quelles. Mais dans ce qu'on va analyser,
//     il faut qu'on puisse le filtrer. » — et le terme qu'il a proposé :
//   « mettre en quarantaine ».
//
// Motif concret : les valeurs à zéro entrent dans la moyenne et la tirent
// vers le bas, alors qu'elles traduisent un capteur hors service ou une
// coupure, pas une consommation réelle.
//
// Principe : on ne touche JAMAIS aux relevés. On calcule une liste de
// points écartés, appliquée aux statistiques et aux graphiques. Ce qui
// est écarté est toujours affiché et justifié — une moyenne différente
// sur le même fichier doit rester explicable devant un client.
// ============================================================

import { useSyncExternalStore } from 'react';
import { computeAnomalies, type AnomalyEvent, type Measurement, type SeriesContext } from './analysisModels';

/** Familles d'anomalies écartables, indépendamment l'une de l'autre. */
export type QuarantineReason = 'zero' | 'flat' | 'profile';

export const REASON_LABELS: Record<QuarantineReason, { label: string; hint: string }> = {
  zero: {
    label: 'Valeurs à zéro',
    hint: "Plages prolongées à zéro. À n'activer que sur un COMPTEUR D'ARRIVÉE, où un zéro long signale une coupure. "
      + "Sur un départ (clim, frigo, prise), un zéro veut simplement dire « appareil éteint » : l'écarter fausse les "
      + "statistiques — vérifié sur Clim Salon, l'écart-type doublait et la durée couverte chutait de 123 à 79 jours.",
  },
  flat: {
    label: 'Valeurs figées',
    hint: 'Même valeur répétée pendant des heures : capteur bloqué, la mesure ne suit plus la réalité.',
  },
  profile: {
    label: 'Écarts au profil',
    hint: 'Points très éloignés du comportement habituel du même créneau (pics de mesure, erreurs de lecture).',
  },
};

export interface QuarantineSettings {
  enabled: boolean;
  reasons: Record<QuarantineReason, boolean>;
}

const DEFAULTS: QuarantineSettings = {
  // Écarter par défaut fausserait les chiffres d'un utilisateur qui ne l'a
  // pas demandé : la quarantaine s'active sciemment.
  enabled: false,
  // Seules les valeurs figées NON NULLES sont cochées d'office : un capteur
  // bloqué est toujours une anomalie. Les zéros, non — sur un départ ils
  // traduisent un appareil éteint, et la moyenne principale les exclut déjà
  // (« Moyenne hors zéros »). L'utilisateur coche s'il analyse une arrivée.
  reasons: { zero: false, flat: true, profile: false },
};

const STORAGE_KEY = 'sime-quarantine-v1';

function load(): QuarantineSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<QuarantineSettings>;
    return {
      enabled: typeof p.enabled === 'boolean' ? p.enabled : DEFAULTS.enabled,
      reasons: { ...DEFAULTS.reasons, ...(p.reasons ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

let state: QuarantineSettings = load();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  listeners.forEach(l => l());
}

export function getQuarantineSettings(): QuarantineSettings { return state; }
export function setQuarantineEnabled(enabled: boolean) { state = { ...state, enabled }; persist(); }
export function setQuarantineReason(reason: QuarantineReason, on: boolean) {
  state = { ...state, reasons: { ...state.reasons, [reason]: on } };
  persist();
}

export function useQuarantineSettings(): QuarantineSettings {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getQuarantineSettings,
    getQuarantineSettings,
  );
}

// ---- Calcul ----

export interface QuarantineResult {
  /** Relevés conservés pour les statistiques et les graphiques. */
  kept: Measurement[];
  /** Relevés écartés, avec le motif. */
  excluded: { measurement: Measurement; reason: QuarantineReason }[];
  /** Nombre d'écartés par motif. */
  counts: Record<QuarantineReason, number>;
  total: number;
  /** Épisodes ayant motivé l'exclusion, pour l'explication et le rapport. */
  episodes: AnomalyEvent[];
  /** Phrase prête à insérer dans un export ou un rapport. */
  summary: string | null;
}

const EMPTY_COUNTS: Record<QuarantineReason, number> = { zero: 0, flat: 0, profile: 0 };

function reasonOf(e: AnomalyEvent): QuarantineReason | null {
  // Un « trou de collecte » n'a pas de point à écarter : il n'y a rien à
  // exclure d'une moyenne quand la mesure est absente.
  if (e.kind === 'gap') return null;
  if (e.kind === 'flat') return e.value === 0 ? 'zero' : 'flat';
  return 'profile'; // 'high' | 'low'
}

function parseTs(ts: unknown): number {
  return new Date(String(ts).replace(' ', 'T')).getTime();
}

/**
 * Applique la quarantaine à une série. Sans réglage actif, renvoie la série
 * intacte : le coût du calcul n'est payé que si l'utilisateur l'a demandé.
 */
export function applyQuarantine(
  measurements: Measurement[],
  ctx: Omit<SeriesContext, 'measurements'>,
  settings: QuarantineSettings,
): QuarantineResult {
  const inert: QuarantineResult = {
    kept: measurements, excluded: [], counts: { ...EMPTY_COUNTS },
    total: 0, episodes: [], summary: null,
  };
  if (!settings.enabled || measurements.length === 0) return inert;

  const active = (Object.keys(settings.reasons) as QuarantineReason[]).filter(r => settings.reasons[r]);
  if (active.length === 0) return inert;

  let anomalies;
  try {
    anomalies = computeAnomalies({ ...ctx, measurements });
  } catch {
    // Une série trop courte ou trop irrégulière ne se prête pas à l'analyse :
    // mieux vaut ne rien écarter que d'écarter au hasard.
    return inert;
  }

  const episodes = anomalies.events.filter(e => {
    const r = reasonOf(e);
    return r !== null && settings.reasons[r];
  });
  if (episodes.length === 0) return inert;

  const kept: Measurement[] = [];
  const excluded: QuarantineResult['excluded'] = [];
  const counts = { ...EMPTY_COUNTS };

  for (const m of measurements) {
    const t = parseTs(m.timestamp);
    // Une marge d'un pas de part et d'autre serait arbitraire : on s'en tient
    // aux bornes de l'épisode telles que le modèle les a calculées.
    const hit = isNaN(t) ? undefined : episodes.find(e => t >= e.start && t <= e.end);
    const reason = hit ? reasonOf(hit) : null;
    if (reason) { excluded.push({ measurement: m, reason }); counts[reason]++; }
    else kept.push(m);
  }

  const total = excluded.length;
  const parts = (Object.keys(counts) as QuarantineReason[])
    .filter(r => counts[r] > 0)
    .map(r => `${counts[r]} ${REASON_LABELS[r].label.toLowerCase()}`);

  return {
    kept, excluded, counts, total, episodes,
    summary: total > 0
      ? `${total} mesure${total > 1 ? 's' : ''} sur ${measurements.length} écartée${total > 1 ? 's' : ''} des calculs (${parts.join(', ')}) — données conservées.`
      : null,
  };
}
