import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Pencil, X,
  ChevronLeft, ChevronRight, Search, AlertTriangle, Wand2, Sparkles, Trash2, Copy,
} from 'lucide-react';
import {
  BILLING_TEMPLATE_COLUMNS, BillingRow, ColumnGroup,
} from './billing-import.types';
import { useBillingImport, computeDerived, validateRow, countFixable, analyzeDuplicates, detectAnomalies, DuplicateAnalysis } from './useBillingImport';
import { getAudits } from '@/lib/audit-service';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

export interface ImportSummary {
  /** Nombre de doublons (même n° facture) retirés avant l'import. */
  duplicatesRemoved: number;
  /** Parmi les retirés, nombre de factures incohérentes (anomalies) écartées. */
  incoherentRemoved: number;
  /** Nombre de factures redressées (versions cohérentes) conservées. */
  redressedKept: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportConfirmed: (rows: BillingRow[], auditId: string, summary: ImportSummary) => Promise<void>;
}

const ALL_GROUPS: ColumnGroup[] = ['Identité', 'Facture', 'Index', 'Énergie', 'Puissance', 'Tarif', 'Réactif', 'Site', 'Calculé'];
const FIXED_KEYS = ['numeroFacture', 'appartenance'];
const PAGE_SIZE = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtVal(value: unknown, type: string): string {
  if (value == null) return '—';
  if (value instanceof Date) return fmtDate(value);
  if (type === 'number' && typeof value === 'number')
    return value.toLocaleString('fr-FR');
  return String(value);
}

// ─── Edit panel ───────────────────────────────────────────────────────────────

function EditPanel({
  row,
  onSave,
  onClose,
}: {
  row: BillingRow;
  onSave: (updated: BillingRow) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BillingRow>(() => ({ ...row }));

  function setField(key: string, raw: string, type: string) {
    setDraft(prev => {
      const next = { ...prev } as Record<string, unknown>;
      if (type === 'number') {
        const n = parseFloat(raw);
        next[key] = raw === '' ? null : isNaN(n) ? null : n;
      } else if (type === 'date') {
        const d = raw ? new Date(raw) : null;
        next[key] = d && !isNaN(d.getTime()) ? d : null;
      } else {
        next[key] = raw === '' ? null : raw;
      }
      return next as BillingRow;
    });
  }

  function handleSave() {
    const updated = { ...draft };
    computeDerived(updated);
    validateRow(updated);
    onSave(updated);
    onClose();
  }

  return (
    <div className="flex flex-col w-[440px] shrink-0 border-l border-white/10 bg-[#0a0c14]">
      {/* Panel header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-white/10 shrink-0 gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">Modifier — ligne {row._rowIndex}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{row.appartenance ?? '—'}</p>
        </div>
        <button
          onClick={onClose}
          className="mt-0.5 shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-5">
          {ALL_GROUPS.map(group => {
            const cols = BILLING_TEMPLATE_COLUMNS.filter(c => c.group === group);
            return (
              <div key={group}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5 border-b border-white/[0.06] pb-1">
                  {group}
                </p>
                <div className="space-y-2.5">
                  {cols.map(col => {
                    const val = (draft as Record<string, unknown>)[col.key];
                    const isError = col.required && (val == null || val === '');
                    const inputVal = val instanceof Date
                      ? val.toISOString().split('T')[0]
                      : val == null ? '' : String(val);

                    return (
                      <div key={col.key}>
                        <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 mb-1">
                          {col.label}
                          {col.required && <span className="text-red-400 text-[10px]">*</span>}
                          {col.computed && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-white/[0.06] text-slate-500 font-normal">Auto</span>
                          )}
                        </label>
                        <input
                          type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                          value={inputVal}
                          readOnly={col.computed}
                          onChange={e => !col.computed && setField(col.key, e.target.value, col.type)}
                          className={[
                            'w-full h-8 px-2.5 text-xs rounded-lg border outline-none transition-colors',
                            'bg-[#13162a] text-slate-200 placeholder:text-slate-600',
                            col.computed
                              ? 'border-white/[0.06] text-slate-500 cursor-not-allowed'
                              : isError
                                ? 'border-amber-500/60 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30'
                                : 'border-white/10 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20',
                          ].join(' ')}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-white/10 shrink-0 flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 h-8 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors"
        >
          Sauvegarder
        </button>
        <button
          onClick={onClose}
          className="h-8 px-4 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── Magic strategy panel ─────────────────────────────────────────────────────

function MagicStrategyPanel({
  errorCount,
  fixableCount,
  onRepair,
  onSkip,
  onForce,
  onClose,
}: {
  errorCount: number;
  fixableCount: number;
  onRepair: () => void;
  onSkip: () => void;
  onForce: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="absolute right-0 top-full mt-1.5 z-50 w-76 rounded-xl border border-white/[0.12] bg-[#0d0f1a] shadow-2xl shadow-black/60 overflow-hidden"
        style={{ width: 300 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-emerald-500/5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <p className="text-xs font-semibold text-emerald-300">
              {errorCount} donnée{errorCount > 1 ? 's' : ''} manquante{errorCount > 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Strategies */}
        <div className="p-2 space-y-1">

          {/* Option 1 — Auto-repair */}
          <button
            onClick={() => { onRepair(); onClose(); }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left
              hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent
              transition-all group"
          >
            <div className="mt-0.5 p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/20 shrink-0 group-hover:bg-emerald-500/25 transition-colors">
              <Wand2 className="h-3 w-3 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">Calcul automatique</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                {fixableCount > 0
                  ? `~${fixableCount} ligne${fixableCount > 1 ? 's' : ''} réparable${fixableCount > 1 ? 's' : ''} · TVA = TTC − HT, conso = NI − AI, jours = fin − début…`
                  : 'Tente de dériver les champs manquants depuis les données présentes'
                }
              </p>
            </div>
          </button>

          {/* Option 2 — Skip error rows */}
          <button
            onClick={() => { onSkip(); onClose(); }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left
              hover:bg-amber-500/8 hover:border-amber-500/15 border border-transparent
              transition-all group"
          >
            <div className="mt-0.5 p-1.5 rounded-md bg-amber-500/10 border border-amber-500/15 shrink-0 group-hover:bg-amber-500/20 transition-colors">
              <Trash2 className="h-3 w-3 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">Exclure les lignes invalides</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                Retirer les {errorCount} ligne{errorCount > 1 ? 's' : ''} incomplète{errorCount > 1 ? 's' : ''} · seules les lignes complètes seront importées
              </p>
            </div>
          </button>

          {/* Option 3 — Force accept */}
          <button
            onClick={() => { onForce(); onClose(); }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left
              hover:bg-red-500/8 hover:border-red-500/15 border border-transparent
              transition-all group"
          >
            <div className="mt-0.5 p-1.5 rounded-md bg-red-500/10 border border-red-500/15 shrink-0 group-hover:bg-red-500/20 transition-colors">
              <AlertTriangle className="h-3 w-3 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">Forcer l'import (laisser vide)</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                Ignorer les données manquantes et importer tel quel · les champs vides resteront null
              </p>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Duplicate strategy panel ──────────────────────────────────────────────────

function DuplicateStrategyPanel({
  duplicateCount,
  redressedCount,
  incoherentCount,
  isolated,
  onIsolate,
  onRemove,
  onManual,
  onClose,
}: {
  duplicateCount: number;
  redressedCount: number;
  incoherentCount: number;
  isolated: boolean;
  onIsolate: () => void;
  onRemove: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl border border-white/[0.12] bg-[#0d0f1a] shadow-2xl shadow-black/60 overflow-hidden" style={{ width: 320 }}>
        <div className="px-4 py-2.5 border-b border-white/[0.08] bg-orange-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-orange-400" />
              <p className="text-xs font-semibold text-orange-300">
                {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''} (même n° facture)
              </p>
            </div>
            <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {(redressedCount > 0 || incoherentCount > 0) && (
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              {redressedCount > 0 && <span className="text-emerald-400">{redressedCount} redressée{redressedCount > 1 ? 's' : ''}</span>}
              {redressedCount > 0 && incoherentCount > 0 && ' · '}
              {incoherentCount > 0 && <span className="text-red-400">{incoherentCount} incohérente{incoherentCount > 1 ? 's' : ''}</span>}
            </p>
          )}
        </div>

        <div className="p-2 space-y-1">
          {/* Option 1 — Isolate / view */}
          <button
            onClick={() => { onIsolate(); onClose(); }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-orange-500/10 border border-transparent hover:border-orange-500/20 transition-all group"
          >
            <div className="mt-0.5 p-1.5 rounded-md bg-orange-500/15 border border-orange-500/20 shrink-0 group-hover:bg-orange-500/25 transition-colors">
              <Search className="h-3 w-3 text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">{isolated ? 'Afficher toutes les lignes' : 'Isoler les doublons'}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                {isolated ? 'Retirer le filtre et revoir tout le fichier' : 'Comparer côte à côte versions conservées et écartées'}
              </p>
            </div>
          </button>

          {/* Option 2 — Keep redressed, remove incoherent */}
          <button
            onClick={() => { onRemove(); onClose(); }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all group"
          >
            <div className="mt-0.5 p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/20 shrink-0 group-hover:bg-emerald-500/25 transition-colors">
              <Trash2 className="h-3 w-3 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">Conserver la version cohérente</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                Garder la facture redressée (cohérente) de chaque n° · supprimer les {duplicateCount} version{duplicateCount > 1 ? 's' : ''} en double / incohérente{duplicateCount > 1 ? 's' : ''} · tracé dans l'historique
              </p>
            </div>
          </button>

          {/* Option 3 — Manual resolve */}
          <button
            onClick={() => { onManual(); onClose(); }}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-amber-500/8 hover:border-amber-500/15 border border-transparent transition-all group"
          >
            <div className="mt-0.5 p-1.5 rounded-md bg-amber-500/10 border border-amber-500/15 shrink-0 group-hover:bg-amber-500/20 transition-colors">
              <Pencil className="h-3 w-3 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100">Choisir manuellement</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                Comparer toutes les versions côte à côte et sélectionner la version à conserver pour chaque doublon
              </p>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Manual conflict resolver ─────────────────────────────────────────────────

interface ConflictGroup { factureNum: number; rows: BillingRow[]; }

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 items-baseline">
      <span className="text-[10px] text-slate-600 shrink-0">{label}</span>
      <span className="text-[11px] font-medium text-slate-300 text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function ManualConflictResolver({
  groups,
  dupAnalysis,
  onConfirm,
  onClose,
}: {
  groups: ConflictGroup[];
  dupAnalysis: DuplicateAnalysis;
  onConfirm: (keptIndexes: Set<number>, removed: number, anomalousRemoved: number) => void;
  onClose: () => void;
}) {
  const [selections, setSelections] = useState<Map<number, number>>(() => {
    const m = new Map<number, number>();
    for (const { factureNum, rows } of groups) {
      const kept = rows.find(r => !dupAnalysis.dropped.has(r._rowIndex));
      m.set(factureNum, kept?._rowIndex ?? rows[0]._rowIndex);
    }
    return m;
  });

  const allSelected = groups.every(g => selections.has(g.factureNum));

  function handleConfirm() {
    const keptIndexes = new Set<number>(selections.values());
    let removed = 0;
    let anomalousRemoved = 0;
    for (const { rows } of groups) {
      for (const r of rows) {
        if (!keptIndexes.has(r._rowIndex)) {
          removed++;
          if (dupAnalysis.anomalous.has(r._rowIndex)) anomalousRemoved++;
        }
      }
    }
    onConfirm(keptIndexes, removed, anomalousRemoved);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl max-h-[88vh] mx-4 flex flex-col bg-[#0b0d14] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <Copy className="h-4 w-4 text-orange-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Résolution manuelle des doublons</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {groups.length} groupe{groups.length > 1 ? 's' : ''} · cliquez sur la version à conserver pour chaque numéro de facture
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {groups.map(({ factureNum, rows }) => {
            const selectedIdx = selections.get(factureNum);
            return (
              <div key={factureNum} className="border border-white/[0.08] rounded-xl overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500">N°</span>
                    <span className="text-sm font-semibold text-slate-100 tabular-nums">
                      {factureNum.toLocaleString('fr-FR')}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 font-medium">
                      {rows.length} versions
                    </span>
                  </div>
                  {selectedIdx != null && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Ligne {selectedIdx} sélectionnée
                    </span>
                  )}
                </div>

                {/* Cards side-by-side */}
                <div className={[
                  'grid gap-3 p-3',
                  rows.length === 2 ? 'grid-cols-2' : rows.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
                ].join(' ')}>
                  {rows.map(row => {
                    const isSelected = selectedIdx === row._rowIndex;
                    const isAnomalous = dupAnalysis.anomalous.has(row._rowIndex);
                    const isRedressed = dupAnalysis.redressed.has(row._rowIndex);
                    const isDroppedDup = dupAnalysis.dropped.has(row._rowIndex);
                    const anomaly = detectAnomalies(row);

                    return (
                      <button
                        key={row._rowIndex}
                        onClick={() => setSelections(prev => new Map(prev).set(factureNum, row._rowIndex))}
                        className={[
                          'relative text-left p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer',
                          isSelected
                            ? 'border-amber-500/60 bg-amber-500/5 shadow-[0_0_14px_rgba(245,158,11,0.15)]'
                            : isAnomalous
                              ? 'border-red-500/25 bg-red-950/10 hover:border-red-500/40 hover:bg-red-950/20'
                              : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                        ].join(' ')}
                      >
                        {/* Radio indicator */}
                        <div className={[
                          'absolute top-3 right-3 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
                          isSelected ? 'border-amber-500 bg-amber-500' : 'border-white/20',
                        ].join(' ')}>
                          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-black" />}
                        </div>

                        {/* Status badges */}
                        <div className="flex flex-wrap gap-1 mb-2.5 pr-6">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                            #{row._rowIndex}
                          </span>
                          {isRedressed && (
                            <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                              <CheckCircle2 className="h-2.5 w-2.5" />Redressée
                            </span>
                          )}
                          {isAnomalous && (
                            <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold">
                              <AlertTriangle className="h-2.5 w-2.5" />Incohérente
                            </span>
                          )}
                          {isDroppedDup && !isAnomalous && (
                            <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-semibold">
                              <Copy className="h-2.5 w-2.5" />Doublon
                            </span>
                          )}
                        </div>

                        {/* Key fields */}
                        <div className="space-y-1.5">
                          <FieldRow label="Date comptable"
                            value={row.dateComptableFacture
                              ? row.dateComptableFacture.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                              : '—'}
                          />
                          <FieldRow label="Période"
                            value={row.dateDebutPeriode && row.dateFinPeriode
                              ? `${row.dateDebutPeriode.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} → ${row.dateFinPeriode.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                              : '—'}
                          />
                          <FieldRow label="Montant TTC"
                            value={row.montantFactureTTC != null
                              ? row.montantFactureTTC.toLocaleString('fr-FR') + ' FCFA'
                              : '—'}
                          />
                          <FieldRow label="Montant HT"
                            value={row.montantHorsTVA != null
                              ? row.montantHorsTVA.toLocaleString('fr-FR') + ' FCFA'
                              : '—'}
                          />
                          <FieldRow label="TVA"
                            value={row.montantTVA != null
                              ? row.montantTVA.toLocaleString('fr-FR') + ' FCFA'
                              : '—'}
                          />
                          <FieldRow label="Consommation"
                            value={row.consommationFacturee != null
                              ? row.consommationFacturee.toLocaleString('fr-FR') + ' kWh'
                              : '—'}
                          />
                          <FieldRow label="Appartenance" value={row.appartenance ?? '—'} />
                        </div>

                        {/* Anomaly reasons */}
                        {anomaly.reasons.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-red-500/10 space-y-0.5">
                            {anomaly.reasons.map((reason, i) => (
                              <p key={i} className="text-[9px] text-red-400/80 leading-relaxed">· {reason}</p>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08] shrink-0 bg-[#0d0f1a]">
          <span className="text-xs text-slate-500">
            {selections.size} / {groups.length} groupe{groups.length > 1 ? 's' : ''} résolu{groups.length > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-8 px-4 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!allSelected}
              className="h-8 px-5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Valider la sélection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function BillingImportModal({ open, onOpenChange, onImportConfirmed }: Props) {
  const { organization } = useOrganization();
  const { result, isParsing, parseError, parseFile, updateRow, reset, autoRepair, skipErrors, forceAccept, removeDuplicates, resolveManual, keepSingleRow } = useBillingImport();
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [audits, setAudits] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState('');

  const [activeGroup, setActiveGroup] = useState<ColumnGroup>('Facture');
  const [search, setSearch] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<BillingRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [manualResolverOpen, setManualResolverOpen] = useState(false);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [incoherentRemoved, setIncoherentRemoved] = useState(0);
  const [redressedKept, setRedressedKept] = useState(0);
  const [filterPartenaire, setFilterPartenaire] = useState('');
  const [filterMontantMin, setFilterMontantMin] = useState('');

  useEffect(() => {
    if (!open) return;
    getAudits(organization?.id ?? '').then(list =>
      setAudits((list ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })))
    ).catch(() => {});
  }, [open, organization?.id]);

  useEffect(() => {
    if (!open) {
      reset();
      setSearch('');
      setErrorsOnly(false);
      setPage(1);
      setEditingRow(null);
      setSelectedAuditId('');
      setMagicOpen(false);
      setDupOpen(false);
      setDuplicatesOnly(false);
      setManualResolverOpen(false);
      setDuplicatesRemoved(0);
      setIncoherentRemoved(0);
      setRedressedKept(0);
      setFilterPartenaire('');
      setFilterMontantMin('');
    }
  }, [open, reset]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedAuditId) { toast.error('Sélectionnez un projet avant d\'importer'); return; }
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.xlsx')) parseFile(file);
  }, [parseFile, selectedAuditId]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAuditId) { toast.error('Sélectionnez un projet avant d\'importer'); return; }
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }, [parseFile, selectedAuditId]);

  // Derived filter data
  const allRows = result?.rows ?? [];

  // Doublons / redressements par numéro de facture.
  const dupAnalysis = useMemo(() => analyzeDuplicates(allRows), [allRows]);
  const duplicateMap = dupAnalysis.dropped;          // _rowIndex écarté → _rowIndex conservé
  const duplicateCount = duplicateMap.size;
  const involvedRows = useMemo(() => {
    const s = new Set<number>();
    for (const [drop, keep] of duplicateMap) { s.add(drop); s.add(keep); }
    return s;
  }, [duplicateMap]);
  // n° facture par ligne → étiquette « Doublon du n° … »
  const factureByRowIndex = useMemo(() => {
    const m = new Map<number, number | null>();
    for (const r of allRows) m.set(r._rowIndex, r.numeroFacture);
    return m;
  }, [allRows]);

  // Groups of rows sharing the same numeroFacture (2+ versions) — fed to ManualConflictResolver
  const manualGroups = useMemo<ConflictGroup[]>(() => {
    const map = new Map<number, BillingRow[]>();
    for (const r of allRows) {
      if (r.numeroFacture == null) continue;
      const g = map.get(r.numeroFacture);
      if (g) g.push(r); else map.set(r.numeroFacture, [r]);
    }
    const result: ConflictGroup[] = [];
    for (const [num, rows] of map) {
      if (rows.length >= 2) result.push({ factureNum: num, rows });
    }
    return result.sort((a, b) => a.factureNum - b.factureNum);
  }, [allRows]);

  function handleManualResolve(keptIndexes: Set<number>, removed: number, anomalousRemoved: number) {
    resolveManual(keptIndexes);
    setDuplicatesRemoved(prev => prev + removed);
    setIncoherentRemoved(prev => prev + anomalousRemoved);
    setManualResolverOpen(false);
    setDuplicatesOnly(false);
    toast.success(
      `${removed} version${removed > 1 ? 's' : ''} retirée${removed > 1 ? 's' : ''} — résolution manuelle`,
    );
  }

  const uniquePartenaires = Array.from(new Set(
    allRows.map(r => r.partenaire ?? r.appartenance ?? '').filter(Boolean)
  )).sort().slice(0, 80);

  const filteredRows = allRows.filter(row => {
    if (errorsOnly && row.rowErrors.length === 0) return false;
    if (duplicatesOnly && !involvedRows.has(row._rowIndex)) return false;
    if (filterPartenaire) {
      const val = row.partenaire ?? row.appartenance ?? '';
      if (val !== filterPartenaire) return false;
    }
    if (filterMontantMin) {
      const min = parseFloat(filterMontantMin);
      if (!isNaN(min) && (row.montantFactureTTC == null || row.montantFactureTTC < min)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (row.partenaire?.toLowerCase().includes(q) ?? false)
        || (row.appartenance?.toLowerCase().includes(q) ?? false)
        || (row.numeroCompteContrat?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fixedCols = BILLING_TEMPLATE_COLUMNS.filter(c => FIXED_KEYS.includes(c.key));
  const groupCols = BILLING_TEMPLATE_COLUMNS.filter(c => c.group === activeGroup && !FIXED_KEYS.includes(c.key));
  const displayCols = [...fixedCols, ...groupCols];

  const hasErrors = (result?.errorRows ?? 0) > 0;
  const canConfirm = !hasErrors && !!selectedAuditId && !!result;

  function handleRemoveDuplicates() {
    const n = duplicateCount;
    if (n === 0) return;
    const incoherent = dupAnalysis.anomalous.size;
    const redressed = dupAnalysis.redressed.size;
    removeDuplicates();
    setDuplicatesRemoved(prev => prev + n);
    setIncoherentRemoved(prev => prev + incoherent);
    setRedressedKept(prev => prev + redressed);
    setDuplicatesOnly(false);
    toast.success(
      redressed > 0
        ? `${n} doublon${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''} · ${redressed} facture${redressed > 1 ? 's' : ''} redressée${redressed > 1 ? 's' : ''} conservée${redressed > 1 ? 's' : ''}`
        : `${n} doublon${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''} (n° facture en double)`,
    );
  }

  function handleKeepRow(row: BillingRow) {
    const { removed, anomalousRemoved } = keepSingleRow(row._rowIndex);
    if (removed === 0) return;
    setDuplicatesRemoved(prev => prev + removed);
    setIncoherentRemoved(prev => prev + anomalousRemoved);
    toast.success(
      `Facture ${row.numeroFacture?.toLocaleString('fr-FR') ?? '?'} — ligne ${row._rowIndex} conservée · ${removed} doublon${removed > 1 ? 's' : ''} supprimé${removed > 1 ? 's' : ''}`,
    );
  }

  async function handleConfirm() {
    if (!result || !selectedAuditId) return;
    setIsLoading(true);
    try {
      await onImportConfirmed(result.rows, selectedAuditId, { duplicatesRemoved, incoherentRemoved, redressedKept });
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 bg-[#0b0d14] border border-white/10 text-slate-100 overflow-hidden flex flex-col"
        style={{
          maxWidth: result ? '96vw' : 520,
          width: result ? '96vw' : undefined,
          maxHeight: '92vh',
          height: result ? '92vh' : undefined,
        }}
      >
        {/* ══ ÉTAPE 1 — UPLOAD ══ */}
        {!result && (
          <>
            <DialogHeader className="px-6 pt-5 pb-0 shrink-0">
              <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                Import Excel SENELEC
              </DialogTitle>
              <p className="text-xs text-slate-500 mt-1">Template fixe 63 colonnes · fichier .xlsx uniquement</p>
            </DialogHeader>

            <div className="px-6 pb-6 pt-5 space-y-4 shrink-0">
              {/* Audit selector */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                  Projet associé <span className="text-red-400">*</span>
                </label>
                <Select value={selectedAuditId} onValueChange={setSelectedAuditId}>
                  <SelectTrigger className="bg-[#13162a] border-white/10 text-slate-200 h-9 text-sm focus:ring-amber-500/40">
                    <SelectValue placeholder="Sélectionner un projet…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
                    {audits.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Drop zone */}
              <div
                ref={dropRef}
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={[
                  'relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all py-14',
                  isDragging
                    ? 'border-emerald-500/60 bg-emerald-500/8'
                    : selectedAuditId
                      ? 'border-white/15 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]'
                      : 'border-white/[0.07] bg-white/[0.01] opacity-50 cursor-not-allowed',
                ].join(' ')}
              >
                <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
                {isParsing ? (
                  <>
                    <div className="w-7 h-7 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                    <p className="text-sm text-slate-400">Analyse en cours…</p>
                  </>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-white/[0.06]">
                      <Upload className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-slate-300">Déposer le fichier .xlsx ici</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {selectedAuditId ? 'ou cliquer pour parcourir' : 'Sélectionnez d\'abord un projet'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Parse error */}
              {parseError && (
                <div className="flex items-start gap-3 rounded-xl bg-red-500/8 border border-red-500/20 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 leading-relaxed break-all">{parseError}</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ ÉTAPE 2 — VISUALISEUR ══ */}
        {result && (
          <div className="flex flex-col flex-1 min-h-0">

            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate max-w-xs">{result.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400">{result.totalRows.toLocaleString('fr-FR')} factures</span>
                    {result.errorRows > 0
                      ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-400 bg-amber-500/8">
                          {result.errorRows} donnée{result.errorRows > 1 ? 's' : ''} manquante{result.errorRows > 1 ? 's' : ''}
                        </Badge>
                      : <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-emerald-500/40 text-emerald-400 bg-emerald-500/8">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Valide
                        </Badge>
                    }
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Magic button — only visible when there are errors */}
                {hasErrors && (
                  <div className="relative">
                    <button
                      onClick={() => setMagicOpen(v => !v)}
                      className={[
                        'relative overflow-hidden flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg',
                        'bg-emerald-500/15 border text-emerald-300 transition-all duration-200',
                        magicOpen
                          ? 'border-emerald-400/50 bg-emerald-500/25 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                          : 'border-emerald-500/25 hover:bg-emerald-500/25 hover:border-emerald-400/40 hover:shadow-[0_0_10px_rgba(52,211,153,0.15)]',
                      ].join(' ')}
                    >
                      {/* Shimmer sweep */}
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                      <Sparkles className="h-3.5 w-3.5 relative" />
                      <span className="relative">Résolution auto</span>
                    </button>

                    {magicOpen && (
                      <MagicStrategyPanel
                        errorCount={result?.errorRows ?? 0}
                        fixableCount={countFixable(result?.rows ?? [])}
                        onRepair={autoRepair}
                        onSkip={skipErrors}
                        onForce={forceAccept}
                        onClose={() => setMagicOpen(false)}
                      />
                    )}
                  </div>
                )}

                {/* Duplicate button — only visible when duplicates detected */}
                {duplicateCount > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setDupOpen(v => !v)}
                      className={[
                        'flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border transition-all duration-200',
                        dupOpen
                          ? 'bg-orange-500/25 border-orange-400/50 text-orange-200'
                          : 'bg-orange-500/15 border-orange-500/25 text-orange-300 hover:bg-orange-500/25 hover:border-orange-400/40',
                      ].join(' ')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {duplicateCount} doublon{duplicateCount > 1 ? 's' : ''}
                    </button>

                    {dupOpen && (
                      <DuplicateStrategyPanel
                        duplicateCount={duplicateCount}
                        redressedCount={dupAnalysis.redressed.size}
                        incoherentCount={dupAnalysis.anomalous.size}
                        isolated={duplicatesOnly}
                        onIsolate={() => { setDuplicatesOnly(v => !v); setPage(1); }}
                        onRemove={handleRemoveDuplicates}
                        onManual={() => setManualResolverOpen(true)}
                        onClose={() => setDupOpen(false)}
                      />
                    )}
                  </div>
                )}

                <button
                  onClick={() => onOpenChange(false)}
                  className="h-8 px-3 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!canConfirm || isLoading}
                  className="h-8 px-4 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isLoading
                    ? <><div className="w-3 h-3 rounded-full border border-black/30 border-t-black animate-spin" />Chargement…</>
                    : 'Charger les données'
                  }
                </button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015] shrink-0 overflow-x-auto">
              {/* Group tabs */}
              <div className="flex gap-0.5 shrink-0">
                {ALL_GROUPS.map(g => (
                  <button
                    key={g}
                    onClick={() => { setActiveGroup(g); setPage(1); setEditingRow(null); }}
                    className={[
                      'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap',
                      activeGroup === g
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5',
                    ].join(' ')}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-white/10 shrink-0 mx-1" />

              {/* Search */}
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); setFilterPartenaire(''); }}
                  placeholder="Partenaire / contrat…"
                  className="pl-7 pr-3 h-7 text-xs w-44 bg-[#13162a] border border-white/10 rounded-lg text-slate-200 placeholder:text-slate-600 outline-none focus:border-amber-500/40"
                />
              </div>

              {/* Partenaire filter */}
              {uniquePartenaires.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <Select
                    value={filterPartenaire || '__all__'}
                    onValueChange={v => { setFilterPartenaire(v === '__all__' ? '' : v); setSearch(''); setPage(1); }}
                  >
                    <SelectTrigger className={[
                      'h-7 text-[11px] w-40 focus:ring-0',
                      filterPartenaire
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                        : 'bg-[#13162a] border-white/10 text-slate-400',
                    ].join(' ')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0f1a] border-white/10 text-white max-h-60">
                      <SelectItem value="__all__" className="text-slate-400 text-[11px] focus:bg-slate-700/50">Tous les partenaires</SelectItem>
                      {uniquePartenaires.map(p => (
                        <SelectItem key={p} value={p} className="text-slate-200 text-[11px] focus:bg-slate-700/50 focus:text-white">
                          {p.length > 28 ? p.slice(0, 28) + '…' : p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filterPartenaire && (
                    <button
                      onClick={() => { setFilterPartenaire(''); setPage(1); }}
                      title="Effacer le filtre partenaire"
                      className="h-5 w-5 flex items-center justify-center rounded-full bg-blue-500/15 text-blue-400 hover:bg-blue-500/30 transition-colors shrink-0"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Montant min filter */}
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  value={filterMontantMin}
                  onChange={e => { setFilterMontantMin(e.target.value); setPage(1); }}
                  placeholder="Montant ≥ FCFA"
                  className={[
                    'h-7 pl-2.5 pr-2 text-[11px] w-32 rounded-lg border outline-none transition-all',
                    filterMontantMin
                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-300 placeholder:text-violet-500/50'
                      : 'bg-[#13162a] border-white/10 text-slate-300 placeholder:text-slate-600',
                  ].join(' ')}
                />
                {filterMontantMin && (
                  <button
                    onClick={() => { setFilterMontantMin(''); setPage(1); }}
                    title="Effacer le filtre montant"
                    className="h-5 w-5 flex items-center justify-center rounded-full bg-violet-500/15 text-violet-400 hover:bg-violet-500/30 transition-colors shrink-0"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>

              {/* Données manquantes toggle */}
              <button
                onClick={() => { setErrorsOnly(v => !v); setPage(1); }}
                className={[
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-all whitespace-nowrap shrink-0',
                  errorsOnly
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'border-white/10 text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                <AlertCircle className="h-3 w-3" />
                Données manquantes
              </button>
            </div>

            {/* Table + edit panel side-by-side */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* Table area */}
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-[#0d1018]">
                      <tr>
                        <th className="sticky left-0 z-20 px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-white/[0.07] bg-[#0d1018] whitespace-nowrap">#</th>
                        {displayCols.map(col => (
                          <th key={col.key} className="px-3 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide border-b border-white/[0.07] whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 border-b border-white/[0.07] w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 && (
                        <tr>
                          <td colSpan={displayCols.length + 2} className="text-center py-16 text-slate-600 text-sm">
                            Aucune ligne à afficher
                          </td>
                        </tr>
                      )}
                      {pageRows.map(row => {
                        const hasErr = row.rowErrors.length > 0;
                        const isActive = editingRow?._rowIndex === row._rowIndex;
                        const skipped = row._skippedFields ?? [];
                        const repaired = row._repairedFields ?? [];
                        const isDropped = duplicateMap.has(row._rowIndex);
                        const dupOf = duplicateMap.get(row._rowIndex);
                        const isAnomalous = dupAnalysis.anomalous.has(row._rowIndex);
                        const isRedressed = dupAnalysis.redressed.has(row._rowIndex);
                        return (
                          <tr
                            key={row._rowIndex}
                            className={[
                              'border-b border-white/[0.04] transition-colors group/row',
                              isActive
                                ? 'bg-amber-500/10 border-l-2 border-l-amber-500/60'
                                : isDropped && isAnomalous
                                  ? 'bg-red-950/25 border-l-2 border-l-red-500/50 hover:bg-red-950/40'
                                  : isDropped
                                    ? 'bg-orange-950/20 border-l-2 border-l-orange-500/40 hover:bg-orange-950/35'
                                    : isRedressed
                                      ? 'bg-emerald-950/20 border-l-2 border-l-emerald-500/40 hover:bg-emerald-950/35'
                                      : hasErr
                                        ? 'bg-amber-950/20 border-l-2 border-l-amber-500/30 hover:bg-amber-950/35'
                                        : 'hover:bg-white/[0.04] border-l-2 border-l-transparent hover:border-l-slate-600/40',
                            ].join(' ')}
                          >
                            <td className={[
                              'sticky left-0 z-[1] px-3 py-2 whitespace-nowrap transition-colors',
                              isActive
                                ? 'bg-amber-950/40'
                                : isDropped && isAnomalous ? 'bg-red-950/30'
                                : isDropped ? 'bg-orange-950/25'
                                : isRedressed ? 'bg-emerald-950/25'
                                : hasErr ? 'bg-amber-950/25'
                                : 'bg-[#0b0d14] group-hover/row:bg-[#0f1120]',
                            ].join(' ')}>
                              <div className="flex flex-col gap-1 min-w-[80px]">
                                {/* Numéro de ligne */}
                                <span className="tabular-nums text-slate-600 text-[11px] group-hover/row:text-slate-400 transition-colors">
                                  {row._rowIndex}
                                  {isDropped && isAnomalous && (
                                    <span
                                      className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-500/15 text-red-400 text-[9px] font-semibold align-middle"
                                      title={`Incohérente — ${detectAnomalies(row).reasons.join(', ')}`}
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" />Incohérente
                                    </span>
                                  )}
                                  {isDropped && !isAnomalous && (
                                    <span
                                      className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-500/15 text-orange-400 text-[9px] font-semibold align-middle"
                                      title={`Doublon (conservée : ligne ${dupOf})`}
                                    >
                                      <Copy className="h-2.5 w-2.5" />Doublon
                                    </span>
                                  )}
                                  {isRedressed && (
                                    <span
                                      className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-semibold align-middle"
                                      title="Facture redressée — version cohérente conservée"
                                    >
                                      <CheckCircle2 className="h-2.5 w-2.5" />Redressée
                                    </span>
                                  )}
                                </span>

                                {/* Bouton Conserver — affiché dès qu'une ligne est impliquée dans un doublon */}
                                {involvedRows.has(row._rowIndex) && (
                                  <button
                                    onClick={() => handleKeepRow(row)}
                                    className="flex items-center gap-1 h-5 px-2 text-[10px] font-semibold rounded transition-all bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-400/60 hover:text-emerald-300 whitespace-nowrap w-fit"
                                  >
                                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                                    Conserver
                                  </button>
                                )}
                              </div>
                            </td>
                            {displayCols.map(col => {
                              const val = (row as Record<string, unknown>)[col.key];
                              const isSkipped = skipped.includes(col.key);
                              const isRepaired = repaired.includes(col.key) && val != null && val !== '';
                              const cellErr = hasErr && col.required && (val == null || val === '') && !isSkipped;
                              return (
                                <td
                                  key={col.key}
                                  className={[
                                    'px-3 py-2 whitespace-nowrap max-w-[180px] truncate text-[12px]',
                                    cellErr ? 'text-red-400' : isRepaired ? 'text-emerald-400 bg-emerald-500/[0.07]' : 'text-slate-300',
                                  ].join(' ')}
                                  title={isRepaired ? `Calculé automatiquement : ${String(val ?? '')}` : String(val ?? '')}
                                >
                                  {cellErr
                                    ? <span className="flex items-center gap-1 text-amber-400"><AlertCircle className="h-3 w-3 shrink-0" />Manquant</span>
                                    : isSkipped && val == null
                                      ? <span className="text-slate-600 font-mono">—</span>
                                      : isRepaired
                                        ? <span className="flex items-center gap-1"><Sparkles className="h-2.5 w-2.5 shrink-0 text-emerald-400" />{fmtVal(val, col.type)}</span>
                                        : fmtVal(val, col.type)
                                  }
                                </td>
                              );
                            })}
                            <td className="px-2 py-2">
                              <button
                                onClick={() => setEditingRow(isActive ? null : row)}
                                className={`h-6 w-6 flex items-center justify-center rounded-md transition-colors
                                  ${isActive ? 'bg-amber-500/20 text-amber-400' : 'text-slate-600 hover:text-amber-400 hover:bg-amber-500/10'}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] shrink-0 bg-[#0d1018]">
                  <span className="text-[11px] text-slate-600">
                    {filteredRows.length.toLocaleString('fr-FR')} ligne{filteredRows.length > 1 ? 's' : ''}
                    {filteredRows.length !== allRows.length && ` / ${allRows.length.toLocaleString('fr-FR')}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] text-slate-400 px-2 tabular-nums">{page} / {totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="h-6 w-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Edit panel — slide in from right */}
              {editingRow && (
                <EditPanel
                  row={editingRow}
                  onSave={updated => {
                    updateRow(updated._rowIndex, updated);
                    setEditingRow(updated);
                  }}
                  onClose={() => setEditingRow(null)}
                />
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Manual conflict resolver — rendered outside DialogContent to escape overflow:hidden */}
      {manualResolverOpen && manualGroups.length > 0 && (
        <ManualConflictResolver
          groups={manualGroups}
          dupAnalysis={dupAnalysis}
          onConfirm={handleManualResolve}
          onClose={() => setManualResolverOpen(false)}
        />
      )}
    </Dialog>
  );
}
