import { useState, useMemo } from 'react';
import { X, Plus, Search, Download, Settings2 } from 'lucide-react';
import { exportAoaToXlsx } from '@/lib/excel-utils';
import { Button } from '@/components/ui/button';
import type { ShellyRow } from './shared';
import { MOIS_FR, JOURS_SEMAINE } from './shared';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type AggFn =
  | 'sum' | 'count' | 'average' | 'max' | 'min'
  | 'product' | 'countNums' | 'stdev' | 'stdevp' | 'var' | 'varp';

interface FieldDef {
  key: string;
  label: string;
  type: 'dimension' | 'measure';
}

interface ValueConfig {
  id: string;
  field: string;
  aggFn: AggFn;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DIMENSION_FIELDS: FieldDef[] = [
  { key: 'annee',               label: 'Année',                type: 'dimension' },
  { key: 'mois',                label: 'Mois',                 type: 'dimension' },
  { key: 'jourSemaine',         label: 'Jour de semaine',      type: 'dimension' },
  { key: 'jourActivites',       label: 'Type de jour',         type: 'dimension' },
  { key: 'saison',              label: 'Saison',               type: 'dimension' },
  { key: 'trancheTarification', label: 'Tranche horaire',      type: 'dimension' },
  { key: 'periodeclimatique',   label: 'Période climatique',   type: 'dimension' },
  { key: 'heuresEnsoleillement',label: 'Ensoleillement',       type: 'dimension' },
  { key: 'heuresTravail',       label: 'Heures travail',       type: 'dimension' },
  { key: 'profil',              label: 'Profil charge',        type: 'dimension' },
  { key: 'periode',             label: 'Période jour',         type: 'dimension' },
];

const MEASURE_FIELDS: FieldDef[] = [
  { key: 'kwhTotal',             label: 'kWh Total',              type: 'measure' },
  { key: 'kwhNet',               label: 'kWh Net',                type: 'measure' },
  { key: 'kwhA',                 label: 'kWh Phase A',            type: 'measure' },
  { key: 'kwhB',                 label: 'kWh Phase B',            type: 'measure' },
  { key: 'kwhC',                 label: 'kWh Phase C',            type: 'measure' },
  { key: 'kwhRetourTotal',       label: 'kWh Retour',             type: 'measure' },
  { key: 'puissKwTotal',         label: 'Puissance moy (kW)',     type: 'measure' },
  { key: 'montantEnergie',       label: 'Montant énergie (FCFA)', type: 'measure' },
  { key: 'montantEnergieRetour', label: 'Montant retour (FCFA)',  type: 'measure' },
];

const ALL_FIELDS: FieldDef[] = [...DIMENSION_FIELDS, ...MEASURE_FIELDS];

// 11 Excel aggregation functions
const AGG_FUNCTIONS: { key: AggFn; label: string; prefix: string }[] = [
  { key: 'sum',       label: 'Somme',      prefix: 'Somme de' },
  { key: 'count',     label: 'Nombre',     prefix: 'Nombre de' },
  { key: 'average',   label: 'Moyenne',    prefix: 'Moyenne de' },
  { key: 'max',       label: 'Max',        prefix: 'Max de' },
  { key: 'min',       label: 'Min',        prefix: 'Min de' },
  { key: 'product',   label: 'Produit',    prefix: 'Produit de' },
  { key: 'countNums', label: 'NbVal',      prefix: 'NbVal de' },
  { key: 'stdev',     label: 'EcartType',  prefix: 'EcartType de' },
  { key: 'stdevp',    label: 'EcartTypeP', prefix: 'EcartTypeP de' },
  { key: 'var',       label: 'Var',        prefix: 'Var de' },
  { key: 'varp',      label: 'VarP',       prefix: 'VarP de' },
];

const ORDERED_VALUES: Record<string, string[]> = {
  mois:                MOIS_FR,
  jourSemaine:         JOURS_SEMAINE,
  jour:                ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
  jourActivites:       ['Jour ouvré', 'Weekend', 'Jour férié'],
  saison:              ['Sèche', 'Hivernage'],
  trancheTarification: ['Heure creuse', 'Heure de pointe'],
  periodeclimatique:   ['Période de fraîcheur', 'Période chaude'],
  heuresEnsoleillement:['En ensoleillement', 'Hors ensoleillement'],
  heuresTravail:       ["Heures d'activités", 'Heures hors activités'],
  profil:              ['CHARGE', 'SOUTIRAGE'],
  periode:             ['Nuit', 'Matin', 'Après-midi', 'Soir'],
};

// ─────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────

function computeAgg(values: number[], fn: AggFn): number | null {
  const valid = values.filter(v => !isNaN(v) && isFinite(v));
  if (valid.length === 0) return null;
  switch (fn) {
    case 'sum':       return valid.reduce((s, v) => s + v, 0);
    case 'count':     return values.length;
    case 'average':   return valid.reduce((s, v) => s + v, 0) / valid.length;
    case 'max':       return Math.max(...valid);
    case 'min':       return Math.min(...valid);
    case 'product':   return valid.reduce((p, v) => p * v, 1);
    case 'countNums': return valid.length;
    case 'stdev': {
      if (valid.length < 2) return 0;
      const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
      return Math.sqrt(valid.reduce((s, v) => s + (v - avg) ** 2, 0) / (valid.length - 1));
    }
    case 'stdevp': {
      const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
      return Math.sqrt(valid.reduce((s, v) => s + (v - avg) ** 2, 0) / valid.length);
    }
    case 'var': {
      if (valid.length < 2) return 0;
      const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
      return valid.reduce((s, v) => s + (v - avg) ** 2, 0) / (valid.length - 1);
    }
    case 'varp': {
      const avg = valid.reduce((s, v) => s + v, 0) / valid.length;
      return valid.reduce((s, v) => s + (v - avg) ** 2, 0) / valid.length;
    }
    default: return null;
  }
}

function getFieldVal(row: ShellyRow, key: string): string | number {
  return (row as unknown as Record<string, string | number>)[key] ?? '';
}

function sortLabels(labels: string[], fieldKey: string): string[] {
  const order = ORDERED_VALUES[fieldKey];
  if (order) {
    return [...labels].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  if (labels.every(l => !isNaN(Number(l)))) {
    return [...labels].sort((a, b) => Number(a) - Number(b));
  }
  return [...labels].sort((a, b) => a.localeCompare(b, 'fr'));
}

function fmtVal(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '';
  if (Number.isInteger(v)) return v.toLocaleString('fr-FR');
  return v.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

let _idCounter = 0;
function uid(): string { return `vc_${++_idCounter}`; }

function fldLabel(key: string): string {
  return ALL_FIELDS.find(f => f.key === key)?.label ?? key;
}

function vcLabel(vc: ValueConfig): string {
  const agg = AGG_FUNCTIONS.find(a => a.key === vc.aggFn);
  const fld = ALL_FIELDS.find(f => f.key === vc.field);
  return `${agg?.label ?? vc.aggFn} de ${fld?.label ?? vc.field}`;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function DropZone({
  title, titleBg, children,
}: {
  title: string;
  titleBg: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-[#D0D0D0] overflow-hidden">
      <div className="px-2 py-1" style={{ backgroundColor: titleBg }}>
        <span className="text-white text-[10px] font-bold uppercase tracking-wide">{title}</span>
      </div>
      <div className="bg-[#FAFAFA] p-1.5 space-y-1">{children}</div>
    </div>
  );
}

function FieldChip({ label, bg, onRemove }: { label: string; bg: string; onRemove: () => void }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-white font-medium"
      style={{ backgroundColor: bg }}
    >
      <span className="flex-1 truncate">{label}</span>
      <button onClick={onRemove} className="hover:opacity-70 shrink-0">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ValueChip({
  vc, onRemove, onAggChange,
}: {
  vc: ValueConfig;
  onRemove: () => void;
  onAggChange: (fn: AggFn) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#217346] bg-[#E2EFDA] rounded overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-0.5">
        <span className="text-[11px] text-[#1F4E79] font-semibold flex-1 truncate">{vcLabel(vc)}</span>
        <button
          className="text-[#217346] hover:text-[#145730] p-0.5 shrink-0"
          onClick={() => setOpen(v => !v)}
          title="Paramètres du champ de valeur"
        >
          <Settings2 className="h-3 w-3" />
        </button>
        <button onClick={onRemove} className="text-red-500 hover:text-red-700 p-0.5 shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Settings panel — résumer les valeurs par (Excel-style) */}
      {open && (
        <div className="border-t border-[#C6EFCE] px-2 py-2 bg-white">
          <p className="text-[10px] text-[#595959] mb-1.5 font-semibold">Résumer les valeurs par :</p>
          <div className="grid grid-cols-2 gap-0.5">
            {AGG_FUNCTIONS.map(fn => (
              <button
                key={fn.key}
                className={`text-[10px] px-2 py-1 rounded text-left leading-none transition-colors
                  ${vc.aggFn === fn.key
                    ? 'bg-[#217346] text-white font-bold'
                    : 'hover:bg-[#E2EFDA] text-[#1F1F1F]'
                  }`}
                onClick={() => { onAggChange(fn.key); setOpen(false); }}
              >
                {fn.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AddBtn({
  label, fields, onAdd,
}: {
  label: string;
  fields: FieldDef[];
  onAdd: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (fields.length === 0) return null;
  return (
    <div className="relative">
      <button
        className="flex items-center gap-1 text-[10px] text-[#595959] hover:text-[#1F1F1F] w-full px-1 py-0.5 rounded hover:bg-[#E5E5E5]"
        onClick={() => setOpen(v => !v)}
      >
        <Plus className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 top-full mt-0.5 bg-white border border-[#C8C8C8] shadow-lg rounded min-w-[160px] max-h-48 overflow-y-auto">
            {fields.map(f => (
              <button
                key={f.key}
                className="block w-full text-left px-3 py-1.5 text-xs text-[#1F1F1F] hover:bg-[#E5E5E5]"
                onClick={() => { onAdd(f.key); setOpen(false); }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function ExcelPivotTable({ rows }: { rows: ShellyRow[] }) {
  const [search,       setSearch]       = useState('');
  const [rowFields,    setRowFields]    = useState<string[]>(['mois']);
  const [colField,     setColField]     = useState<string | null>(null);
  const [filterField,  setFilterField]  = useState<string | null>(null);
  const [filterValue,  setFilterValue]  = useState<string | null>(null);
  const [valueConfigs, setValueConfigs] = useState<ValueConfig[]>([
    { id: uid(), field: 'kwhTotal', aggFn: 'sum' },
  ]);

  // Which dimension keys are already assigned
  const usedDimKeys = new Set([
    ...rowFields,
    ...(colField ? [colField] : []),
    ...(filterField ? [filterField] : []),
  ]);

  // Filtered field list for search
  const filteredFields = ALL_FIELDS.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.key.toLowerCase().includes(search.toLowerCase())
  );

  // Filter values for the selected filter field
  const filterValues = useMemo(() => {
    if (!filterField) return [];
    const vals = [...new Set(rows.map(r => String(getFieldVal(r, filterField))))];
    return sortLabels(vals, filterField);
  }, [rows, filterField]);

  // ── Pivot computation ──────────────────────────────────────
  const pivot = useMemo(() => {
    if (!rows.length || !rowFields.length || !valueConfigs.length) return null;

    // Apply filter
    const fr = filterField && filterValue
      ? rows.filter(r => String(getFieldVal(r, filterField)) === filterValue)
      : rows;

    const rf1 = rowFields[0];
    const rf2 = rowFields[1] ?? null;
    const cf  = colField;

    const lvl1 = sortLabels([...new Set(fr.map(r => String(getFieldVal(r, rf1))))], rf1);
    const cols = cf
      ? sortLabels([...new Set(fr.map(r => String(getFieldVal(r, cf))))], cf)
      : ['(Total)'];

    function rowCells(subset: ShellyRow[]): {
      byCols: Record<string, Record<string, number | null>>;
      rowTotals: Record<string, number | null>;
    } {
      const byCols: Record<string, Record<string, number | null>> = {};
      for (const col of cols) {
        const colSubset = cf
          ? subset.filter(r => String(getFieldVal(r, cf)) === col)
          : subset;
        byCols[col] = {};
        for (const vc of valueConfigs) {
          const vals = colSubset.map(r => Number(getFieldVal(r, vc.field)));
          byCols[col][vc.id] = computeAgg(vals, vc.aggFn);
        }
      }
      const rowTotals: Record<string, number | null> = {};
      for (const vc of valueConfigs) {
        const vals = subset.map(r => Number(getFieldVal(r, vc.field)));
        rowTotals[vc.id] = computeAgg(vals, vc.aggFn);
      }
      return { byCols, rowTotals };
    }

    type PivotRow = {
      kind: 'data' | 'subtotal';
      label: string;
      isNested: boolean;
      byCols: Record<string, Record<string, number | null>>;
      rowTotals: Record<string, number | null>;
    };

    const pivotRows: PivotRow[] = [];

    for (const l1 of lvl1) {
      const l1rows = fr.filter(r => String(getFieldVal(r, rf1)) === l1);

      if (rf2) {
        const lvl2 = sortLabels([...new Set(l1rows.map(r => String(getFieldVal(r, rf2))))], rf2);
        for (const l2 of lvl2) {
          const l2rows = l1rows.filter(r => String(getFieldVal(r, rf2)) === l2);
          pivotRows.push({
            kind: 'data',
            label: `${l1} › ${l2}`,
            isNested: true,
            ...rowCells(l2rows),
          });
        }
        pivotRows.push({
          kind: 'subtotal',
          label: `Total ${l1}`,
          isNested: false,
          ...rowCells(l1rows),
        });
      } else {
        pivotRows.push({
          kind: 'data',
          label: l1,
          isNested: false,
          ...rowCells(l1rows),
        });
      }
    }

    const { byCols: grandCols, rowTotals: grandTotals } = rowCells(fr);
    return { pivotRows, cols, grandCols, grandTotals };
  }, [rows, rowFields, colField, filterField, filterValue, valueConfigs]);

  // ── Handlers ──────────────────────────────────────────────
  const addRow    = (key: string) => { if (!rowFields.includes(key) && rowFields.length < 2) setRowFields([...rowFields, key]); };
  const removeRow = (key: string) => setRowFields(rowFields.filter(f => f !== key));
  const setCol    = (key: string | null) => setColField(key);
  const setFilter = (key: string | null) => { setFilterField(key); setFilterValue(null); };
  const addValue  = (key: string) => setValueConfigs([...valueConfigs, { id: uid(), field: key, aggFn: 'sum' }]);
  const rmValue   = (id: string) => setValueConfigs(valueConfigs.filter(v => v.id !== id));
  const updAgg    = (id: string, fn: AggFn) => setValueConfigs(valueConfigs.map(v => v.id === id ? { ...v, aggFn: fn } : v));

  // ── Excel export ──────────────────────────────────────────
  const exportExcel = async () => {
    if (!pivot) return;
    const rows2D: (string | number | null)[][] = [];
    const hdr: (string | number | null)[] = ['Étiquettes de lignes'];
    const hasMultiCol = pivot.cols.length > 1 || pivot.cols[0] !== '(Total)';
    for (const col of pivot.cols) {
      for (const vc of valueConfigs) {
        const agg = AGG_FUNCTIONS.find(a => a.key === vc.aggFn);
        const fld = ALL_FIELDS.find(f => f.key === vc.field);
        hdr.push(hasMultiCol
          ? `${col} – ${agg?.prefix} ${fld?.label}`
          : `${agg?.prefix} ${fld?.label}`);
      }
    }
    hdr.push('Total général');
    rows2D.push(hdr);

    for (const pr of pivot.pivotRows) {
      const row: (string | number | null)[] = [pr.label];
      for (const col of pivot.cols) {
        for (const vc of valueConfigs) row.push(pr.byCols[col]?.[vc.id] ?? null);
      }
      for (const vc of valueConfigs) row.push(pr.rowTotals[vc.id] ?? null);
      rows2D.push(row);
    }

    const gtRow: (string | number | null)[] = ['Total général'];
    for (const col of pivot.cols) {
      for (const vc of valueConfigs) gtRow.push(pivot.grandCols[col]?.[vc.id] ?? null);
    }
    for (const vc of valueConfigs) gtRow.push(pivot.grandTotals[vc.id] ?? null);
    rows2D.push(gtRow);

    await exportAoaToXlsx(rows2D, 'TCD', 'tcd_export.xlsx');
  };

  const cols = pivot?.cols ?? [];
  const showColHeader = colField !== null;

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="flex rounded-xl overflow-hidden border border-white/15 shadow-2xl" style={{ minHeight: 480 }}>

      {/* ════════════════════ PIVOT TABLE (LEFT) ════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">

        {/* Excel-style green top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0" style={{ backgroundColor: '#217346' }}>
          <div className="flex items-center gap-2">
            {/* Excel grid icon */}
            <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0">
              <rect x="1" y="1" width="14" height="14" rx="1.5" fill="none" stroke="white" strokeWidth="1.5"/>
              <line x1="1" y1="6"  x2="15" y2="6"  stroke="white" strokeWidth="1"/>
              <line x1="1" y1="11" x2="15" y2="11" stroke="white" strokeWidth="1"/>
              <line x1="6" y1="1"  x2="6"  y2="15" stroke="white" strokeWidth="1"/>
              <line x1="11" y1="1" x2="11" y2="15" stroke="white" strokeWidth="1"/>
            </svg>
            <span className="text-white font-semibold text-sm tracking-wide">Tableau croisé dynamique</span>
          </div>
          <Button
            size="sm"
            onClick={exportExcel}
            disabled={!pivot}
            className="h-7 border-0 text-white text-xs gap-1.5"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <Download className="h-3.5 w-3.5" />
            Exporter .xlsx
          </Button>
        </div>

        {/* Table scroll area */}
        <div className="overflow-auto flex-1" style={{ maxHeight: 560 }}>
          {!pivot ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
              <svg viewBox="0 0 48 48" className="w-14 h-14 opacity-25">
                <rect x="4" y="4" width="40" height="40" rx="2" fill="none" stroke="#888" strokeWidth="2"/>
                <line x1="4"  y1="16" x2="44" y2="16" stroke="#888" strokeWidth="1.5"/>
                <line x1="4"  y1="28" x2="44" y2="28" stroke="#888" strokeWidth="1.5"/>
                <line x1="16" y1="4"  x2="16" y2="44" stroke="#888" strokeWidth="1.5"/>
                <line x1="28" y1="4"  x2="28" y2="44" stroke="#888" strokeWidth="1.5"/>
              </svg>
              <p className="text-sm font-medium text-gray-500">Ajoutez des champs dans les zones ci-contre</p>
              <p className="text-xs text-gray-400">Lignes + Valeurs requis · Colonnes et Filtres optionnels</p>
            </div>
          ) : (
            <table
              className="min-w-full border-collapse select-none"
              style={{ fontSize: 12, fontFamily: "'Calibri', 'Segoe UI', sans-serif" }}
            >
              <thead>
                {/* Column-field header row (only if colField set) */}
                {showColHeader && (
                  <tr>
                    <th
                      className="border border-[#BDD7EE] bg-[#BDD7EE] px-3 py-1.5 text-left font-bold sticky top-0 z-10"
                      style={{ minWidth: 160, color: '#1F4E79' }}
                    >
                      {rowFields.map(f => fldLabel(f)).join(' / ')}
                    </th>
                    {cols.map(col => (
                      <th
                        key={col}
                        colSpan={valueConfigs.length}
                        className="border border-[#BDD7EE] bg-[#BDD7EE] px-3 py-1.5 text-center font-bold sticky top-0 z-10"
                        style={{ color: '#1F4E79' }}
                      >
                        {col}
                      </th>
                    ))}
                    <th
                      colSpan={valueConfigs.length}
                      className="border border-[#9DC3E6] bg-[#9DC3E6] px-3 py-1.5 text-center font-bold sticky top-0 z-10"
                      style={{ color: '#1F4E79' }}
                    >
                      Total général
                    </th>
                  </tr>
                )}

                {/* Value-label header row */}
                <tr>
                  <th
                    className={`border border-[#BDD7EE] bg-[#BDD7EE] px-3 py-1.5 text-left font-bold sticky z-10 ${showColHeader ? 'top-8' : 'top-0'}`}
                    style={{ minWidth: 160, color: '#1F4E79' }}
                  >
                    {!showColHeader && rowFields.map(f => fldLabel(f)).join(' / ')}
                  </th>
                  {cols.flatMap(col =>
                    valueConfigs.map(vc => (
                      <th
                        key={`h_${col}_${vc.id}`}
                        className={`border border-[#DEEAF1] bg-[#DEEAF1] px-3 py-1.5 text-right font-semibold whitespace-nowrap sticky z-10 ${showColHeader ? 'top-8' : 'top-0'}`}
                        style={{ minWidth: 90, color: '#1F4E79' }}
                      >
                        {valueConfigs.length > 1 ? vcLabel(vc) : (!showColHeader ? vcLabel(vc) : '')}
                      </th>
                    ))
                  )}
                  {valueConfigs.map(vc => (
                    <th
                      key={`ht_${vc.id}`}
                      className={`border border-[#9DC3E6] bg-[#9DC3E6] px-3 py-1.5 text-right font-semibold whitespace-nowrap sticky z-10 ${showColHeader ? 'top-8' : 'top-0'}`}
                      style={{ minWidth: 90, color: '#1F4E79' }}
                    >
                      {valueConfigs.length > 1 ? vcLabel(vc) : 'Total général'}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pivot.pivotRows.map((pr, ri) => (
                  <tr
                    key={ri}
                    style={{
                      backgroundColor: pr.kind === 'subtotal'
                        ? '#DEEAF1'
                        : ri % 2 === 0 ? '#FFFFFF' : '#F7FBFF',
                    }}
                  >
                    <td
                      className="border border-[#BDD7EE] px-3 py-1 text-left whitespace-nowrap"
                      style={{
                        color: '#1F4E79',
                        fontWeight: pr.kind === 'subtotal' ? 700 : pr.isNested ? 400 : 600,
                        paddingLeft: pr.isNested ? 28 : 12,
                      }}
                    >
                      {pr.kind === 'subtotal' && <span className="mr-1 opacity-60 text-[10px]">▸</span>}
                      {pr.label}
                    </td>
                    {cols.flatMap(col =>
                      valueConfigs.map(vc => (
                        <td
                          key={`c_${ri}_${col}_${vc.id}`}
                          className="border border-[#BDD7EE] px-3 py-1 text-right tabular-nums"
                          style={{
                            color: pr.kind === 'subtotal' ? '#1F4E79' : '#1F1F1F',
                            fontWeight: pr.kind === 'subtotal' ? 700 : 400,
                          }}
                        >
                          {fmtVal(pr.byCols[col]?.[vc.id])}
                        </td>
                      ))
                    )}
                    {valueConfigs.map(vc => (
                      <td
                        key={`rt_${ri}_${vc.id}`}
                        className="border border-[#9DC3E6] px-3 py-1 text-right tabular-nums font-semibold"
                        style={{
                          backgroundColor: pr.kind === 'subtotal' ? '#BDD7EE' : '#EBF3FB',
                          color: '#1F4E79',
                          fontWeight: pr.kind === 'subtotal' ? 700 : 600,
                        }}
                      >
                        {fmtVal(pr.rowTotals[vc.id])}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Grand Total row */}
                <tr style={{ backgroundColor: '#2E75B6' }}>
                  <td
                    className="border border-[#1F4E79] px-3 py-2 text-left text-white font-bold"
                  >
                    Total général
                  </td>
                  {cols.flatMap(col =>
                    valueConfigs.map(vc => (
                      <td
                        key={`gt_${col}_${vc.id}`}
                        className="border border-[#1F4E79] px-3 py-2 text-right text-white font-bold tabular-nums"
                      >
                        {fmtVal(pivot.grandCols[col]?.[vc.id])}
                      </td>
                    ))
                  )}
                  {valueConfigs.map(vc => (
                    <td
                      key={`gtt_${vc.id}`}
                      className="border border-[#1F4E79] px-3 py-2 text-right text-white font-bold tabular-nums"
                      style={{ backgroundColor: '#1F4E79' }}
                    >
                      {fmtVal(pivot.grandTotals[vc.id])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ════════════════════ FIELD LIST PANEL (RIGHT) ════════════════════ */}
      <div
        className="w-72 shrink-0 flex flex-col border-l"
        style={{ borderColor: '#D0D0D0', backgroundColor: '#F2F2F2' }}
      >
        {/* Panel header */}
        <div className="px-3 py-2.5 shrink-0" style={{ backgroundColor: '#217346' }}>
          <h3 className="text-white font-semibold text-sm">Champs de tableau croisé dynamique</h3>
        </div>

        {/* Field list */}
        <div className="p-2 border-b border-[#D0D0D0] shrink-0">
          <p className="text-[10px] text-[#595959] mb-1.5 font-semibold">
            Choisissez les champs à ajouter au rapport :
          </p>

          {/* Search box */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#888]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un champ..."
              className="w-full pl-6 pr-2 py-1 text-xs border border-[#C8C8C8] bg-white rounded focus:outline-none focus:border-[#217346]"
              style={{ color: '#1F1F1F' }}
            />
          </div>

          <div className="max-h-[210px] overflow-y-auto pr-0.5">
            {/* Dimensions */}
            <p className="text-[9px] text-[#888] uppercase font-bold mt-0.5 mb-0.5 px-0.5 tracking-wider">
              Dimensions
            </p>
            {filteredFields.filter(f => f.type === 'dimension').map(field => {
              const inRow = rowFields.includes(field.key);
              const isCol = colField === field.key;
              const isFlt = filterField === field.key;
              const used  = inRow || isCol || isFlt;
              return (
                <div
                  key={field.key}
                  className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-[#E5E5E5] cursor-pointer"
                >
                  <div
                    onClick={() => {
                      if (inRow) removeRow(field.key);
                      else if (isCol) setCol(null);
                      else if (isFlt) setFilter(null);
                      else addRow(field.key);
                    }}
                    className="w-3 h-3 shrink-0 border rounded-sm flex items-center justify-center cursor-pointer"
                    style={{
                      backgroundColor: used ? '#217346' : '#FFFFFF',
                      borderColor: used ? '#217346' : '#A0A0A0',
                    }}
                  >
                    {used && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                  </div>
                  <span
                    className="text-[11px] flex-1"
                    style={{
                      color: used ? '#1F4E79' : '#1F1F1F',
                      fontWeight: used ? 600 : 400,
                    }}
                    onClick={() => { if (!used) addRow(field.key); }}
                  >
                    {field.label}
                  </span>
                  {inRow && (
                    <span className="text-[9px] bg-[#4472C4] text-white px-1 py-0.5 rounded leading-none shrink-0">
                      L{rowFields.indexOf(field.key) + 1}
                    </span>
                  )}
                  {isCol && (
                    <span className="text-[9px] bg-[#ED7D31] text-white px-1 py-0.5 rounded leading-none shrink-0">C</span>
                  )}
                  {isFlt && (
                    <span className="text-[9px] bg-[#70AD47] text-white px-1 py-0.5 rounded leading-none shrink-0">F</span>
                  )}
                </div>
              );
            })}

            {/* Measures */}
            <p className="text-[9px] text-[#888] uppercase font-bold mt-2 mb-0.5 px-0.5 tracking-wider">
              Mesures
            </p>
            {filteredFields.filter(f => f.type === 'measure').map(field => {
              const inVals = valueConfigs.some(v => v.field === field.key);
              return (
                <div
                  key={field.key}
                  className="flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-[#E5E5E5] cursor-pointer"
                >
                  <div
                    onClick={() => {
                      if (inVals) setValueConfigs(valueConfigs.filter(v => v.field !== field.key));
                      else addValue(field.key);
                    }}
                    className="w-3 h-3 shrink-0 border rounded-sm flex items-center justify-center cursor-pointer"
                    style={{
                      backgroundColor: inVals ? '#217346' : '#FFFFFF',
                      borderColor: inVals ? '#217346' : '#A0A0A0',
                    }}
                  >
                    {inVals && <span className="text-white text-[8px] leading-none font-bold">✓</span>}
                  </div>
                  <span
                    className="text-[11px] flex-1"
                    style={{
                      color: inVals ? '#1F4E79' : '#1F1F1F',
                      fontWeight: inVals ? 600 : 400,
                    }}
                    onClick={() => { if (!inVals) addValue(field.key); }}
                  >
                    {field.label}
                  </span>
                  {inVals && (
                    <span className="text-[9px] bg-[#217346] text-white px-1 py-0.5 rounded leading-none shrink-0">Σ</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Drop zones */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          <p className="text-[10px] text-[#595959] font-semibold">
            Faire glisser les champs dans les zones ci-dessous :
          </p>

          {/* ── FILTRES ── */}
          <DropZone title="Filtres" titleBg="#70AD47">
            {filterField ? (
              <div className="space-y-1">
                <FieldChip label={fldLabel(filterField)} bg="#70AD47" onRemove={() => setFilter(null)} />
                <select
                  value={filterValue ?? ''}
                  onChange={e => setFilterValue(e.target.value || null)}
                  className="w-full text-xs border border-[#C8C8C8] bg-white rounded px-1.5 py-0.5 focus:outline-none focus:border-[#217346]"
                  style={{ color: '#1F1F1F' }}
                >
                  <option value="">(Tous)</option>
                  {filterValues.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ) : (
              <AddBtn
                label="Ajouter un filtre"
                fields={DIMENSION_FIELDS.filter(f => !usedDimKeys.has(f.key))}
                onAdd={key => setFilter(key)}
              />
            )}
          </DropZone>

          {/* ── COLONNES ── */}
          <DropZone title="Colonnes" titleBg="#ED7D31">
            {colField ? (
              <FieldChip label={fldLabel(colField)} bg="#ED7D31" onRemove={() => setCol(null)} />
            ) : (
              <AddBtn
                label="Ajouter une colonne"
                fields={DIMENSION_FIELDS.filter(f => !usedDimKeys.has(f.key))}
                onAdd={key => setCol(key)}
              />
            )}
          </DropZone>

          {/* ── LIGNES ── */}
          <DropZone title="Lignes" titleBg="#4472C4">
            <div className="space-y-1">
              {rowFields.map(f => (
                <FieldChip key={f} label={fldLabel(f)} bg="#4472C4" onRemove={() => removeRow(f)} />
              ))}
              {rowFields.length < 2 && (
                <AddBtn
                  label="Ajouter une ligne"
                  fields={DIMENSION_FIELDS.filter(f => !usedDimKeys.has(f.key))}
                  onAdd={key => addRow(key)}
                />
              )}
            </div>
          </DropZone>

          {/* ── VALEURS ── */}
          <DropZone title="Valeurs" titleBg="#217346">
            <div className="space-y-1">
              {valueConfigs.map(vc => (
                <ValueChip
                  key={vc.id}
                  vc={vc}
                  onRemove={() => rmValue(vc.id)}
                  onAggChange={fn => updAgg(vc.id, fn)}
                />
              ))}
              <AddBtn
                label="Ajouter une valeur"
                fields={MEASURE_FIELDS}
                onAdd={key => addValue(key)}
              />
            </div>
          </DropZone>
        </div>
      </div>
    </div>
  );
}
