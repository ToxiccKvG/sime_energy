// ============================================================
// IOT MODULE — Onglet Nettoyage de données
// Assistant guidé : détection auto + corrections à la demande
// ============================================================

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { exportJsonToXlsx } from '@/lib/excel-utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Trash2, Download, RotateCcw, Search, Filter, Eye, EyeOff,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle, CheckCircle2,
  CheckSquare, Square, Replace,
  ChevronLeft, ChevronRight, Columns, Eraser,
  FileSpreadsheet, Hash, Calendar, Type, ScanLine,
  TrendingDown, Scissors, Copy, GitBranch, X, Wand2, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useIOT } from './IOTContext';
import { findFrozenRows, fmtDuration, BLANKABLE_ENV_KEYS } from '@/lib/iot-frozen';
import { usePinnedColumns } from './tablePrefs';
import type { ShellyRow } from './shared';
import { COLONNES_PROFIL_SHELLY } from './shared';
import { parseShellyRow, profilMiToShellyRow, detecterFormatShelly, parseShellySectionCSV, ajouterCumulatifs } from '@/lib/iot-profil-engine';
import { transformRowsToProfilMi, transformHoraireToProfilMi } from '@/lib/iot-supabase-service';
import { GenericNettoyage } from './GenericNettoyage';
import { lireFichierImporte } from '@/lib/iot-lecture-fichier';
import { useQualiteMoteur, QualiteMoteurPanel, RecettesPanel, nomChargement, type RecettesPanelHandle } from './QualiteMoteurPanel';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/lib/supabase';

// ============================================================
// TYPES
// ============================================================

// ── Nom de fichier auto-généré depuis le site / la pièce / l'appareil détectés
//    dans les données, pour distinguer les fichiers nettoyés entre eux au lieu
//    du générique "données - nettoye" répété pour chaque site.
type IdentiteRow = Pick<ShellyRow, 'deviceLocation' | 'deviceRoom' | 'nomAppareil'>;

function pickStr(r: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function buildCleanedFileName(rows: IdentiteRow[], fallback: string): string {
  const uniq = (vals: (string | undefined)[]) =>
    Array.from(new Set(vals.filter((v): v is string => Boolean(v && v.trim()))));
  const sites     = uniq(rows.map(r => r.deviceLocation));
  const pieces    = uniq(rows.map(r => r.deviceRoom));
  const appareils = uniq(rows.map(r => r.nomAppareil));

  const label = (vals: string[], pluriel: string) =>
    vals.length === 1 ? vals[0] : vals.length > 1 ? `${vals.length} ${pluriel}` : null;

  const parts = [
    label(sites, 'sites'),
    label(pieces, 'pièces'),
    label(appareils, 'appareils'),
  ].filter((p): p is string => Boolean(p));

  return (parts.length > 0 ? parts.join(' - ') : fallback) + ' - nettoyé';
}

type ColType = 'date' | 'num' | 'text';
type IssueType = 'duplicates_day' | 'duplicates_exact' | 'frozen' | 'zeros' | 'outliers' | 'gaps' | 'negatives' | 'phase_mismatch';
type NumOp  = 'round' | 'multiply' | 'add' | 'clamp_min' | 'clamp_max' | 'abs' | 'zero_neg' | 'normalize';
type TextOp = 'trim' | 'uppercase' | 'lowercase' | 'dot_comma' | 'comma_dot' | 'replace';

interface Issue {
  id: IssueType;
  count: number;
  description: string;
  detail?: string;
  gapDates?: Date[];
  ignored: boolean;
}

interface ColDef {
  key: keyof ShellyRow;
  label: string;
  type: ColType;
  editable: boolean;
  defaultVisible: boolean;
  width?: number;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  typeJour: string[];
  kwhMin: string;
  kwhMax: string;
}

interface SortConfig { key: keyof ShellyRow; dir: 'asc' | 'desc' }
interface EditCell { filteredIdx: number; col: keyof ShellyRow }

// ============================================================
// CONSTANTES
// ============================================================

const COLONNES_FIXES: ColDef[] = [
  { key: 'date',                label: 'Date',          type: 'date', editable: true,  defaultVisible: true,  width: 100 },
  { key: 'nomAppareil',         label: 'Appareil',      type: 'text', editable: false, defaultVisible: true,  width: 120 },
  { key: 'deviceLocation',      label: 'Emplacement',   type: 'text', editable: true,  defaultVisible: true,  width: 110 },
  { key: 'deviceRoom',          label: 'Pièce/Zone',    type: 'text', editable: true,  defaultVisible: true,  width: 110 },
  { key: 'jour',                label: 'Jour',          type: 'text', editable: false, defaultVisible: true,  width: 80  },
  { key: 'kwhTotal',            label: 'kWh Total',     type: 'num',  editable: true,  defaultVisible: true,  width: 90  },
  { key: 'kwhNet',              label: 'kWh Net',       type: 'num',  editable: true,  defaultVisible: true,  width: 90  },
  { key: 'kwhRetourTotal',      label: 'kWh Retour',    type: 'num',  editable: true,  defaultVisible: true,  width: 90  },
  { key: 'puissKwTotal',        label: 'Puiss. kW',     type: 'num',  editable: true,  defaultVisible: true,  width: 90  },
  { key: 'kwhA',                label: 'Conso. A',      type: 'num',  editable: true,  defaultVisible: true,  width: 82  },
  { key: 'kwhB',                label: 'Conso. B',      type: 'num',  editable: true,  defaultVisible: true,  width: 82  },
  { key: 'kwhC',                label: 'Conso. C',      type: 'num',  editable: true,  defaultVisible: true,  width: 82  },
  { key: 'puissKwA',            label: 'Puiss. A',      type: 'num',  editable: false, defaultVisible: true,  width: 80  },
  { key: 'puissKwB',            label: 'Puiss. B',      type: 'num',  editable: false, defaultVisible: true,  width: 80  },
  { key: 'puissKwC',            label: 'Puiss. C',      type: 'num',  editable: false, defaultVisible: true,  width: 80  },
  { key: 'kwhRetourA',          label: 'Ret. A',        type: 'num',  editable: true,  defaultVisible: false, width: 75  },
  { key: 'kwhRetourB',          label: 'Ret. B',        type: 'num',  editable: true,  defaultVisible: false, width: 75  },
  { key: 'kwhRetourC',          label: 'Ret. C',        type: 'num',  editable: true,  defaultVisible: false, width: 75  },
  { key: 'jourActivites',       label: 'Activités',     type: 'text', editable: true,  defaultVisible: true,  width: 110 },
  { key: 'saison',              label: 'Saison',        type: 'text', editable: true,  defaultVisible: false, width: 90  },
  { key: 'periodeclimatique',   label: 'Pér. clim.',    type: 'text', editable: false, defaultVisible: false, width: 130 },
  { key: 'periode',             label: 'Pér. jour',     type: 'text', editable: false, defaultVisible: false, width: 100 },
  { key: 'kwhCumTotal',         label: 'kWh Cum.',      type: 'num',  editable: false, defaultVisible: false, width: 90  },
  { key: 'profil',              label: 'Profil',        type: 'text', editable: true,  defaultVisible: false, width: 90  },
  { key: 'heuresEnsoleillement',label: 'Ensoleil.',     type: 'text', editable: false, defaultVisible: false, width: 130 },
  { key: 'heuresTravail',       label: 'H. Travail',    type: 'text', editable: false, defaultVisible: false, width: 130 },
  { key: 'whTotal',             label: 'Wh Total',      type: 'num',  editable: true,  defaultVisible: false, width: 80  },
  { key: 'whRetourTotal',       label: 'Wh Retour',     type: 'num',  editable: true,  defaultVisible: false, width: 90  },
  // ── Capteurs environnementaux (CAPTEUR_ENV / ETAT) ──
  { key: 'temperature',         label: 'Température',   type: 'num',  editable: true,  defaultVisible: true,  width: 90  },
  { key: 'humidite',            label: 'Humidité',      type: 'num',  editable: true,  defaultVisible: true,  width: 85  },
  { key: 'etatCapteur',         label: 'État',           type: 'text', editable: false, defaultVisible: true,  width: 90  },
  { key: 'batterie',            label: 'Batterie',      type: 'num',  editable: false, defaultVisible: true,  width: 80  },
  { key: 'signal',              label: 'Signal',        type: 'num',  editable: false, defaultVisible: false, width: 75  },
  { key: 'ressenti',            label: 'Ressenti',      type: 'num',  editable: true,  defaultVisible: false, width: 85  },
  { key: 'pointRosee',          label: 'Pt. Rosée',     type: 'num',  editable: true,  defaultVisible: false, width: 85  },
  { key: 'uvIndex',             label: 'UV',             type: 'num',  editable: true,  defaultVisible: false, width: 60  },
  { key: 'luminosite',          label: 'Luminosité',    type: 'num',  editable: true,  defaultVisible: false, width: 95  },
  { key: 'pression',            label: 'Pression',      type: 'num',  editable: true,  defaultVisible: false, width: 85  },
  { key: 'tendancePression',    label: 'Tend. Press.',  type: 'text', editable: false, defaultVisible: false, width: 100 },
  { key: 'precipitation',       label: 'Pluie cumulée', type: 'num',  editable: false, defaultVisible: false, width: 95  },
  { key: 'precipitationIncr',   label: 'Pluie (mm)',    type: 'num',  editable: false, defaultVisible: false, width: 85  },
  { key: 'mesureAt',            label: 'Mesure réelle', type: 'date', editable: false, defaultVisible: false, width: 130 },
  { key: 'alarmeHumidite',      label: 'Alarme Pluie',  type: 'text', editable: false, defaultVisible: false, width: 100 },
  { key: 'ventVitesse',         label: 'Vent',           type: 'num',  editable: true,  defaultVisible: false, width: 75  },
  { key: 'ventRafale',          label: 'Rafale',        type: 'num',  editable: true,  defaultVisible: false, width: 75  },
  { key: 'ventDirection',       label: 'Dir. Vent',     type: 'num',  editable: true,  defaultVisible: false, width: 85  },
  { key: 'angleInclinaison',    label: 'Inclinaison',   type: 'num',  editable: false, defaultVisible: false, width: 95  },
  { key: 'concentrationGaz',    label: 'Gaz',            type: 'num',  editable: true,  defaultVisible: false, width: 75  },
  { key: 'tempInterne',         label: 'Temp. Interne', type: 'num',  editable: false, defaultVisible: false, width: 100 },
  { key: 'batterieV',           label: 'Batterie (V)',  type: 'num',  editable: false, defaultVisible: false, width: 100 },
];

const ENUM_OPTIONS: Partial<Record<keyof ShellyRow, string[]>> = {
  jourActivites:        ['Jour ouvré', 'Weekend', 'Jour férié'],
  saison:               ['Sèche', 'Hivernage'],
  periodeclimatique:    ['Période de fraîcheur', 'Période chaude'],
  profil:               ['CHARGE', 'SOUTIRAGE'],
  periode:              ['Nuit', 'Matin', 'Après-midi', 'Soir'],
  heuresEnsoleillement: ['En ensoleillement', 'Hors ensoleillement'],
  heuresTravail:        ["Heures d'activités", 'Heures hors activités'],
};

const NUM_COLS: (keyof ShellyRow)[] = [
  'kwhTotal', 'kwhNet', 'kwhRetourTotal', 'kwhA', 'kwhB', 'kwhC',
  'puissKwTotal', 'puissKwA', 'puissKwB', 'puissKwC',
  'kwhRetourA', 'kwhRetourB', 'kwhRetourC',
  'whTotal', 'whRetourTotal',
];

// Colonnes structurelles toujours affichées, quel que soit le contenu (identité + temps)
const ALWAYS_VISIBLE_COLS = new Set<string>(['date', 'nomAppareil', 'deviceLocation', 'deviceRoom', 'jour', 'jourActivites']);

const EMPTY_FILTERS: Filters = { dateFrom: '', dateTo: '', typeJour: [], kwhMin: '', kwhMax: '' };
const PAGE_SIZE    = 50;
const FILE_PAGE_SIZE = 50;
const OUTLIER_SIGMA  = 2.5;

// ============================================================
// HELPERS
// ============================================================

function formatCell(row: ShellyRow, col: keyof ShellyRow): string {
  const v = row[col];
  // Afficher l'heure dès que le relevé n'est pas à minuit : sinon les séries
  // infra-journalières (relevés à la minute) semblaient toutes porter la même date.
  if (v instanceof Date) {
    const hasTime = v.getHours() !== 0 || v.getMinutes() !== 0 || v.getSeconds() !== 0;
    return hasTime
      ? `${v.toLocaleDateString('fr-FR')} ${v.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : v.toLocaleDateString('fr-FR');
  }
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'number') {
    if (isNaN(v)) return '';
    const digits = 3;
    return v.toFixed(digits).replace('.', ',');
  }
  return String(v ?? '');
}

function rawValue(row: ShellyRow, col: keyof ShellyRow): string {
  const v = row[col];
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  if (typeof v === 'number') return String(v);
  return String(v ?? '');
}

function computeStats(values: number[]) {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std  = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const min  = values.reduce((a, b) => Math.min(a, b), Infinity);
  const max  = values.reduce((a, b) => Math.max(a, b), -Infinity);
  return { mean, std, min, max };
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

function detectColType(col: string, rows: Record<string, unknown>[]): 'date' | 'number' | 'text' {
  const sample = rows.slice(0, 20).map(r => r[col]).filter(v => v != null && v !== '');
  if (sample.length === 0) return 'text';
  if (sample.every(v => typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(String(v)))) return 'date';
  if (sample.every(v => !isNaN(Number(v)))) return 'number';
  return 'text';
}

const COL_TYPE_ICON = {
  date:   <Calendar className="h-3 w-3 text-blue-400" />,
  number: <Hash className="h-3 w-3 text-green-400" />,
  text:   <Type className="h-3 w-3 text-slate-400" />,
};
const COL_TYPE_COLOR = {
  date: 'text-blue-300', number: 'text-green-300', text: 'text-slate-300',
};

// ============================================================
// ANALYSEUR — détecte les problèmes dans les données
// ============================================================

// Identité appareil pour les déduplications multi-devices. Le device_id
// d'abord quand il est connu : deux homonymes dans la même pièce (deux
// « Ventilo salon » à Ma Maison) fusionnaient, et leurs heures communes
// passaient pour des doublons exacts — supprimés.
function deviceKey(r: ShellyRow): string {
  if (r.deviceId) return `id:${r.deviceId}`;
  return `${r.nomAppareil ?? ''}|${r.deviceLocation ?? ''}|${r.deviceRoom ?? ''}`;
}

/**
 * Vrai si le jeu de données est infra-journalier (plusieurs relevés par jour
 * pour un même appareil, à des heures différentes).
 *
 * Le contrôle « doublons par (date, appareil) » ne vaut que pour les exports
 * journaliers historiques (une ligne par jour et par appareil). Sur des relevés
 * à la minute ou à l'heure — cas des exports Supabase — deux lignes du même jour
 * ne sont pas des doublons mais une série temporelle : les traiter comme tels
 * réduisait 1440 relevés/jour à une seule ligne (celle de 23:59).
 */
function isSubDaily(rows: ShellyRow[]): boolean {
  const firstTimeByDay = new Map<string, string>();
  for (const r of rows) {
    const d = toDate(r.date);
    const iso = d.toISOString();
    const dayKey  = `${iso.slice(0, 10)}|${deviceKey(r)}`;
    const timeKey = iso.slice(11, 19);
    const seen = firstTimeByDay.get(dayKey);
    if (seen === undefined) firstTimeByDay.set(dayKey, timeKey);
    else if (seen !== timeKey) return true;
  }
  return false;
}

function analyserRows(rows: ShellyRow[]): Omit<Issue, 'ignored'>[] {
  const issues: Omit<Issue, 'ignored'>[] = [];
  if (rows.length === 0) return issues;

  // Appareils qui mesurent réellement de l'énergie (au moins un relevé non nul).
  // Les contrôles portant sur les kWh ne s'appliquent qu'à eux : sur un capteur
  // de température ou d'ouverture de porte, une consommation nulle est normale.
  const energyDevices = new Set<string>();
  for (const r of rows) {
    if (r.kwhTotal !== 0 || r.whTotal !== 0 || r.puissKwTotal !== 0 || r.kwhRetourTotal !== 0) {
      energyDevices.add(deviceKey(r));
    }
  }

  // 1. Doublons par (date, appareil) — uniquement sur des données journalières.
  //    Sur une série infra-journalière, plusieurs relevés le même jour sont
  //    attendus : seul le contrôle « doublons exacts » ci-dessous s'applique.
  const subDaily = isSubDaily(rows);
  const dateMap = new Map<string, number>();
  if (!subDaily) {
    for (const r of rows) {
      const k = `${toDate(r.date).toISOString().slice(0, 10)}|${deviceKey(r)}`;
      dateMap.set(k, (dateMap.get(k) ?? 0) + 1);
    }
  }
  const dupDates = [...dateMap.entries()].filter(([, c]) => c > 1);
  if (dupDates.length > 0) {
    const total = dupDates.reduce((s, [, c]) => s + c - 1, 0);
    issues.push({
      id: 'duplicates_day',
      count: total,
      description: `${total} doublon${total > 1 ? 's' : ''} par (date, appareil)`,
      detail: `${dupDates.length} couple${dupDates.length > 1 ? 's' : ''} (date, appareil) en doublon — ex. : ${dupDates.slice(0, 3).map(([d]) => d.split('|')[0]).join(', ')}`,
    });
  }

  // 2. Doublons exacts (même timestamp + même appareil)
  const dtMap = new Map<string, number>();
  for (const r of rows) {
    const k = `${toDate(r.date).toISOString()}|${deviceKey(r)}`;
    dtMap.set(k, (dtMap.get(k) ?? 0) + 1);
  }
  const dupExact = [...dtMap.values()].filter(c => c > 1).reduce((s, c) => s + c - 1, 0);
  if (dupExact > 0 && dupExact !== dupDates.reduce((s, [, c]) => s + c - 1, 0)) {
    issues.push({
      id: 'duplicates_exact',
      count: dupExact,
      description: `${dupExact} doublon${dupExact > 1 ? 's' : ''} exacts (même date et heure)`,
    });
  }

  // 2 bis. Données figées d'un capteur environnemental : la collecte relit la dernière mesure quand la
  //        station ne transmet pas (nuit, pile…). Ce ne sont pas des mesures.
  const frozen = findFrozenRows(rows);
  if (frozen.rows.length > 0) {
    const pct = Math.round((frozen.rows.length / rows.length) * 100);
    issues.push({
      id: 'frozen',
      count: frozen.rows.length,
      description: `${frozen.rows.length} ligne${frozen.rows.length > 1 ? 's' : ''} figée${frozen.rows.length > 1 ? 's' : ''} — la dernière mesure relue (${pct} % des lignes)`,
      detail: `${frozen.sequences} séquence${frozen.sequences > 1 ? 's' : ''}, la plus longue ${fmtDuration(frozen.longestMs)}`
        + (frozen.longestStart ? ` à partir du ${frozen.longestStart.toLocaleDateString('fr-FR')} ${frozen.longestStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : '')
        + (frozen.exact ? " · repérées d'après l'heure réelle de mesure" : ' · repérées par des valeurs identiques pendant 30 min ou plus'),
    });
  }

  // 3. Lignes vides (kwhTotal=0 ET kwhNet=0)
  //    Restreint aux appareils qui mesurent effectivement de l'énergie : pour un
  //    capteur environnemental ou d'état, kWh = 0 est la valeur normale et non une
  //    donnée manquante. Les signaler invitait à les « remplir » par moyenne ou
  //    interpolation, ce qui aurait fabriqué de la consommation inexistante.
  const zeros = rows.filter(r => energyDevices.has(deviceKey(r)) && r.kwhTotal === 0 && r.kwhNet === 0);
  if (zeros.length > 0) {
    issues.push({
      id: 'zeros',
      count: zeros.length,
      description: `${zeros.length} ligne${zeros.length > 1 ? 's' : ''} vide${zeros.length > 1 ? 's' : ''} (kWh Total et Net = 0)`,
      detail: `Première : ${toDate(zeros[0].date).toLocaleDateString('fr-FR')}`,
    });
  }

  // 4. Valeurs aberrantes (outliers)
  const kwhVals = rows.map(r => r.kwhNet);
  const { mean, std } = computeStats(kwhVals);
  const threshold = mean + OUTLIER_SIGMA * std;
  const outliers  = rows.filter(r => r.kwhNet > threshold);
  if (outliers.length > 0 && std > 0) {
    const maxVal = outliers.reduce((a, r) => Math.max(a, r.kwhNet ?? 0), -Infinity);
    issues.push({
      id: 'outliers',
      count: outliers.length,
      description: `${outliers.length} valeur${outliers.length > 1 ? 's' : ''} aberrante${outliers.length > 1 ? 's' : ''} (kWh Net > ${threshold.toFixed(1)})`,
      detail: `Seuil : moy(${mean.toFixed(2)}) + ${OUTLIER_SIGMA}σ(${std.toFixed(2)}) = ${threshold.toFixed(2)} · Max observé : ${maxVal.toFixed(2)}`,
    });
  }

  // 5. Valeurs négatives
  const negRows = rows.filter(r => r.kwhTotal < 0 || r.kwhNet < 0);
  if (negRows.length > 0) {
    const minVal = negRows.reduce((a, r) => Math.min(a, r.kwhTotal ?? 0, r.kwhNet ?? 0), 0);
    issues.push({
      id: 'negatives',
      count: negRows.length,
      description: `${negRows.length} valeur${negRows.length > 1 ? 's' : ''} négative${negRows.length > 1 ? 's' : ''} (kWh Total ou Net < 0)`,
      detail: `Valeur minimale observée : ${minVal.toFixed(3)} kWh`,
    });
  }

  // 6. Trous dans la série temporelle
  const sortedByDate = [...rows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
  const gapDates: Date[] = [];
  for (let i = 1; i < sortedByDate.length; i++) {
    const diffDays = Math.round(
      (toDate(sortedByDate[i].date).getTime() - toDate(sortedByDate[i - 1].date).getTime()) / 86400000
    );
    if (diffDays > 1) {
      for (let d = 1; d < diffDays; d++) {
        const m = new Date(toDate(sortedByDate[i - 1].date));
        m.setDate(m.getDate() + d);
        gapDates.push(m);
      }
    }
  }
  if (gapDates.length > 0) {
    issues.push({
      id: 'gaps',
      count: gapDates.length,
      description: `${gapDates.length} trou${gapDates.length > 1 ? 'x' : ''} dans la série temporelle`,
      detail: gapDates.slice(0, 5).map(d => d.toLocaleDateString('fr-FR')).join(', ')
              + (gapDates.length > 5 ? ` … +${gapDates.length - 5} autres` : ''),
      gapDates,
    });
  }

  // 7. Incohérence phases vs total (appareils énergie uniquement)
  const phaseMismatch = rows.filter(r => {
    if (!energyDevices.has(deviceKey(r))) return false;
    const sum = r.kwhA + r.kwhB + r.kwhC;
    return r.kwhTotal > 0 && Math.abs(sum - r.kwhTotal) > 0.05;
  });
  if (phaseMismatch.length > 0) {
    issues.push({
      id: 'phase_mismatch',
      count: phaseMismatch.length,
      description: `${phaseMismatch.length} incohérence${phaseMismatch.length > 1 ? 's' : ''} entre phases et total kWh`,
      detail: `kWhA + kWhB + kWhC ≠ kWhTotal (écart > 0.05 kWh)`,
    });
  }

  return issues;
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export function NettoyageTab() {
  const { state, setShellyRows, addFile, updateFile, ensureFileContent, setSelectedFile, setActiveTab } = useIOT();
  const { shellyRows } = state;

  // ---- Source de données ----
  const [localRows, setLocalRows]         = useState<ShellyRow[]>([]);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [localFileId, setLocalFileId]     = useState<string | null>(null);

  // Fallback sur shellyRows du contexte quand pas de données locales
  const hasLocalData = localRows.length > 0;
  const activeRows: ShellyRow[] = hasLocalData ? localRows : shellyRows;

  // Colonnes : les fixes + une par grandeur d'un fichier importé quelconque
  // (PM2.5, tension U1…), portée par la ligne sous la clé « g:<grandeur> »
  const COLUMNS = useMemo<ColDef[]>(() => {
    const cles = new Set<string>();
    for (const r of activeRows.slice(0, 500)) for (const k of Object.keys(r)) if (k.startsWith('g:')) cles.add(k);
    return [
      ...COLONNES_FIXES,
      ...[...cles].map(k => ({ key: k as keyof ShellyRow, label: k.slice(2), type: 'num' as ColType, editable: true, defaultVisible: true, width: 110 })),
    ];
  }, [activeRows]);

  // ---- Moteur de qualité (données chargées depuis Supabase) ----
  // Les lignes venues d'Analyse portent leur périmètre de chargement et
  // l'identifiant de chaque appareil : le diagnostic vient alors de
  // fn_qualite (règles en base), plus de l'analyseur local, et on enregistre
  // une recette au lieu d'une copie. Fichier importé : ancien diagnostic.
  const { organization } = useOrganization();
  const chargementShelly = hasLocalData ? null : state.chargementShelly;
  const modeMoteur = chargementShelly !== null && activeRows.some(r => r.deviceId);
  const [reglesInitiales, setReglesInitiales] = useState<string[] | null>(null);
  const qualite = useQualiteMoteur(activeRows, modeMoteur, reglesInitiales);
  // Mesures de la base : lecture seule (les règles excluent, rien n'est réécrit).
  // Une retouche créerait une copie locale et ferait basculer l'écran en mode fichier.
  const recettesRef = useRef<RecettesPanelHandle>(null);

  const [genericRows, setGenericRows] = useState<Record<string, unknown>[]>([]);
  const [genericFileName, setGenericFileName] = useState<string | null>(null);
  const [genericFileId, setGenericFileId] = useState<string | null>(null);
  const isGenericMode = genericRows.length > 0;

  // setActiveRows écrit toujours dans localRows pour prendre la main sur les données
  const setActiveRows = useCallback((rows: ShellyRow[]) => {
    setLocalRows(rows);
  }, []);

  // ---- Diagnostic ----
  const [issues, setIssues]         = useState<Issue[]>([]);
  const [hasAnalysed, setHasAnalysed] = useState(false);
  const [showGapDates, setShowGapDates] = useState(false);
  const [loadError, setLoadError]   = useState<string | null>(null);

  // Enrichissement automatique : remplir nomAppareil/deviceLocation/deviceRoom depuis Supabase
  // si certaines lignes ont ces champs manquants. Match par nom d'appareil.
  const [enrichedKey, setEnrichedKey] = useState<string>('');
  useEffect(() => {
    if (activeRows.length === 0) return;
    // Clé d'enrichissement basée sur les noms uniques pour éviter de rejouer en boucle
    const names = Array.from(new Set(activeRows.map(r => r.nomAppareil).filter(Boolean) as string[]));
    if (names.length === 0) return;
    const missing = activeRows.some(r => !r.deviceLocation || !r.deviceRoom);
    if (!missing) return;
    const key = names.sort().join('|');
    if (key === enrichedKey) return; // déjà tenté pour ce set de noms
    setEnrichedKey(key);

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('shelly_cl')
        .select('name,site,room')
        .in('name', names)
        .not('site', 'is', null)
        .limit(10000);
      if (cancelled || error || !data) return;

      // Map name → {site, room} (première occurrence non-null gagne)
      const meta = new Map<string, { site?: string; room?: string }>();
      for (const r of data) {
        if (!r.name) continue;
        const cur = meta.get(r.name) ?? {};
        if (!cur.site && r.site) cur.site = r.site;
        if (!cur.room && r.room) cur.room = r.room;
        meta.set(r.name, cur);
      }
      if (meta.size === 0) return;

      const enriched = activeRows.map(r => {
        const m = r.nomAppareil ? meta.get(r.nomAppareil) : undefined;
        if (!m) return r;
        return {
          ...r,
          deviceLocation: r.deviceLocation || m.site,
          deviceRoom:     r.deviceRoom     || m.room,
        };
      });
      // Écrit dans localRows (prend la main sur shellyRows)
      setLocalRows(enriched);
    })();
    return () => { cancelled = true; };
  }, [activeRows, enrichedKey]);

  // Auto-scan à la première apparition de données
  useEffect(() => {
    if (activeRows.length > 0 && !hasAnalysed) {
      try {
        const found = analyserRows(activeRows);
        setIssues(found.map(i => ({ ...i, ignored: false })));
      } catch (e) {
        console.warn('[NettoyageTab] analyserRows error:', e);
      }
      setHasAnalysed(true);
    }
    if (activeRows.length === 0) {
      setHasAnalysed(false);
      setIssues([]);
    }
  }, [activeRows, hasAnalysed]);

  const doRescan = useCallback(() => {
    try {
      const found = analyserRows(activeRows);
      setIssues(found.map(i => ({ ...i, ignored: false })));
    } catch (e) {
      console.warn('[NettoyageTab] doRescan error:', e);
    }
    setShowGapDates(false);
  }, [activeRows]);

  const ignoreIssue = useCallback((id: IssueType) => {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, ignored: true } : i));
  }, []);

  // ---- Transformer — état ----
  const [showTransformer, setShowTransformer] = useState(false);
  const [trCol, setTrCol]   = useState<string>(COLUMNS[2].key as string); // kwhTotal par défaut
  const [trOp, setTrOp]     = useState<string>('round');
  const [trParam, setTrParam] = useState('2');
  const [trScope, setTrScope] = useState<'all' | 'selected'>('all');

  // ---- Tableau — état ----
  const [search, setSearch]           = useState('');
  const [filters, setFilters]         = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig]   = useState<SortConfig | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key as string))
  );
  // Tant que l'utilisateur n'a pas personnalisé manuellement, les colonnes
  // affichées s'adaptent au contenu réel des données chargées : masque les
  // colonnes kWh/Puissance pour un jeu 100% capteurs environnementaux, et
  // inversement masque température/humidité pour un jeu 100% énergie —
  // au lieu de toujours montrer le même gabarit fixe.
  const [colsAutoNettoyage, setColsAutoNettoyage] = useState(true);
  const [showColPicker, setShowColPicker] = useState(false);
  const [page, setPage]               = useState(0);
  const [editCell, setEditCell]       = useState<EditCell | null>(null);
  const [editVal, setEditVal]         = useState('');
  const [undoStack, setUndoStack]     = useState<ShellyRow[][]>([]);
  const [highlightOutliers, setHighlightOutliers] = useState(false);
  const [showFR, setShowFR]           = useState(false);
  const [frFind, setFrFind]           = useState('');
  const [frReplace, setFrReplace]     = useState('');
  const [frCol, setFrCol]             = useState<string>('all');
  const [frCase, setFrCase]           = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  // Colonnes figées à gauche : case à cocher, #, Date, Appareil
  const tableWrapRef = useRef<HTMLDivElement>(null);
  usePinnedColumns(tableWrapRef, 4);
  const sortedRef    = useRef<ShellyRow[]>([]);

  // ---- Colonnes pertinentes selon le contenu réel des données chargées ----
  // (échantillon des 500 premières lignes — suffisant pour détecter si une
  // colonne a de vraies valeurs, évite de scanner tout le dataset à chaque frappe)
  const colsWithData = useMemo(() => {
    const sample = activeRows.slice(0, 500);
    const present = new Set<string>();
    for (const col of COLUMNS) {
      const key = col.key as string;
      if (sample.some(r => {
        const v = r[col.key];
        if (v === undefined || v === null || v === '') return false;
        // Les colonnes énergie sont toujours remplies à 0 par parseShellyRow,
        // même pour un capteur qui ne mesure pas d'énergie : une colonne
        // numérique entièrement à zéro n'est donc pas une vraie donnée.
        if (typeof v === 'number') return v !== 0;
        return true;
      })) {
        present.add(key);
      }
    }
    // La pluie par intervalle est presque toujours à 0 au début d'une série : sans cette règle elle serait
    // masquée alors que le cumul, lui, est affiché.
    if (present.has('precipitation')) present.add('precipitationIncr');
    return present;
  }, [activeRows, COLUMNS]);

  useEffect(() => {
    if (!colsAutoNettoyage || activeRows.length === 0) return;
    const next = new Set<string>();
    for (const col of COLUMNS) {
      const key = col.key as string;
      if (ALWAYS_VISIBLE_COLS.has(key) || colsWithData.has(key)) next.add(key);
    }
    setVisibleCols(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colsWithData, colsAutoNettoyage]);

  // ---- Fichiers importés ----
  const [expandedFileId, setExpandedFileId]     = useState<string | null>(null);
  const [expandedFilePage, setExpandedFilePage] = useState<Record<string, number>>({});

  // ---- Charger fichier importé ----
  const loadFromImported = useCallback((f: import('./shared').ImportedFile) => {
    console.log('[NettoyageTab] loadFromImported', f.name, 'rawData:', f.rawData.length, 'shellyRows:', shellyRows.length);
    // reset other mode
    setGenericRows([]);
    setGenericFileName(null);
    setGenericFileId(null);

    let rows: ShellyRow[] | null = null;
    if (f.rawData.length > 0) {
      try {
        if (f.statut === 'nettoyé') {
          rows = f.rawData.map(r => ({ ...r, date: toDate(r.date) })) as ShellyRow[];
        } else if (f.type === 'autre' && lireFichierImporte(f, state.joursFerier)) {
          // Fichier quelconque : même lecture que dans l'Analyse (choisie à l'import)
          rows = lireFichierImporte(f, state.joursFerier)!.rows.map(r => {
            // Grandeurs à plat (« g:PM2.5 (ug/m³) ») : une colonne chacune dans le tableau
            if (!r.grandeurs) return r;
            const plat: Record<string, number> = {};
            for (const [k, v] of Object.entries(r.grandeurs)) plat[`g:${k}`] = v;
            return { ...r, ...plat };
          });
        }
        const detect = detecterFormatShelly(f.columns);
        console.log('[NettoyageTab] detected format:', detect.format, 'cols:', f.columns.slice(0, 5));
        let parsed: ShellyRow[] = [];
        if (!rows && (detect.format === 'shelly_excel' || detect.format === 'generic')) {
          parsed = f.rawData.map(r => parseShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (!rows && detect.format === 'profil_mi') {
          parsed = f.rawData.map(r => profilMiToShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (!rows && detect.format === 'supabase_cl') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pr = transformRowsToProfilMi(f.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
          parsed = pr.map(r => profilMiToShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (!rows && detect.format === 'supabase_horaire') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pr = transformHoraireToProfilMi(f.rawData as any, COLONNES_PROFIL_SHELLY.map(c => c.key));
          parsed = pr.map(r => profilMiToShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        } else if (!rows && detect.format === 'shelly_section') {
          parsed = parseShellySectionCSV(f.rawData, state.joursFerier);
        }
        // Fallback universel : si le format détecté ne produit rien, retenter avec parseShellyRow
        if (!rows && parsed.length === 0) {
          parsed = f.rawData.map(r => parseShellyRow(r, state.joursFerier)).filter((r): r is ShellyRow => r !== null);
        }
        console.log('[NettoyageTab] parsed rows:', parsed.length);
        if (!rows && parsed.length > 0) rows = parsed;
      } catch (e) {
        console.warn('[NettoyageTab] loadFromImported parse error:', e);
      }
    }
    // Fallback final : données du contexte global (ex. après rechargement de page)
    if (!rows || rows.length === 0) {
      console.log('[NettoyageTab] using shellyRows fallback, count:', shellyRows.length);
      if (shellyRows.length > 0) rows = [...shellyRows];
    }
    if (!rows || rows.length === 0) {
      // Fallback : mode générique (peu importe le format)
      if (f.rawData.length > 0) {
        setLoadError(null);
        setGenericRows(f.rawData);
        setGenericFileName(f.name);
        setGenericFileId(f.id);
        setLocalRows([]);
        setLocalFileName(null);
        setLocalFileId(null);
        return;
      }
      setLoadError(`Impossible de lire les données de "${f.name}".`);
      return;
    }

    setLoadError(null);
    setLocalRows(rows);
    setLocalFileName(f.name);
    setLocalFileId(f.id);
    setGenericRows([]);
    setGenericFileName(null);
    setGenericFileId(null);
    setUndoStack([]);
    setSelectedIndices(new Set());
    setPage(0);
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setHasAnalysed(false);
    setIssues([]);
    setShowGapDates(false);
  }, [shellyRows, state.joursFerier]);

  // Fichier choisi ailleurs (bouton « Nettoyer » de la bibliothèque, ou
  // reprise de session) : le charger ici, une seule fois par sélection et
  // seulement si l'onglet est visible — après « Sauvegarder et stocker »
  // la sélection change mais l'onglet bascule sur Fichiers, on ne recharge pas.
  const handledSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    const { selectedFileId, activeTab, filesLoaded } = state;
    if (!selectedFileId || !filesLoaded) return;
    if (handledSelectionRef.current === selectedFileId) return;
    handledSelectionRef.current = selectedFileId;
    if (activeTab !== 'nettoyage') return;
    if (selectedFileId === localFileId || selectedFileId === genericFileId) return;
    void ensureFileContent(selectedFileId).then(full => { if (full) loadFromImported(full); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedFileId, state.activeTab, state.filesLoaded]);

  // ============================================================
  // UNDO
  // ============================================================
  const pushUndo = useCallback((rows: ShellyRow[]) => {
    setUndoStack(s => [...s.slice(-9), rows]);
  }, []);

  const doUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setActiveRows(prev);
    setSelectedIndices(new Set());
  }, [undoStack, setActiveRows]);

  // ============================================================
  // CORRECTIONS ASSISTÉES
  // ============================================================

  const doFixDuplicatesDay = useCallback((keep: 'first' | 'last') => {
    const sorted = [...activeRows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
    const seen   = new Map<string, ShellyRow>();
    if (keep === 'first') {
      for (const r of sorted) {
        const k = `${toDate(r.date).toISOString().slice(0, 10)}|${deviceKey(r)}`;
        if (!seen.has(k)) seen.set(k, r);
      }
    } else {
      for (const r of sorted) {
        const k = `${toDate(r.date).toISOString().slice(0, 10)}|${deviceKey(r)}`;
        seen.set(k, r);
      }
    }
    pushUndo(activeRows);
    setActiveRows([...seen.values()]);
    ignoreIssue('duplicates_day');
    setSelectedIndices(new Set());
  }, [activeRows, pushUndo, setActiveRows, ignoreIssue]);

  const doFixDuplicatesExact = useCallback(() => {
    const seen   = new Set<string>();
    const unique: ShellyRow[] = [];
    for (const r of [...activeRows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime())) {
      const k = `${toDate(r.date).toISOString()}|${deviceKey(r)}`;
      if (!seen.has(k)) { seen.add(k); unique.push(r); }
    }
    pushUndo(activeRows);
    setActiveRows(unique);
    ignoreIssue('duplicates_exact');
    setSelectedIndices(new Set());
  }, [activeRows, pushUndo, setActiveRows, ignoreIssue]);

  // Données figées : on ne touche jamais au cumul de pluie (la première ligne de la séquence en garde la vraie valeur).
  const doFixFrozen = useCallback((mode: 'delete' | 'blank') => {
    const set = new Set(findFrozenRows(activeRows).rows);
    pushUndo(activeRows);
    if (mode === 'delete') {
      setActiveRows(activeRows.filter(r => !set.has(r)));
    } else {
      setActiveRows(activeRows.map(r => {
        if (!set.has(r)) return r;
        const c: ShellyRow = { ...r, precipitationIncr: 0 };
        for (const k of BLANKABLE_ENV_KEYS) (c as unknown as Record<string, unknown>)[k] = undefined;
        return c;
      }));
    }
    ignoreIssue('frozen');
    setSelectedIndices(new Set());
  }, [activeRows, pushUndo, setActiveRows, ignoreIssue]);

  const doFixNegatives = useCallback((action: 'zero' | 'abs') => {
    pushUndo(activeRows);
    setActiveRows(activeRows.map(r => {
      const upd = { ...r };
      for (const col of NUM_COLS) {
        const v = r[col] as number;
        if (v < 0) (upd as Record<string, unknown>)[col] = action === 'zero' ? 0 : Math.abs(v);
      }
      return upd;
    }));
    ignoreIssue('negatives');
    setSelectedIndices(new Set());
  }, [activeRows, pushUndo, setActiveRows, ignoreIssue]);

  const doRecalcTotal = useCallback(() => {
    pushUndo(activeRows);
    setActiveRows(activeRows.map(r => ({
      ...r,
      kwhTotal: r.kwhA + r.kwhB + r.kwhC,
      kwhNet:   (r.kwhA + r.kwhB + r.kwhC) - r.kwhRetourTotal,
    })));
    ignoreIssue('phase_mismatch');
    setSelectedIndices(new Set());
  }, [activeRows, pushUndo, setActiveRows, ignoreIssue]);

  // ============================================================
  // NETTOYAGE AUTOMATIQUE — uniquement ce qui est sans risque
  // 1. Trim des valeurs texte
  // 2. Doublons exacts (même appareil, même horodatage) → suppression
  // 3. Doublons (jour, appareil) → seulement sur des données JOURNALIÈRES
  //
  // Retiré le 16/10/2026 après essai sur Ma Maison (08→15/10, 1 986 h,
  // 54,34 kWh) : arrondi à 4 décimales (jusqu'à 30 % d'erreur sur des
  // relevés à la minute), négatifs → valeur absolue (une injection devenait
  // de la consommation), aberrants → moyenne (−16 kWh de clim réelle), zéros
  // → report du précédent (consommation inventée), total ← somme des phases
  // (le compteur, exact, remplacé par des puissances moyennes). Et l'étape 3
  // s'appliquait aussi aux données horaires : 54,34 kWh → 1,33 kWh.
  // Plus de sauvegarde automatique : le résultat s'affiche, « Annuler »
  // reste possible, l'utilisateur sauvegarde lui-même.
  // ============================================================
  const [autoCleanReport, setAutoCleanReport] = useState<string[] | null>(null);
  const doAutoClean = useCallback(() => {
    if (activeRows.length === 0) return;
    pushUndo(activeRows);

    const report: string[] = [];
    let rows: ShellyRow[] = [...activeRows];
    const kwhAvant = rows.reduce((s, r) => s + (r.kwhTotal || 0), 0);

    // ── 1. Trim valeurs texte ────────────────────────────────────
    const TEXT_KEYS: (keyof ShellyRow)[] = [
      'nomAppareil', 'deviceLocation', 'deviceRoom',
      'jour', 'mois', 'jourSemaine', 'jourActivites',
      'heuresEnsoleillement', 'heuresTravail',
      'periodeclimatique', 'saison', 'periode', 'profil',
    ];
    let trimmed = 0;
    rows = rows.map(r => {
      const upd = { ...r };
      for (const k of TEXT_KEYS) {
        const v = (r as unknown as Record<string, unknown>)[k];
        if (typeof v === 'string') {
          const t = v.trim();
          if (t !== v) { (upd as Record<string, unknown>)[k] = t; trimmed++; }
        }
      }
      return upd;
    });
    if (trimmed > 0) report.push(`Trim : ${trimmed} valeur${trimmed > 1 ? 's' : ''} texte nettoyée${trimmed > 1 ? 's' : ''}`);

    // ── 2. Doublons exacts (même appareil, même horodatage) ──────
    {
      const seen = new Set<string>();
      const uniq: ShellyRow[] = [];
      const sorted = [...rows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
      for (const r of sorted) {
        const k = `${toDate(r.date).toISOString()}|${deviceKey(r)}`;
        if (!seen.has(k)) { seen.add(k); uniq.push(r); }
      }
      const removed = rows.length - uniq.length;
      if (removed > 0) {
        rows = uniq;
        report.push(`Doublons exacts : ${removed} ligne${removed > 1 ? 's' : ''} supprimée${removed > 1 ? 's' : ''}`);
      }
    }

    // ── 3. Doublons (jour, appareil) — données journalières seulement ─
    if (isSubDaily(rows)) {
      report.push('Doublons par jour : non appliqué — données infra-journalières (plusieurs relevés par jour sont normaux)');
    } else {
      const sorted = [...rows].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
      const byDayDevice = new Map<string, ShellyRow>();
      for (const r of sorted) {
        const k = `${toDate(r.date).toISOString().slice(0, 10)}|${deviceKey(r)}`;
        byDayDevice.set(k, r);
      }
      const removed = rows.length - byDayDevice.size;
      if (removed > 0) {
        rows = [...byDayDevice.values()];
        report.push(`Doublons (date, appareil) : ${removed} ligne${removed > 1 ? 's' : ''} supprimée${removed > 1 ? 's' : ''} (dernière conservée)`);
      }
    }

    const kwhApres = rows.reduce((s, r) => s + (r.kwhTotal || 0), 0);
    const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    report.unshift(`Avant : ${activeRows.length.toLocaleString('fr-FR')} lignes, ${fmt(kwhAvant)} kWh · Après : ${rows.length.toLocaleString('fr-FR')} lignes, ${fmt(kwhApres)} kWh`);
    report.push("Zéros, valeurs aberrantes, négatifs et phases : à examiner au cas par cas ci-dessous — jamais corrigés automatiquement.");

    setActiveRows(rows);
    setSelectedIndices(new Set());
    // Seuls les doublons sont traités : les autres signalements restent affichés
    setIssues(prev => prev.map(i => (i.id === 'duplicates_exact' || i.id === 'duplicates_day') ? { ...i, ignored: true } : i));
    setAutoCleanReport(report);
  }, [activeRows, pushUndo, setActiveRows]);

  // ============================================================
  // OUTILS MANUELS
  // ============================================================

  const doSort = useCallback((key: keyof ShellyRow) => {
    setSortConfig(s => s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
    setPage(0);
    setSelectedIndices(new Set());
  }, []);

  const doSelectRow = useCallback((idx: number) => {
    setSelectedIndices(prev => { const n = new Set(prev); if (n.has(idx)) { n.delete(idx); } else { n.add(idx); } return n; });
  }, []);

  const doSelectAll = useCallback(() => {
    setSelectedIndices(prev => prev.size === sortedRef.current.length ? new Set() : new Set(sortedRef.current.map((_, i) => i)));
  }, []);

  const doDeleteSelected = useCallback(() => {
    if (selectedIndices.size === 0) return;
    const toDelete = new Set([...selectedIndices].map(i => sortedRef.current[i]));
    pushUndo(activeRows);
    setActiveRows(activeRows.filter(r => !toDelete.has(r)));
    setSelectedIndices(new Set());
  }, [selectedIndices, activeRows, pushUndo, setActiveRows]);

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const targetRow = sorted[editCell.filteredIdx];
    if (!targetRow) { setEditCell(null); return; }
    const colDef = COLUMNS.find(c => c.key === editCell.col);
    if (!colDef) { setEditCell(null); return; }
    let newVal: unknown = editVal;
    if (colDef.type === 'num') {
      newVal = parseFloat(editVal);
      if (isNaN(newVal as number)) { setEditCell(null); return; }
    } else if (colDef.type === 'date') {
      const d = new Date(editVal);
      if (isNaN(d.getTime())) { setEditCell(null); return; }
      newVal = d;
    }
    pushUndo(activeRows);
    setActiveRows(activeRows.map(r => r === targetRow ? { ...r, [editCell.col]: newVal } : r));
    setEditCell(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCell, editVal, activeRows, pushUndo, setActiveRows]);

  const frMatchCount = useMemo(() => {
    if (!frFind) return 0;
    const q = frCase ? frFind : frFind.toLowerCase();
    return activeRows.reduce((cnt, row) => {
      const cols = frCol === 'all' ? COLUMNS.map(c => c.key) : [frCol as keyof ShellyRow];
      return cnt + cols.filter(c => {
        const v = frCase ? formatCell(row, c) : formatCell(row, c).toLowerCase();
        return v.includes(q);
      }).length;
    }, 0);
  }, [frFind, frCase, frCol, activeRows, COLUMNS]);

  const doFindReplace = useCallback(() => {
    if (!frFind) return;
    const cols = frCol === 'all'
      ? COLUMNS.filter(c => c.editable).map(c => c.key)
      : [frCol as keyof ShellyRow];
    pushUndo(activeRows);
    setActiveRows(activeRows.map(row => {
      const updated = { ...row };
      for (const col of cols) {
        const v   = formatCell(row, col);
        const found = frCase ? v.includes(frFind) : v.toLowerCase().includes(frFind.toLowerCase());
        if (found) {
          const newVal = frCase
            ? v.split(frFind).join(frReplace)
            : v.replace(new RegExp(frFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), frReplace);
          const colDef = COLUMNS.find(c => c.key === col);
          if (colDef?.type === 'num') {
            const n = parseFloat(newVal);
            if (!isNaN(n)) (updated as Record<string, unknown>)[col] = n;
          } else {
            (updated as Record<string, unknown>)[col] = newVal;
          }
        }
      }
      return updated;
    }));
  }, [frFind, frReplace, frCol, frCase, activeRows, pushUndo, setActiveRows, COLUMNS]);

  // ============================================================
  // TRANSFORMER
  // ============================================================
  const trColDef  = useMemo(() => COLUMNS.find(c => c.key === trCol), [trCol, COLUMNS]);
  const trColType = trColDef?.type ?? 'num';

  const doTransform = useCallback(() => {
    if (!trCol) return;

    // Lignes cibles
    const targetSet: Set<ShellyRow> = trScope === 'selected' && selectedIndices.size > 0
      ? new Set([...selectedIndices].map(i => sortedRef.current[i]).filter(Boolean))
      : new Set(activeRows);

    const p = parseFloat(trParam);

    pushUndo(activeRows);
    setActiveRows(activeRows.map(r => {
      if (!targetSet.has(r)) return r;
      const updated = { ...r };
      const raw = r[trCol as keyof ShellyRow];

      if (trColType === 'num') {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
        if (isNaN(n)) return r;
        const vals = activeRows.map(x => x[trCol as keyof ShellyRow] as number).filter(v => !isNaN(v));
        const mn = Math.min(...vals), mx = Math.max(...vals);
        let result = n;
        switch (trOp as NumOp) {
          case 'round':     result = isNaN(p) ? Math.round(n) : parseFloat(n.toFixed(Math.max(0, Math.round(p)))); break;
          case 'multiply':  result = n * (isNaN(p) ? 1 : p); break;
          case 'add':       result = n + (isNaN(p) ? 0 : p); break;
          case 'clamp_min': result = Math.max(isNaN(p) ? 0 : p, n); break;
          case 'clamp_max': result = Math.min(isNaN(p) ? Infinity : p, n); break;
          case 'abs':       result = Math.abs(n); break;
          case 'zero_neg':  result = n < 0 ? 0 : n; break;
          case 'normalize': result = mx !== mn ? (n - mn) / (mx - mn) : 0; break;
        }
        (updated as Record<string, unknown>)[trCol] = result;
      } else if (trColType === 'text') {
        const s = String(raw ?? '');
        let result = s;
        switch (trOp as TextOp) {
          case 'trim':      result = s.trim(); break;
          case 'uppercase': result = s.toUpperCase(); break;
          case 'lowercase': result = s.toLowerCase(); break;
          case 'dot_comma': result = s.replace(/\./g, ','); break;
          case 'comma_dot': result = s.replace(/,/g, '.'); break;
          case 'replace': {
            const sep = trParam.indexOf('→') >= 0 ? '→' : '->';
            const [from, to] = trParam.split(sep);
            result = from ? s.split(from).join(to ?? '') : s;
            break;
          }
        }
        (updated as Record<string, unknown>)[trCol] = result;
      }
      return updated;
    }));
   
  }, [trCol, trOp, trParam, trScope, trColType, activeRows, selectedIndices, pushUndo, setActiveRows]);

  // Aperçu : nb de lignes qui seront modifiées
  const trPreviewCount = trScope === 'selected' ? selectedIndices.size : activeRows.length;

  const doExport = useCallback(async (format: 'xlsx' | 'csv_semicolon' | 'csv_comma' | 'csv_fr' | 'pdf') => {
    // N'exporter que les colonnes affichées : elles s'adaptent déjà au contenu
    // réel, ce qui évite de sortir toutes les colonnes énergie (vides) pour un
    // jeu de données de capteurs environnementaux.
    const exportedCols = COLUMNS.filter(c => visibleCols.has(c.key as string));
    const data = sortedRef.current.map(r => {
      const obj: Record<string, unknown> = {};
      exportedCols.forEach(c => {
        const v = r[c.key];
        // Conserver l'heure : la formater en date seule écrasait la résolution
        // horaire/minute des relevés Supabase.
        obj[c.label] = c.type === 'date' && v instanceof Date
          ? v.toLocaleString('fr-FR')
          : v;
      });
      return obj;
    });
    if (format === 'xlsx') {
      await exportJsonToXlsx(data, 'Données nettoyées', 'iot_donnees_nettoyees.xlsx');
    } else if (format === 'pdf') {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(11);
      doc.setTextColor(30, 40, 80);
      doc.text('IOT — Données nettoyées', 14, 12);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(`Exporté le ${new Date().toLocaleDateString('fr-FR')} · ${data.length.toLocaleString('fr-FR')} lignes`, 14, 18);
      autoTable(doc, {
        head: [COLUMNS.map(c => c.label)],
        body: data.map(row => COLUMNS.map(c => String(row[c.label] ?? ''))),
        startY: 22,
        styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'ellipsize' },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        margin: { left: 10, right: 10 },
      });
      doc.save('iot_donnees_nettoyees.pdf');
    } else {
      // csv_fr : séparateur ; + virgule décimale (format Excel FR)
      const sep     = format === 'csv_comma' ? ',' : ';';
      const frDec   = format === 'csv_fr';
      const headers = COLUMNS.map(c => c.label).join(sep);
      const rows    = data.map(row => COLUMNS.map(c => {
        let v = String(row[c.label] ?? '');
        if (frDec && c.type === 'num') v = v.replace('.', ',');
        return v.includes(sep) || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(sep));
      const csv  = '\uFEFF' + [headers, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'iot_donnees_nettoyees.csv'; a.click();
      URL.revokeObjectURL(url);
    }
  // sortedRef est une ref (toujours à jour) ; visibleCols doit en revanche être
  // une dépendance, sinon l'export reste figé sur les colonnes du premier rendu.
   
  }, [visibleCols, COLUMNS]);

  // ============================================================
  // DONNÉES DÉRIVÉES
  // ============================================================

  const kwhStats = useMemo(() => computeStats(activeRows.map(r => r.kwhNet)), [activeRows]);
  const outlierThreshold = kwhStats.mean + OUTLIER_SIGMA * kwhStats.std;

  const filtered = useMemo(() => {
    let rows = activeRows;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => COLUMNS.some(c => formatCell(r, c.key).toLowerCase().includes(q)));
    }
    if (filters.dateFrom) { const from = new Date(filters.dateFrom); rows = rows.filter(r => r.date >= from); }
    if (filters.dateTo)   { const to   = new Date(filters.dateTo); to.setHours(23,59,59); rows = rows.filter(r => r.date <= to); }
    if (filters.typeJour.length > 0) rows = rows.filter(r => filters.typeJour.includes(r.jourActivites));
    if (filters.kwhMin !== '') rows = rows.filter(r => r.kwhNet >= parseFloat(filters.kwhMin));
    if (filters.kwhMax !== '') rows = rows.filter(r => r.kwhNet <= parseFloat(filters.kwhMax));
    return rows;
  }, [activeRows, search, filters, COLUMNS]);

  const sorted = useMemo(() => {
    const result = !sortConfig ? filtered : [...filtered].sort((a, b) => {
      const va = a[sortConfig.key], vb = b[sortConfig.key];
      let cmp = 0;
      if (va instanceof Date && vb instanceof Date) cmp = va.getTime() - vb.getTime();
      else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortConfig.dir === 'asc' ? cmp : -cmp;
    });
    sortedRef.current = result;
    return result;
  }, [filtered, sortConfig]);

  const totalPages   = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage     = Math.min(page, totalPages - 1);
  const paged        = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const allPageSelected = paged.length > 0 && paged.every((_, i) => selectedIndices.has(safePage * PAGE_SIZE + i));

  const activeIssues = issues.filter(i => !i.ignored);
  const nbProblems   = activeIssues.length;

  // ============================================================
  // PANNEAU FICHIERS IMPORTÉS
  // ============================================================

  const fichiersPannel = state.files.length > 0 && (
    <div className="space-y-2">
      <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
        <FileSpreadsheet className="h-4 w-4 text-blue-400" />
        Fichiers importés ({state.files.length})
      </h3>
      {state.files.map(f => {
        const isExp  = expandedFileId === f.id;
        const pg     = expandedFilePage[f.id] ?? 0;
        // Contenu pas encore téléchargé : on montre l'aperçu (10 lignes) en attendant
        const viewRows = f.contentLoaded ? f.rawData : f.preview;
        const totalPg = Math.ceil(viewRows.length / FILE_PAGE_SIZE);
        const pageRows = viewRows.slice(pg * FILE_PAGE_SIZE, (pg + 1) * FILE_PAGE_SIZE);
        return (
          <div key={f.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <FileSpreadsheet className="h-4 w-4 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{f.name}</p>
                <div className="flex items-center flex-wrap gap-2 mt-0.5">
                  <Badge variant="outline" className="text-xs border-white/20 text-slate-300 h-5">
                    {f.type === 'shelly' ? 'Shelly 3EM' : 'Autre'}
                  </Badge>
                  <span className="text-slate-500 text-xs">{f.rowCount.toLocaleString('fr-FR')} lignes · {f.columns.length} col.</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm"
                  className={`h-7 text-xs gap-1 ${
                    (localFileName === f.name || genericFileName === f.name)
                      ? 'bg-green-600/30 text-green-300 border border-green-500/30'
                      : 'bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30'
                  }`}
                  onClick={() => {
                    if (localFileName === f.name || genericFileName === f.name) {
                      setLocalRows([]); setLocalFileName(null); setLocalFileId(null);
                      setGenericRows([]); setGenericFileName(null); setGenericFileId(null);
                    } else {
                      void ensureFileContent(f.id).then(full => { if (full) loadFromImported(full); });
                    }
                  }}
                >
                  {(localFileName === f.name || genericFileName === f.name) ? 'Décharger' : 'Procéder au Nettoyage'}
                </Button>
                <Button size="sm" variant="ghost"
                  className={`h-7 gap-1.5 text-xs ${isExp ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  onClick={() => {
                    setExpandedFileId(isExp ? null : f.id);
                    setExpandedFilePage(p => ({ ...p, [f.id]: 0 }));
                    if (!isExp && !f.contentLoaded) void ensureFileContent(f.id);
                  }}
                >
                  {isExp ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {isExp ? 'Masquer' : 'Voir'}
                </Button>
              </div>
            </div>

            {isExp && viewRows.length > 0 && (
              <>
                <div className="overflow-auto border-t border-white/10" style={{ maxHeight: '40vh' }}>
                  <table className="min-w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1a1d2e' }}>
                      <tr>
                        <th className="w-10 px-2 py-1.5 text-slate-600 text-right border-b border-r border-white/10 font-normal select-none bg-white/5">#</th>
                        {f.columns.map(col => {
                          const ct = detectColType(col, viewRows);
                          return (
                            <th key={col} className="px-3 py-1.5 text-left border-b border-r border-white/10 whitespace-nowrap font-medium bg-white/5">
                              <div className="flex items-center gap-1">{COL_TYPE_ICON[ct]}<span className={COL_TYPE_COLOR[ct]}>{col}</span></div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, ri) => (
                        <tr key={ri} className={`hover:bg-blue-500/5 ${ri % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                          <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 select-none font-mono text-[0.625rem]">{pg * FILE_PAGE_SIZE + ri + 1}</td>
                          {f.columns.map(col => {
                            const val = String(row[col] ?? '');
                            const ct  = detectColType(col, viewRows);
                            return (
                              <td key={col} className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[200px] truncate ${ct === 'number' ? 'text-right font-mono text-emerald-300/80' : ct === 'date' ? 'text-blue-300/80' : 'text-slate-400'}`} title={val.length > 30 ? val : undefined}>{val}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between px-4 py-2 border-t border-white/10">
                  <span className="text-slate-500 text-xs">{pg * FILE_PAGE_SIZE + 1}–{Math.min((pg + 1) * FILE_PAGE_SIZE, viewRows.length)} / {f.rowCount.toLocaleString('fr-FR')} lignes{!f.contentLoaded && ' · aperçu'}</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={pg === 0} onClick={() => setExpandedFilePage(p => ({ ...p, [f.id]: pg - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={pg >= totalPg - 1} onClick={() => setExpandedFilePage(p => ({ ...p, [f.id]: pg + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  // ============================================================
  // ÉTAT VIDE
  // ============================================================

  if (activeRows.length === 0 && !isGenericMode) {
    return (
      <div className="space-y-4">
        {loadError && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 text-sm font-medium">Échec du chargement</p>
              <p className="text-red-400/80 text-xs mt-0.5">{loadError}</p>
            </div>
            <button onClick={() => setLoadError(null)} className="text-red-500/60 hover:text-red-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <RecettesPanel
          organizationId={organization?.id ?? null}
          chargement={null}
          reglesExclues={new Set()}
          version={null}
          joursFerier={state.joursFerier}
          onOuvrir={(rows, ch, regles) => { setReglesInitiales(regles); setShellyRows(rows, ch); }}
        />
        {fichiersPannel || (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <Eraser className="h-16 w-16 opacity-20 mb-4" />
            <p className="text-lg font-medium">Aucune donnée à nettoyer</p>
            <p className="text-sm mt-1">Importez d'abord un fichier dans l'onglet <strong className="text-slate-400">Upload</strong></p>
          </div>
        )}
      </div>
    );
  }

  // Mode générique (n'importe quel fichier)
  if (isGenericMode && genericFileName) {
    return (
      <GenericNettoyage
        initialRows={genericRows}
        fileName={genericFileName}
        onSave={(cleanedRows) => {
          const serialized = cleanedRows.map(r => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(r)) {
              out[k] = v instanceof Date ? v.toISOString() : v;
            }
            return out;
          });
          const columns = serialized.length > 0 ? Object.keys(serialized[0]) : [];
          const preview = serialized.slice(0, 10);
          const sourceFile = genericFileId ? state.files.find(f => f.id === genericFileId) : null;
          const fallbackName = sourceFile ? sourceFile.name.replace(/\.(csv|xlsx|xls)$/i, '') : genericFileName;
          const identiteRows: IdentiteRow[] = serialized.map(r => ({
            deviceLocation: pickStr(r, ['Emplacement', 'Site', 'site', 'deviceLocation']),
            deviceRoom:     pickStr(r, ['Piece', 'Pièce', 'room', 'Room', 'deviceRoom']),
            nomAppareil:    pickStr(r, ['Appareil', 'Nom', 'name', 'nomAppareil']),
          }));
          const cleanedName = buildCleanedFileName(identiteRows, fallbackName);
          const existingCleaned = sourceFile
            ? state.files.find(f => f.parentId === sourceFile.id && f.statut === 'nettoyé')
            : null;
          const cleanedId = existingCleaned?.id ?? crypto.randomUUID();

          if (existingCleaned) {
            updateFile(existingCleaned.id, {
              name: cleanedName,
              rowCount: serialized.length,
              columns,
              preview,
              rawData: serialized,
              statut: 'nettoyé',
              uploadedAt: new Date(),
            });
          } else {
            addFile({
              id: cleanedId,
              name: cleanedName,
              type: sourceFile?.type ?? 'autre',
              uploadedAt: new Date(),
              rowCount: serialized.length,
              columns,
              preview,
              rawData: serialized,
              statut: 'nettoyé',
              taille: sourceFile?.taille,
              parentId: sourceFile?.id,
            });
          }

          setSelectedFile(cleanedId);
          setGenericRows([]);
          setGenericFileName(null);
          setGenericFileId(null);
          setActiveTab('fichiers');
        }}
      />
    );
  }

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================

  return (
    <div className="space-y-4">

      {/* ---- Fichiers importés ---- */}
      {fichiersPannel}

      {/* ---- Bannière mode fichier local ---- */}
      {/* Barre de sauvegarde : disponible dès qu'il y a des données à l'écran,
          y compris celles arrivées depuis l'onglet Analyse via le contexte
          (auparavant conditionnée à un import local, ce qui privait de toute
          sauvegarde un jeu de données déjà propre venu d'Analyse). */}
      {activeRows.length > 0 && (
        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-green-300 text-sm font-medium">Nettoyage : {modeMoteur && chargementShelly ? nomChargement(chargementShelly) : (localFileName ?? 'Données importées')}</span>
            <Badge className="bg-green-600/20 text-green-300 border-0 text-xs">{activeRows.length.toLocaleString('fr-FR')} lignes</Badge>
          </div>
          <div className="flex items-center gap-2">
            {modeMoteur && <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white"
              title="Enregistre le site, la période et les règles appliquées, visible par toute l'organisation"
              onClick={() => recettesRef.current?.enregistrer()}>
              Enregistrer et stocker
            </Button>}
            {!modeMoteur && <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-500 text-white"
              onClick={() => {
                // 1. Recalculer kwhNet et cumuls sur les lignes nettoyées
                const rowsRecalculees = ajouterCumulatifs(
                  activeRows.map(r => ({
                    ...r,
                    kwhNet: Math.max(0, r.kwhTotal - r.kwhRetourTotal),
                  }))
                );
                // 2. Sérialiser pour le stockage fichier
                const serializedRows = rowsRecalculees.map(r => ({
                  ...r,
                  date: r.date instanceof Date ? r.date.toISOString() : r.date,
                })) as unknown as Record<string, unknown>[];
                const columns = serializedRows.length > 0 ? Object.keys(serializedRows[0]) : [];
                const preview = serializedRows.slice(0, 10);
                const sourceFile = localFileId ? state.files.find(f => f.id === localFileId) : null;
                const fallbackName = sourceFile ? sourceFile.name.replace(/\.(csv|xlsx|xls)$/i, '') : (localFileName ?? 'données');
                const cleanedName = buildCleanedFileName(rowsRecalculees, fallbackName);
                const existingCleaned = sourceFile
                  ? state.files.find(f => f.parentId === sourceFile.id && f.statut === 'nettoyé')
                  : null;
                const cleanedId = existingCleaned?.id ?? crypto.randomUUID();

                if (existingCleaned) {
                  updateFile(existingCleaned.id, {
                    name: cleanedName,
                    rowCount: rowsRecalculees.length,
                    columns,
                    preview,
                    rawData: serializedRows,
                    statut: 'nettoyé',
                    uploadedAt: new Date(),
                  });
                } else {
                  addFile({
                    id: cleanedId,
                    name: cleanedName,
                    type: sourceFile?.type ?? 'shelly',
                    uploadedAt: new Date(),
                    rowCount: rowsRecalculees.length,
                    columns,
                    preview,
                    rawData: serializedRows,
                    statut: 'nettoyé',
                    taille: sourceFile?.taille,
                    parentId: sourceFile?.id,
                  });
                }

                setShellyRows(rowsRecalculees);
                setSelectedFile(cleanedId);
                setLocalRows([]);
                setLocalFileName(null);
                setLocalFileId(null);
                setActiveTab('fichiers'); // rediriger vers la bibliothèque après sauvegarde
              }}>
              Sauvegarder et stocker
            </Button>}
            <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-white"
              onClick={() => {
                setLocalRows([]); setLocalFileName(null); setLocalFileId(null);
                // Données venues d'Analyse (contexte) : les vider aussi, sinon le
                // bouton n'aurait aucun effet visible et la barre resterait affichée.
                if (!hasLocalData) setShellyRows([]);
              }}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION DIAGNOSTIC — moteur de qualité, ou assistant (fichiers) */}
      {/* ============================================================ */}
      {modeMoteur ? (
        <>
          <QualiteMoteurPanel q={qualite} nbLignes={activeRows.length} />
          <RecettesPanel
            ref={recettesRef}
            organizationId={organization?.id ?? null}
            chargement={chargementShelly}
            reglesExclues={qualite.exclues}
            version={qualite.version}
            joursFerier={state.joursFerier}
            onOuvrir={(rows, ch, regles) => { setReglesInitiales(regles); setShellyRows(rows, ch); }}
          />
        </>
      ) : (
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* En-tête diagnostic */}
        <div className={`flex items-center justify-between px-4 py-3 ${nbProblems > 0 ? 'bg-amber-500/10 border-b border-amber-500/20' : hasAnalysed ? 'bg-green-500/10 border-b border-green-500/20' : 'bg-white/5 border-b border-white/10'}`}>
          <div className="flex items-center gap-2">
            {nbProblems > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            ) : hasAnalysed ? (
              <CheckCircle2 className="h-5 w-5 text-green-400" />
            ) : (
              <ScanLine className="h-5 w-5 text-slate-400" />
            )}
            <span className={`font-semibold text-sm ${nbProblems > 0 ? 'text-amber-300' : hasAnalysed ? 'text-green-300' : 'text-white'}`}>
              {!hasAnalysed
                ? 'Analyse en cours…'
                : nbProblems > 0
                  ? `${nbProblems} problème${nbProblems > 1 ? 's' : ''} détecté${nbProblems > 1 ? 's' : ''}`
                  : 'Aucun problème détecté — données propres'}
            </span>
            {hasAnalysed && (
              <span className="text-slate-500 text-xs">
                · {activeRows.length.toLocaleString('fr-FR')} lignes analysées
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasAnalysed && nbProblems > 0 && (
              <Button size="sm"
                className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white gap-1"
                onClick={doAutoClean}>
                <Wand2 className="h-3.5 w-3.5" /> Nettoyage auto
              </Button>
            )}
            <Button size="sm" variant="ghost"
              className="h-7 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1"
              onClick={doRescan}>
              <ScanLine className="h-3.5 w-3.5" /> Re-scanner
            </Button>
          </div>
        </div>

        {/* Rapport du dernier nettoyage automatique */}
        {autoCleanReport && (
          <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/20">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-slate-300">
                <p className="font-medium text-blue-300 mb-1">Nettoyage automatique effectué :</p>
                <ul className="space-y-0.5 list-disc list-inside text-slate-400">
                  {autoCleanReport.map((line, i) => (<li key={i}>{line}</li>))}
                </ul>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-white"
                onClick={() => setAutoCleanReport(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Cartes de problèmes */}
        {nbProblems > 0 && (
          <div className="divide-y divide-white/5">

            {/* Doublons par jour */}
            {activeIssues.find(i => i.id === 'duplicates_day') && (() => {
              const iss = activeIssues.find(i => i.id === 'duplicates_day')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Copy className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('duplicates_day')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <span className="text-slate-500 text-xs">Conserver :</span>
                    <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                      onClick={() => doFixDuplicatesDay('first')}>
                      <CheckSquare className="h-3.5 w-3.5 mr-1" /> La première occurrence
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30"
                      onClick={() => doFixDuplicatesDay('last')}>
                      <CheckSquare className="h-3.5 w-3.5 mr-1" /> La dernière occurrence
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('duplicates_day')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Doublons exacts */}
            {activeIssues.find(i => i.id === 'duplicates_exact') && (() => {
              const iss = activeIssues.find(i => i.id === 'duplicates_exact')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Copy className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('duplicates_exact')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                      onClick={doFixDuplicatesExact}>
                      <Scissors className="h-3.5 w-3.5 mr-1" /> Supprimer les copies exactes
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('duplicates_exact')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Données figées */}
            {activeIssues.find(i => i.id === 'frozen') && (() => {
              const iss = activeIssues.find(i => i.id === 'frozen')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Copy className="h-4 w-4 text-sky-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-sky-500/20 text-sky-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                      <p className="text-slate-500 text-xs ml-6 mt-0.5">Le cumul de pluie n'est jamais modifié : la première ligne de chaque séquence garde la vraie valeur.</p>
                    </div>
                    <button onClick={() => ignoreIssue('frozen')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                      onClick={() => doFixFrozen('delete')}>
                      <Scissors className="h-3.5 w-3.5 mr-1" /> Supprimer les relectures
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30"
                      onClick={() => doFixFrozen('blank')}>
                      <Eraser className="h-3.5 w-3.5 mr-1" /> Vider les valeurs (garder l'heure)
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('frozen')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Lignes vides */}
            {activeIssues.find(i => i.id === 'zeros') && (() => {
              const iss = activeIssues.find(i => i.id === 'zeros')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Square className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-slate-500/20 text-slate-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('zeros')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  {/* Plus de remplissage (moyenne, report, interpolation) : sur des
                      données horaires multi-appareils il inventait de la consommation
                      — +26 à +35 kWh sur 54 kWh réels à Ma Maison (08→15/10). */}
                  <p className="text-slate-400 text-xs mt-2 ml-6">
                    Un 0 sur un départ veut dire « appareil éteint » ; sur le compteur d'arrivée, il signale plutôt une coupure.
                    Ces valeurs sont réelles : on ne les remplace pas.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2 ml-6">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('zeros')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Outliers */}
            {activeIssues.find(i => i.id === 'outliers') && (() => {
              const iss = activeIssues.find(i => i.id === 'outliers')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="h-4 w-4 text-orange-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-orange-500/20 text-orange-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('outliers')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  {/* Plus de suppression ni de remplacement : le seuil est commun à
                      tous les appareils, il désignait la clim ou le chauffe-eau en
                      marche (−17 kWh de vraie consommation à Ma Maison, 08→15/10). */}
                  <p className="text-slate-400 text-xs mt-2 ml-6">
                    Seuil commun à tous les appareils : un appareil puissant en marche normale (clim, chauffe-eau) le dépasse.
                    À vérifier dans le tableau, sans supprimer ni remplacer.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-orange-600/20 hover:bg-orange-600/40 text-orange-300 border border-orange-500/30"
                      onClick={() => setHighlightOutliers(true)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Mettre en évidence dans le tableau
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('outliers')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Valeurs négatives */}
            {activeIssues.find(i => i.id === 'negatives') && (() => {
              const iss = activeIssues.find(i => i.id === 'negatives')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowDown className="h-4 w-4 text-red-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-red-500/20 text-red-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('negatives')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30"
                      onClick={() => doFixNegatives('zero')}>
                      → Mettre à zéro
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30"
                      onClick={() => doFixNegatives('abs')}>
                      → Valeur absolue
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('negatives')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Trous temporels */}
            {activeIssues.find(i => i.id === 'gaps') && (() => {
              const iss = activeIssues.find(i => i.id === 'gaps')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <GitBranch className="h-4 w-4 text-yellow-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-yellow-500/20 text-yellow-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                      {showGapDates && iss.gapDates && (
                        <div className="mt-3 ml-6 flex flex-wrap gap-1.5">
                          {iss.gapDates.slice(0, 30).map((d, i) => (
                            <Badge key={i} className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 text-[0.625rem]">
                              {d.toLocaleDateString('fr-FR')}
                            </Badge>
                          ))}
                          {iss.gapDates.length > 30 && <Badge className="bg-yellow-500/10 text-yellow-400 border-0">+{iss.gapDates.length - 30}</Badge>}
                        </div>
                      )}
                    </div>
                    <button onClick={() => ignoreIssue('gaps')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <span className="text-slate-500 text-xs">Les trous ne peuvent pas être comblés automatiquement (données manquantes).</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-yellow-400 hover:text-yellow-300"
                      onClick={() => setShowGapDates(v => !v)}>
                      {showGapDates ? 'Masquer les dates' : 'Voir les dates manquantes'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('gaps')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}

            {/* Incohérence phases */}
            {activeIssues.find(i => i.id === 'phase_mismatch') && (() => {
              const iss = activeIssues.find(i => i.id === 'phase_mismatch')!;
              return (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-purple-400 shrink-0" />
                        <span className="text-white text-sm font-medium">{iss.description}</span>
                        <Badge className="bg-purple-500/20 text-purple-300 border-0 text-[0.625rem]">{iss.count}</Badge>
                      </div>
                      {iss.detail && <p className="text-slate-400 text-xs ml-6">{iss.detail}</p>}
                    </div>
                    <button onClick={() => ignoreIssue('phase_mismatch')} className="text-slate-600 hover:text-slate-400 shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-6">
                    <Button size="sm" className="h-7 text-xs bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30"
                      onClick={doRecalcTotal}>
                      → Recalculer kWh Total depuis les phases
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 hover:text-white"
                      onClick={() => ignoreIssue('phase_mismatch')}>Ignorer</Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Données propres */}
        {hasAnalysed && nbProblems === 0 && (
          <div className="px-4 py-3 text-slate-400 text-sm">
            Toutes les vérifications ont passé. Utilisez les outils ci-dessous pour explorer ou exporter vos données.
          </div>
        )}
      </div>
      )}

      {/* ============================================================ */}
      {/* BARRE D'OUTILS MANUELLE                                       */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-center gap-2 bg-white/5 rounded-xl border border-white/10 p-3">
        {/* Recherche */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Rechercher dans toutes les colonnes…"
            className="pl-8 bg-white/5 border-white/20 text-white text-sm h-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
              <Eraser className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button size="sm" variant={showFilters ? 'default' : 'outline'}
          className={`h-8 border-white/20 ${showFilters ? 'bg-blue-600 text-white' : 'text-white hover:bg-white/10'}`}
          onClick={() => setShowFilters(v => !v)}>
          <Filter className="h-3.5 w-3.5 mr-1" /> Filtres
          {(filters.typeJour.length + (filters.dateFrom ? 1 : 0) + (filters.kwhMin || filters.kwhMax ? 1 : 0)) > 0 && (
            <Badge className="ml-1 h-4 min-w-4 text-[0.625rem] bg-white/20 border-0 px-1">
              {filters.typeJour.length + (filters.dateFrom ? 1 : 0) + (filters.kwhMin || filters.kwhMax ? 1 : 0)}
            </Badge>
          )}
        </Button>

        <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10"
          onClick={() => setShowColPicker(v => !v)}>
          <Columns className="h-3.5 w-3.5 mr-1" /> Colonnes
        </Button>

        <div className="flex items-center gap-1.5">
          <Switch id="outliers" checked={highlightOutliers} onCheckedChange={setHighlightOutliers} className="data-[state=checked]:bg-orange-500 h-4 w-7" />
          <Label htmlFor="outliers" className="text-slate-400 text-xs cursor-pointer whitespace-nowrap">Aberrantes</Label>
        </div>

        {!modeMoteur && <>
        <div className="w-px h-6 bg-white/10" />

        <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10"
          onClick={() => setShowFR(v => !v)}>
          <Replace className="h-3.5 w-3.5 mr-1" /> Remplacer
        </Button>

        <Button size="sm"
          variant={showTransformer ? 'default' : 'outline'}
          className={`h-8 border-white/20 ${showTransformer ? 'bg-violet-600 text-white' : 'text-white hover:bg-white/10'}`}
          onClick={() => setShowTransformer(v => !v)}>
          <Wand2 className="h-3.5 w-3.5 mr-1" /> Transformer
        </Button>

        {selectedIndices.size > 0 && (
          <Button size="sm" variant="destructive"
            className="h-8 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30"
            onClick={doDeleteSelected}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer ({selectedIndices.size})
          </Button>
        )}

        <Button size="sm" variant="ghost"
          className="h-8 text-slate-400 hover:text-white hover:bg-white/10"
          disabled={undoStack.length === 0}
          onClick={doUndo}
          title={`Annuler (${undoStack.length} action${undoStack.length > 1 ? 's' : ''})`}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Annuler
          {undoStack.length > 0 && <Badge className="ml-1 h-4 text-[0.625rem] bg-white/10 border-0 px-1">{undoStack.length}</Badge>}
        </Button>
        </>}

        {/* Export ▾ */}
        <div className="relative group ml-auto">
          <Button size="sm" variant="outline" className="h-8 border-white/20 text-white hover:bg-white/10">
            <Download className="h-3.5 w-3.5 mr-1" /> Export ▾
          </Button>
          <div className="absolute top-full right-0 mt-1 w-56 bg-[#1a1d2e] border border-white/20 rounded-xl shadow-xl z-20 hidden group-hover:block">
            <button onClick={() => doExport('xlsx')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 rounded-t-xl">
              <FileSpreadsheet className="h-4 w-4 text-green-400" /> Excel (.xlsx)
            </button>
            <button onClick={() => doExport('csv_semicolon')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2">
              <Hash className="h-4 w-4 text-blue-400" /> CSV séparateur ; (standard)
            </button>
            <button onClick={() => doExport('csv_comma')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2">
              <Hash className="h-4 w-4 text-slate-400" /> CSV séparateur ,
            </button>
            <button onClick={() => doExport('csv_fr')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2">
              <Hash className="h-4 w-4 text-amber-400" /> CSV français (; + virgule déc.)
            </button>
            <button onClick={() => doExport('pdf')} className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2 rounded-b-xl">
              <FileText className="h-4 w-4 text-red-400" /> PDF paginé
            </button>
          </div>
        </div>
      </div>

      {/* ---- Panneau Filtres ---- */}
      {showFilters && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Date de</Label>
            <Input type="date" value={filters.dateFrom} onChange={e => { setFilters(f => ({ ...f, dateFrom: e.target.value })); setPage(0); }} className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Date à</Label>
            <Input type="date" value={filters.dateTo} onChange={e => { setFilters(f => ({ ...f, dateTo: e.target.value })); setPage(0); }} className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">kWh Net min</Label>
            <Input type="number" value={filters.kwhMin} onChange={e => { setFilters(f => ({ ...f, kwhMin: e.target.value })); setPage(0); }} placeholder="0" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">kWh Net max</Label>
            <Input type="number" value={filters.kwhMax} onChange={e => { setFilters(f => ({ ...f, kwhMax: e.target.value })); setPage(0); }} placeholder="∞" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Type de jour</Label>
            <div className="flex flex-col gap-1">
              {['Jour ouvré', 'Weekend', 'Jour férié'].map(v => (
                <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={filters.typeJour.includes(v)} onChange={e => { setFilters(f => ({ ...f, typeJour: e.target.checked ? [...f.typeJour, v] : f.typeJour.filter(x => x !== v) })); setPage(0); }} className="accent-blue-500" />
                  <span className="text-slate-300">{v}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex items-end">
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white text-xs"
              onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); }}>
              Réinitialiser les filtres
            </Button>
          </div>
        </div>
      )}

      {/* ---- Sélecteur de colonnes ---- */}
      {showColPicker && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="text-white text-sm font-medium">Colonnes visibles</h4>
              <Badge className={colsAutoNettoyage ? 'bg-green-600/20 text-green-300 border-0 text-xs' : 'bg-white/10 text-slate-300 border-0 text-xs'}>
                {colsAutoNettoyage ? 'Adapté automatiquement' : 'Personnalisé'}
              </Badge>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setColsAutoNettoyage(false); setVisibleCols(new Set(COLUMNS.map(c => c.key as string))); }} className="text-xs text-blue-400 hover:text-blue-300">Tout afficher</button>
              <button onClick={() => setColsAutoNettoyage(true)} className="text-xs text-slate-400 hover:text-slate-300">Adapter aux données</button>
            </div>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {COLUMNS.map(col => (
              <label key={col.key as string} className="flex items-center gap-2 text-xs cursor-pointer">
               <input type="checkbox" checked={visibleCols.has(col.key as string)} onChange={e => { setColsAutoNettoyage(false); setVisibleCols(prev => { const n = new Set(prev); if (e.target.checked) { n.add(col.key as string); } else { n.delete(col.key as string); } return n; }); }} className="accent-blue-500" />
                <span className="text-slate-300">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ---- Trouver & Remplacer ---- */}
      {showFR && !modeMoteur && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-36">
            <Label className="text-slate-400 text-xs mb-1 block">Rechercher</Label>
            <Input value={frFind} onChange={e => setFrFind(e.target.value)} placeholder="Valeur à trouver…" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div className="flex-1 min-w-36">
            <Label className="text-slate-400 text-xs mb-1 block">Remplacer par</Label>
            <Input value={frReplace} onChange={e => setFrReplace(e.target.value)} placeholder="Nouvelle valeur…" className="bg-white/5 border-white/20 text-white text-sm h-8" />
          </div>
          <div className="min-w-44">
            <Label className="text-slate-400 text-xs mb-1 block">Dans la colonne</Label>
            <select value={frCol} onChange={e => setFrCol(e.target.value)} className="w-full h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2">
              <option value="all">Toutes les colonnes</option>
              {COLUMNS.filter(c => c.editable).map(c => <option key={c.key as string} value={c.key as string}>{c.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="frCase" checked={frCase} onChange={e => setFrCase(e.target.checked)} className="accent-blue-500" />
            <Label htmlFor="frCase" className="text-slate-400 text-xs cursor-pointer">Casse exacte</Label>
          </div>
          <div className="flex items-center gap-2">
            {frMatchCount > 0 && <span className="text-blue-400 text-xs">{frMatchCount} occurrence{frMatchCount > 1 ? 's' : ''}</span>}
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white h-8" onClick={doFindReplace} disabled={!frFind}>
              <Replace className="h-3.5 w-3.5 mr-1" /> Remplacer tout
            </Button>
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-8" onClick={() => setShowFR(false)}>
              <Eraser className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ---- Panneau Transformer ---- */}
      {showTransformer && !modeMoteur && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-400" />
            <h4 className="text-white font-medium text-sm">Transformer une colonne</h4>
            <span className="text-slate-500 text-xs">— modifier les valeurs en masse</span>
          </div>

          {/* Ligne 1 : colonne + portée */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-slate-400 text-xs mb-1 block">Colonne</Label>
              <select
                value={trCol}
                onChange={e => { setTrCol(e.target.value); setTrOp(COLUMNS.find(c => c.key === e.target.value)?.type === 'text' ? 'trim' : 'round'); }}
                className="h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2 min-w-[160px]"
              >
                {COLUMNS.filter(c => c.editable).map(c => (
                  <option key={c.key as string} value={c.key as string}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-slate-400 text-xs mb-1 block">Appliquer à</Label>
              <div className="flex rounded-lg overflow-hidden border border-white/20 h-8">
                {(['all', 'selected'] as const).map(s => (
                  <button key={s} onClick={() => setTrScope(s)}
                    className={`px-3 text-xs font-medium transition-colors ${trScope === s ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}>
                    {s === 'all' ? 'Toutes les lignes' : `Sélection (${selectedIndices.size})`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ligne 2 : opérations selon type de colonne */}
          {trColType === 'num' ? (
            <div className="space-y-3">
              <div>
                <Label className="text-slate-400 text-xs mb-2 block">Opération numérique</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'round',     label: 'Arrondir',         hasParam: true,  placeholder: 'déc.' },
                    { id: 'multiply',  label: '× Facteur',        hasParam: true,  placeholder: 'ex: 0.001' },
                    { id: 'add',       label: '+ Constante',      hasParam: true,  placeholder: 'ex: 100' },
                    { id: 'clamp_min', label: 'Min (≥)',           hasParam: true,  placeholder: 'ex: 0' },
                    { id: 'clamp_max', label: 'Max (≤)',           hasParam: true,  placeholder: 'ex: 100' },
                    { id: 'abs',       label: 'Valeur absolue',   hasParam: false, placeholder: '' },
                    { id: 'zero_neg',  label: 'Négatifs → 0',    hasParam: false, placeholder: '' },
                    { id: 'normalize', label: 'Normaliser (0-1)', hasParam: false, placeholder: '' },
                  ] as { id: NumOp; label: string; hasParam: boolean; placeholder: string }[]).map(op => (
                    <button key={op.id} onClick={() => setTrOp(op.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${trOp === op.id ? 'bg-violet-600/40 border-violet-500/60 text-violet-200' : 'bg-white/5 border-white/15 text-slate-400 hover:text-white hover:bg-white/10'}`}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Paramètre si besoin */}
              {['round', 'multiply', 'add', 'clamp_min', 'clamp_max'].includes(trOp) && (
                <div className="flex items-center gap-3">
                  <Label className="text-slate-400 text-xs">Paramètre</Label>
                  <Input type="number" value={trParam} onChange={e => setTrParam(e.target.value)}
                    placeholder={trOp === 'round' ? 'décimales (ex: 3)' : trOp === 'multiply' ? 'facteur (ex: 0.001)' : 'valeur'}
                    className="w-44 h-8 bg-white/5 border-white/20 text-white text-sm" />
                  {trOp === 'round' && <span className="text-slate-500 text-xs">Ex: 2 → 3.14159 devient 3.14</span>}
                  {trOp === 'multiply' && <span className="text-slate-500 text-xs">Ex: 0.001 → Wh en kWh</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-slate-400 text-xs mb-2 block">Opération texte</Label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'trim',      label: 'Supprimer espaces',   hasParam: false },
                    { id: 'uppercase', label: 'MAJUSCULE',            hasParam: false },
                    { id: 'lowercase', label: 'minuscule',            hasParam: false },
                    { id: 'dot_comma', label: '. → , (déc. FR)',      hasParam: false },
                    { id: 'comma_dot', label: ', → . (déc. INT)',     hasParam: false },
                    { id: 'replace',   label: 'Remplacer A → B',      hasParam: true  },
                  ] as { id: TextOp; label: string; hasParam: boolean }[]).map(op => (
                    <button key={op.id} onClick={() => setTrOp(op.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${trOp === op.id ? 'bg-violet-600/40 border-violet-500/60 text-violet-200' : 'bg-white/5 border-white/15 text-slate-400 hover:text-white hover:bg-white/10'}`}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
              {trOp === 'replace' && (
                <div className="flex items-center gap-3">
                  <Label className="text-slate-400 text-xs">Remplacer</Label>
                  <Input value={trParam} onChange={e => setTrParam(e.target.value)}
                    placeholder="Ancien → Nouveau  (ex: foo→bar)"
                    className="w-64 h-8 bg-white/5 border-white/20 text-white text-sm" />
                  <span className="text-slate-500 text-xs">Utilisez → comme séparateur</span>
                </div>
              )}
            </div>
          )}

          {/* Aperçu + Appliquer */}
          <div className="flex items-center gap-3 pt-1 border-t border-white/10">
            <span className="text-slate-400 text-xs">
              → Appliqué sur{' '}
              <span className="text-violet-300 font-medium">{trPreviewCount.toLocaleString('fr-FR')} ligne{trPreviewCount > 1 ? 's' : ''}</span>
              {' '}· colonne <span className="text-violet-300 font-medium">{trColDef?.label ?? trCol}</span>
            </span>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-500 text-white h-8 ml-auto" onClick={doTransform}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> Appliquer
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TABLEAU PRINCIPAL                                             */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* Barre de stats */}
        <div className="flex flex-wrap gap-3 px-4 py-2 border-b border-white/10 bg-white/[0.02] text-xs">
          <span className="text-slate-400">Total <span className="text-white font-bold">{activeRows.length.toLocaleString('fr-FR')}</span></span>
          {sorted.length < activeRows.length && <span className="text-slate-400">Filtrés <span className="text-blue-400 font-bold">{sorted.length.toLocaleString('fr-FR')}</span></span>}
          {selectedIndices.size > 0 && <span className="text-slate-400">Sélectionnés <span className="text-blue-400 font-bold">{selectedIndices.size}</span></span>}
          <span className="ml-auto text-slate-500">kWh Net — moy:{kwhStats.mean.toFixed(2)} · σ:{kwhStats.std.toFixed(2)} · min:{kwhStats.min.toFixed(2)} · max:{kwhStats.max.toFixed(2)}</span>
        </div>

        <div ref={tableWrapRef} className="overflow-auto" style={{ maxHeight: '62vh' }}>
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#131520' }}>
              <tr>
                <th className="w-8 px-2 py-2 border-b border-r border-white/10 bg-white/5">
                  <input type="checkbox" checked={allPageSelected} onChange={doSelectAll} className="accent-blue-500 cursor-pointer" />
                </th>
                <th className="w-10 px-2 py-2 text-slate-600 border-b border-r border-white/10 bg-white/5 text-right font-normal select-none">#</th>
                {COLUMNS.filter(c => visibleCols.has(c.key as string)).map(col => {
                  const isSort = sortConfig?.key === col.key;
                  return (
                    <th key={col.key as string} onClick={() => doSort(col.key)}
                      className="px-3 py-2 text-left border-b border-r border-white/10 bg-white/5 cursor-pointer hover:bg-white/10 transition-colors select-none whitespace-nowrap"
                      style={{ minWidth: col.width }}>
                      <div className="flex items-center gap-1">
                        <span className={isSort ? 'text-blue-300 font-semibold' : 'text-slate-300 font-medium'}>{col.label}</span>
                        {isSort
                          ? sortConfig.dir === 'asc' ? <ArrowUp className="h-3 w-3 text-blue-400" /> : <ArrowDown className="h-3 w-3 text-blue-400" />
                          : <ArrowUpDown className="h-3 w-3 text-slate-600" />}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, pageIdx) => {
                const sortedIdx  = safePage * PAGE_SIZE + pageIdx;
                const isSelected = selectedIndices.has(sortedIdx);
                const isOutlier  = highlightOutliers && row.kwhNet > outlierThreshold;
                const exclusion  = modeMoteur ? qualite.exclusions.parLigne.get(row) : undefined;
                return (
                  <tr key={sortedIdx}
                    title={exclusion ? `Exclue des calculs : ${exclusion.join(', ')}` : undefined}
                    className={`border-t border-white/5 transition-colors ${exclusion ? 'line-through opacity-50' : ''} ${isSelected ? 'bg-blue-600/15' : isOutlier ? 'bg-orange-500/10' : pageIdx % 2 === 0 ? '' : 'bg-white/[0.015]'} hover:bg-white/5`}>
                    <td className="px-2 py-1 border-r border-white/5 text-center">
                      <input type="checkbox" checked={isSelected} onChange={() => doSelectRow(sortedIdx)} className="accent-blue-500 cursor-pointer" />
                    </td>
                    <td className="px-2 py-1 text-slate-600 text-right border-r border-white/5 font-mono text-[0.625rem] select-none">{sortedIdx + 1}</td>
                    {COLUMNS.filter(c => visibleCols.has(c.key as string)).map(col => {
                      const isEditing     = editCell?.filteredIdx === sortedIdx && editCell?.col === col.key;
                      const isOutlierCell = highlightOutliers && col.key === 'kwhNet' && row.kwhNet > outlierThreshold;
                      const displayVal    = formatCell(row, col.key);
                      const enumOpts      = ENUM_OPTIONS[col.key];

                      if (isEditing) {
                        return (
                          <td key={col.key as string} className="px-0 py-0 border-r border-blue-400">
                            {enumOpts ? (
                              <select autoFocus value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                                className="w-full h-full px-2 py-1 bg-blue-900/50 border-0 text-white text-xs focus:outline-none">
                                {enumOpts.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input ref={editInputRef} autoFocus
                                type={col.type === 'num' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                                value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
                                className="w-full px-2 py-1 bg-blue-900/50 border-0 text-white text-xs focus:outline-none" style={{ minWidth: col.width }} />
                            )}
                          </td>
                        );
                      }

                      return (
                        <td key={col.key as string}
                          className={`px-3 py-1 border-r border-white/5 whitespace-nowrap max-w-[200px] truncate
                            ${col.type === 'num' ? 'text-right font-mono' : ''}
                            ${col.key === 'kwhNet'            ? 'text-cyan-300/80'   :
                              col.key === 'kwhTotal'          ? 'text-blue-300/80'   :
                              col.key === 'kwhRetourTotal'    ? 'text-purple-300/80' :
                              col.key === 'puissKwTotal'      ? 'text-green-300/80'  :
                              col.key === 'date'              ? 'text-slate-200'     :
                              col.type === 'num'              ? 'text-slate-300/70'  : 'text-slate-400'}
                            ${isOutlierCell ? '!text-orange-400 font-bold' : ''}
                            ${col.editable && !modeMoteur ? 'cursor-pointer hover:bg-white/5' : ''}`}
                          onDoubleClick={() => {
                            if (!col.editable || modeMoteur) return;
                            setEditCell({ filteredIdx: sortedIdx, col: col.key });
                            setEditVal(rawValue(row, col.key));
                          }}
                          title={col.editable && !modeMoteur ? 'Double-clic pour modifier' : undefined}>
                          {col.key === 'jourActivites' ? (
                            <span className={`text-[0.625rem] px-1.5 py-0.5 rounded ${row.jourActivites === 'Jour férié' ? 'bg-purple-500/20 text-purple-300' : row.jourActivites === 'Weekend' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-blue-500/15 text-blue-300'}`}>{displayVal}</span>
                          ) : col.key === 'profil' ? (
                            <Badge className={`border-0 text-[0.625rem] py-0 ${row.profil === 'CHARGE' ? 'bg-blue-500/15 text-blue-300' : 'bg-orange-500/15 text-orange-300'}`}>{displayVal}</Badge>
                          ) : displayVal}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {paged.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.size + 3} className="px-4 py-12 text-center text-slate-500">
                    Aucune ligne ne correspond aux filtres appliqués
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/[0.02]">
          <span className="text-slate-500 text-xs">
            {sorted.length === 0 ? 'Aucune ligne' : `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} sur ${sorted.length.toLocaleString('fr-FR')}`}
            {sorted.length < activeRows.length && <span className="text-blue-400/70 ml-1">({activeRows.length.toLocaleString('fr-FR')} au total)</span>}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs">Page {safePage + 1}/{totalPages}</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={safePage === 0} onClick={() => setPage(0)}><ChevronLeft className="h-3.5 w-3.5" /><ChevronLeft className="h-3.5 w-3.5 -ml-2" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-white" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}><ChevronRight className="h-3.5 w-3.5" /><ChevronRight className="h-3.5 w-3.5 -ml-2" /></Button>
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <span>{modeMoteur
          ? 'Mesures en lecture seule : les règles qualité excluent sans rien modifier. Copie modifiable : Export ▾'
          : 'Double-clic sur une cellule éditable pour la modifier'}</span>
        {highlightOutliers && <span className="text-orange-400">● Aberrantes : kWh Net &gt; {outlierThreshold.toFixed(2)}</span>}
      </div>
    </div>
  );
}
