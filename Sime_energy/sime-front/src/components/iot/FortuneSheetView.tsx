import { useMemo } from 'react';
import { Workbook } from '@fortune-sheet/react';
import type { Sheet, CellWithRowAndCol } from '@fortune-sheet/core';
import '@fortune-sheet/react/dist/index.css';
import type { ShellyRow } from './shared';

// ─────────────────────────────────────────────────────────────
// Column definitions — maps ShellyRow fields → spreadsheet cols
// ─────────────────────────────────────────────────────────────

interface ColDef {
  label: string;
  width: number;
  isNum: boolean;
  getter: (r: ShellyRow) => string | number;
}

const COLUMNS: ColDef[] = [
  { label: 'Date',             width: 90,  isNum: false, getter: r => r.date.toLocaleDateString('fr-FR') },
  { label: 'Année',            width: 55,  isNum: true,  getter: r => r.annee },
  { label: 'Mois',             width: 55,  isNum: false, getter: r => r.mois },
  { label: 'Jour',             width: 50,  isNum: false, getter: r => r.jourSemaine },
  { label: 'Type de jour',     width: 100, isNum: false, getter: r => r.jourActivites },
  { label: 'Saison',           width: 70,  isNum: false, getter: r => r.saison },
  { label: 'Tranche horaire',  width: 110, isNum: false, getter: r => r.trancheTarification },
  { label: 'Période climat.',  width: 120, isNum: false, getter: r => r.periodeclimatique },
  { label: 'Profil',           width: 65,  isNum: false, getter: r => r.profil },
  { label: 'kWh Total',        width: 80,  isNum: true,  getter: r => r.kwhTotal },
  { label: 'kWh Net',          width: 80,  isNum: true,  getter: r => r.kwhNet },
  { label: 'kWh Phase A',      width: 80,  isNum: true,  getter: r => r.kwhA },
  { label: 'kWh Phase B',      width: 80,  isNum: true,  getter: r => r.kwhB },
  { label: 'kWh Phase C',      width: 80,  isNum: true,  getter: r => r.kwhC },
  { label: 'kWh Retour',       width: 80,  isNum: true,  getter: r => r.kwhRetourTotal },
  { label: 'Puissance (kW)',   width: 95,  isNum: true,  getter: r => r.puissKwTotal },
  { label: 'Montant (FCFA)',   width: 95,  isNum: true,  getter: r => r.montantEnergie },
];

const MAX_ROWS = 5_000;

// ── Column letter helper (A, B, ... Z, AA, AB …) ────────────
function colLetter(index: number): string {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

// ── Build a FortuneSheet Sheet from ShellyRow[] ──────────────
function buildSheet(rows: ShellyRow[]): Sheet {
  const display = rows.slice(0, MAX_ROWS);
  const celldata: CellWithRowAndCol[] = [];

  // ── Header row (row 0) ─────────────────────────────────────
  COLUMNS.forEach(({ label, isNum }, c) => {
    celldata.push({
      r: 0, c,
      v: {
        v: label, m: label,
        ct: { fa: 'General', t: 's' },
        bl: 1,          // bold
        bg: '#217346',  // Excel green
        fc: '#FFFFFF',  // white text
        ht: isNum ? 3 : 1, // 3=right, 1=left
      },
    });
  });

  // ── Data rows ──────────────────────────────────────────────
  display.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? '#FFFFFF' : '#F0F7FF';
    COLUMNS.forEach(({ getter, isNum }, c) => {
      const raw = getter(row);
      const isNumber = typeof raw === 'number';
      celldata.push({
        r: ri + 1, c,
        v: {
          v: raw,
          m: isNumber
            ? (raw as number).toLocaleString('fr-FR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 3,
              })
            : String(raw),
          ct: { fa: isNumber ? '0.000' : 'General', t: isNumber ? 'n' : 's' },
          bg,
          ht: isNumber ? 3 : 1,
        },
      });
    });
  });

  // ── Grand Total row ────────────────────────────────────────
  const totalRowIdx = display.length + 1;
  COLUMNS.forEach(({ isNum }, c) => {
    if (c === 0) {
      celldata.push({
        r: totalRowIdx, c,
        v: { v: 'TOTAL', m: 'TOTAL', ct: { fa: 'General', t: 's' }, bl: 1, bg: '#2E75B6', fc: '#FFFFFF', ht: 1 },
      });
    } else if (isNum && display.length > 0) {
      const letter = colLetter(c);
      celldata.push({
        r: totalRowIdx, c,
        v: {
          f: `=SUM(${letter}2:${letter}${display.length + 1})`,
          ct: { fa: '0.00', t: 'n' },
          bl: 1,
          bg: '#2E75B6',
          fc: '#FFFFFF',
          ht: 3,
        },
      });
    } else {
      celldata.push({
        r: totalRowIdx, c,
        v: { v: '', m: '', bg: '#2E75B6' },
      });
    }
  });

  const columnlen = COLUMNS.reduce<Record<string, number>>((acc, { width }, i) => {
    acc[String(i)] = width;
    return acc;
  }, {});

  return {
    name: 'Données',
    id: 'sheet_shelly',
    celldata,
    row: totalRowIdx + 2,
    column: COLUMNS.length,
    config: { columnlen },
    defaultRowHeight: 22,
  };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function FortuneSheetView({ rows }: { rows: ShellyRow[] }) {
  const sheets = useMemo<Sheet[]>(() => [buildSheet(rows)], [rows]);
  const truncated = rows.length > MAX_ROWS;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <svg viewBox="0 0 48 48" className="w-12 h-12 opacity-20">
          <rect x="4" y="4" width="40" height="40" rx="2" fill="none" stroke="#888" strokeWidth="2"/>
          <line x1="4"  y1="16" x2="44" y2="16" stroke="#888" strokeWidth="1.5"/>
          <line x1="4"  y1="28" x2="44" y2="28" stroke="#888" strokeWidth="1.5"/>
          <line x1="16" y1="4"  x2="16" y2="44" stroke="#888" strokeWidth="1.5"/>
          <line x1="28" y1="4"  x2="28" y2="44" stroke="#888" strokeWidth="1.5"/>
        </svg>
        <p className="text-sm font-medium">Pas de données</p>
        <p className="text-xs">Importez un fichier via l'onglet <strong className="text-slate-300">Upload</strong></p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10 shadow-xl">
      {truncated && (
        <div className="bg-yellow-500/20 border-b border-yellow-500/40 px-4 py-2 text-xs text-yellow-300 flex items-center gap-2">
          <span>⚠</span>
          <span>
            Affichage limité à <strong>{MAX_ROWS.toLocaleString('fr-FR')}</strong> lignes
            sur <strong>{rows.length.toLocaleString('fr-FR')}</strong> —
            utilisez les filtres Fériés/WE pour réduire le jeu de données.
          </span>
        </div>
      )}
      <div style={{ width: '100%', height: 620 }}>
        <Workbook
          data={sheets}
          showToolbar={true}
          showFormulaBar={true}
          showSheetTabs={true}
          defaultRowHeight={22}
          onChange={() => {/* controlled — ignore edits */}}
        />
      </div>
    </div>
  );
}
