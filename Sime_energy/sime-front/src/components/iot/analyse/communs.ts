// ============================================================
// IOT — Analyse : définitions communes aux vues (métriques, couleurs,
// infobulles, format des nombres). Extrait d'AnalyseTab.tsx (16/10).
// ============================================================

import { seriesColor, type Palette } from '@/lib/chart-preferences';
import type { ShellyRow } from '../shared';

export type MetricKey =
  | 'kwhTotal' | 'kwhNet' | 'kwhRetourTotal'
  | 'kwhA' | 'kwhB' | 'kwhC'
  | 'kwhRetourA' | 'kwhRetourB' | 'kwhRetourC'
  | 'puissKwTotal' | 'puissKwA' | 'puissKwB' | 'puissKwC';

export type MetricGroup = 'Énergie' | 'Phase A' | 'Phase B' | 'Phase C' | 'Puissance';

export const METRIQUES: { key: MetricKey; label: string; unit: string; color: string; group: MetricGroup }[] = [
  // ÉNERGIE — Totaux
  { key: 'kwhTotal',             label: 'Consommation totale',       unit: 'kWh',  color: '#3b82f6', group: 'Énergie' },
  { key: 'kwhNet',               label: 'Énergie nette',             unit: 'kWh',  color: '#a78bfa', group: 'Énergie' },
  { key: 'kwhRetourTotal',       label: 'Énergie injectée (retour)', unit: 'kWh',  color: '#ec4899', group: 'Énergie' },
  // PAR PHASE — Soutirage
  { key: 'kwhA',                 label: 'Phase A — Consommation',    unit: 'kWh',  color: '#22c55e', group: 'Phase A' },
  { key: 'kwhB',                 label: 'Phase B — Consommation',    unit: 'kWh',  color: '#f59e0b', group: 'Phase B' },
  { key: 'kwhC',                 label: 'Phase C — Consommation',    unit: 'kWh',  color: '#ec4899', group: 'Phase C' },
  // PAR PHASE — Retour réseau
  { key: 'kwhRetourA',           label: 'Phase A — Retour réseau',   unit: 'kWh',  color: '#34d399', group: 'Phase A' },
  { key: 'kwhRetourB',           label: 'Phase B — Retour réseau',   unit: 'kWh',  color: '#fbbf24', group: 'Phase B' },
  { key: 'kwhRetourC',           label: 'Phase C — Retour réseau',   unit: 'kWh',  color: '#f472b6', group: 'Phase C' },
  // PUISSANCE
  { key: 'puissKwTotal',         label: 'Puissance totale',          unit: 'kW',   color: '#06b6d4', group: 'Puissance' },
  { key: 'puissKwA',             label: 'Puissance — Phase A',       unit: 'kW',   color: '#67e8f9', group: 'Puissance' },
  { key: 'puissKwB',             label: 'Puissance — Phase B',       unit: 'kW',   color: '#fde047', group: 'Puissance' },
  { key: 'puissKwC',             label: 'Puissance — Phase C',       unit: 'kW',   color: '#fda4af', group: 'Puissance' },
];

// ── Grandeurs environnementales (CAPTEUR_ENV / ETAT) ──────────
// Contrairement aux kWh, ces grandeurs ne se somment pas : elles s'observent
// en min / max / moyenne. Les vues env_* utilisent donc leurs propres agrégats.
export type EnvMetricKey =
  | 'temperature' | 'humidite' | 'ressenti' | 'pointRosee'
  | 'uvIndex' | 'luminosite' | 'pression' | 'precipitation'
  | 'ventVitesse' | 'ventRafale' | 'batterie' | 'signal';

export const METRIQUES_ENV: { key: EnvMetricKey; label: string; unit: string; color: string }[] = [
  { key: 'temperature',   label: 'Température',     unit: '°C',  color: '#f97316' },
  { key: 'humidite',      label: 'Humidité',        unit: '%',   color: '#3b82f6' },
  { key: 'ressenti',      label: 'Ressenti',        unit: '°C',  color: '#fb923c' },
  { key: 'pointRosee',    label: 'Point de rosée',  unit: '°C',  color: '#22d3ee' },
  { key: 'uvIndex',       label: 'Indice UV',       unit: '',    color: '#a855f7' },
  { key: 'luminosite',    label: 'Luminosité',      unit: 'lux', color: '#eab308' },
  { key: 'pression',      label: 'Pression',        unit: 'hPa', color: '#94a3b8' },
  { key: 'precipitation', label: 'Précipitations',  unit: 'mm',  color: '#38bdf8' },
  { key: 'ventVitesse',   label: 'Vent',            unit: 'm/s', color: '#34d399' },
  { key: 'ventRafale',    label: 'Rafale',          unit: 'm/s', color: '#10b981' },
  { key: 'batterie',      label: 'Batterie',        unit: '%',   color: '#84cc16' },
  { key: 'signal',        label: 'Signal',          unit: 'dBm', color: '#64748b' },
];

/**
 * Couleur d'une grandeur, prise dans la palette choisie par l'utilisateur
 * (lib/chart-preferences, commune avec le module Mesures). Les couleurs
 * écrites dans METRIQUES / METRIQUES_ENV restent le repli : elles servent
 * encore aux pastilles hors graphique et si une clé est inconnue.
 */
export function colorForMetric(palette: Palette, key: string): string {
  const iE = METRIQUES.findIndex(m => m.key === key);
  if (iE >= 0) return seriesColor(palette, iE);
  const iV = METRIQUES_ENV.findIndex(m => m.key === key);
  if (iV >= 0) return seriesColor(palette, iV);
  return seriesColor(palette, 0);
}

/**
 * Grandeur affichable dans les vues Environnement / Grandeurs : une
 * grandeur env connue (champ de ShellyRow) ou une colonne d'un fichier
 * importé quelconque (ShellyRow.grandeurs, clé « libellé (unité) »).
 */
export interface GrandeurDef { key: string; label: string; unit: string; color: string }

export function valeurGrandeur(r: ShellyRow, key: string): number | undefined {
  const v = (r as unknown as Record<string, unknown>)[key] ?? r.grandeurs?.[key];
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

/** Grandeurs présentes dans les lignes : env connues d'abord, puis celles des fichiers. */
export function grandeursDisponibles(rows: ShellyRow[], palette: Palette): GrandeurDef[] {
  const defs: GrandeurDef[] = METRIQUES_ENV
    .filter(m => rows.some(r => typeof r[m.key] === 'number'))
    .map(m => ({ key: m.key, label: m.label, unit: m.unit, color: colorForMetric(palette, m.key) }));
  const autres = new Set<string>();
  for (const r of rows) if (r.grandeurs) for (const k of Object.keys(r.grandeurs)) autres.add(k);
  for (const k of autres) {
    const m = k.match(/^(.*?)\s*\(([^()]*)\)$/);
    defs.push({ key: k, label: m ? m[1] : k, unit: m ? m[2] : '', color: seriesColor(palette, defs.length) });
  }
  return defs;
}

export const TOOLTIP_STYLE = {
  backgroundColor: '#0f172a',
  border: '1px solid rgba(148,163,184,0.35)',
  borderRadius: 10,
  color: '#e2e8f0',
};

export const TOOLTIP_LABEL_STYLE = { color: '#f8fafc', fontWeight: 600 };

// Format français : remplace le . décimal par une virgule (ex: 13.455 → 13,455)
export function fmtFr(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

