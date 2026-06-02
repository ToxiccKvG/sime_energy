import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Search, FileSpreadsheet, TableProperties, GripVertical, ChevronUp, ChevronDown, ListOrdered, Calculator } from 'lucide-react';
import type { AuditInvoice } from '@/lib/invoice-service';
import { SENELEC_DICTIONARY } from '@/types/annotation-dictionary';
import { COMPUTED_COLUMNS } from '@/lib/export-service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldInfo {
  key: string;
  label: string;       // human label from dictionary, or raw key
  exampleValue: string;
  count: number;       // how many invoices have this field
  total: number;       // total invoices
  isRecognized: boolean;
  isRequired: boolean;
  isComputed?: boolean; // champ calculé (tranches, IPR, K2%…)
  source: 'verified' | 'raw'; // comes from ocr_data_verified or ocr_data
}

export interface ExportConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: AuditInvoice[];
  /** Reçoit les colonnes dans l'ordre souhaité par l'utilisateur */
  onExport: (orderedFields: string[]) => void;
  isExporting: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s*:\s*$/, '')
    .replace(/[°º()[\],.%²¹³'"`/]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrait les lignes de tables brutes OCR comme paires [clé, valeur].
 * Même logique robuste que extractTableKV dans export-service :
 * gère les lignes à 2 colonnes, 3 colonnes avec colonne vide centrale,
 * et les cellules "None" (artefact Python).
 */
function extractTablePairs(ocr_data: unknown): Array<[string, string]> {
  if (!ocr_data || typeof ocr_data !== 'object') return [];
  const d = ocr_data as Record<string, unknown>;

  type PageEntry = { tables?: unknown[] };
  const pageArr = Array.isArray(d.pages)
    ? (d.pages as PageEntry[])
    : Array.isArray(d.page)
      ? (d.page as PageEntry[])
      : null;

  const rawTables: unknown[] =
    pageArr && pageArr[0] && Array.isArray(pageArr[0].tables)
      ? pageArr[0].tables!
      : Array.isArray(d.tables)
        ? (d.tables as unknown[])
        : [];

  const cellText = (c: unknown): string => {
    if (!c || typeof c !== 'object') return '';
    const t = String((c as Record<string, unknown>).text ?? '').trim();
    return t === 'None' ? '' : t;
  };

  const pairs: Array<[string, string]> = [];
  for (const tbl of rawTables) {
    if (!tbl || typeof tbl !== 'object') continue;
    const tblObj = tbl as Record<string, unknown>;
    if (!Array.isArray(tblObj.rows)) continue;
    for (const row of tblObj.rows as unknown[][]) {
      if (!Array.isArray(row)) continue;
      const nonEmpty = row.map(cellText).filter(Boolean);
      if (nonEmpty.length < 2) continue;
      const key   = nonEmpty[0];
      const value = nonEmpty[nonEmpty.length - 1];
      if (key && value && key !== value) {
        pairs.push([key, value]);
      }
    }
  }
  return pairs;
}

function collectFields(invoices: AuditInvoice[]): FieldInfo[] {
  // mapKey → { exampleValue, count, source }
  // For recognized fields: mapKey = dictField.key (deduplicates aliases)
  // For unrecognized: mapKey = raw OCR key
  const map = new Map<string, { exampleValue: string; count: number; source: 'verified' | 'raw' }>();

  for (const invoice of invoices) {
    let entries: Array<[string, string]> = [];
    let source: 'verified' | 'raw' = 'raw';

    // Priority 1: ocr_data_verified.unifiedData
    const verified = (invoice.ocr_data_verified as Record<string, unknown> | undefined);
    if (verified?.unifiedData && typeof verified.unifiedData === 'object') {
      entries = Object.entries(verified.unifiedData as Record<string, unknown>).map(
        ([k, v]) => [k, v != null ? String(v) : ''] as [string, string],
      );
      source = 'verified';
    }

    // Priority 2: raw Textract key-value forms — handle 'page' (singular) and 'pages' (plural)
    if (entries.length === 0 && invoice.ocr_data) {
      const d = invoice.ocr_data as Record<string, unknown>;
      let forms: Array<{ Key: string; Value: unknown }> = [];
      const pageArr = Array.isArray(d.pages)
        ? (d.pages as Array<{ forms?: Array<{ Key: string; Value: unknown }> }>)
        : Array.isArray(d.page)
          ? (d.page as Array<{ forms?: Array<{ Key: string; Value: unknown }> }>)
          : null;
      if (pageArr && pageArr[0]?.forms) forms = pageArr[0].forms;
      else if (Array.isArray(d.forms)) forms = d.forms as Array<{ Key: string; Value: unknown }>;
      entries = forms.map((f) => [f.Key, f.Value != null ? String(f.Value) : ''] as [string, string]);
    }

    // Complement with 2-column table rows (do not overwrite existing entries)
    if (invoice.ocr_data) {
      const existingKeys = new Set(entries.map(([k]) => k));
      for (const [k, v] of extractTablePairs(invoice.ocr_data)) {
        if (!existingKeys.has(k)) {
          entries.push([k, v]);
          existingKeys.add(k);
        }
      }
    }

    // Track which dict fields we've already counted for this invoice (avoid double-counting aliases)
    const seenDictKeys = new Set<string>();

    for (const [rawKey, value] of entries) {
      if (!rawKey?.trim()) continue;
      const nk = normalizeKey(rawKey);
      const dictField = SENELEC_DICTIONARY.fields.find(
        (f) =>
          normalizeKey(f.key) === nk ||
          (f.aliases ?? []).some((a) => normalizeKey(a) === nk),
      );
      // Use dict field key for recognized fields, raw key for unrecognized
      const mapKey = dictField ? dictField.key : rawKey;

      // Don't count the same dict field twice per invoice (multiple aliases on one invoice)
      if (dictField && seenDictKeys.has(mapKey)) continue;
      if (dictField) seenDictKeys.add(mapKey);

      const existing = map.get(mapKey);
      if (existing) {
        existing.count++;
        if (!existing.exampleValue && value) existing.exampleValue = value;
        if (source === 'verified') existing.source = 'verified';
      } else {
        map.set(mapKey, { exampleValue: value || '', count: 1, source });
      }
    }
  }

  const total = invoices.length;
  const result: FieldInfo[] = [];

  for (const [mapKey, info] of map.entries()) {
    const dictField = SENELEC_DICTIONARY.fields.find((f) => f.key === mapKey);

    result.push({
      key: mapKey,           // dict field key for recognized, raw key for unrecognized
      label: mapKey,         // same — dict key IS human-readable
      exampleValue: info.exampleValue,
      count: info.count,
      total,
      isRecognized: !!dictField,
      isRequired: dictField?.required ?? false,
      source: info.source,
    });
  }

  // Sort: required → recognized → coverage desc → alpha
  return result.sort((a, b) => {
    if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
    if (a.isRecognized !== b.isRecognized) return a.isRecognized ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExportConfigDialog({
  open,
  onOpenChange,
  invoices,
  onExport,
  isExporting,
}: ExportConfigDialogProps) {
  const fields = useMemo(() => collectFields(invoices), [invoices]);

  const defaultSelected = useMemo(
    () => new Set([
      ...fields.filter((f) => f.isRecognized || f.isRequired).map((f) => f.key),
      ...COMPUTED_COLUMNS,
    ]),
    [fields],
  );

  const [selected, setSelected] = useState<Set<string>>(defaultSelected);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'selection' | 'ordre'>('selection');
  // columnOrder mirrors selected fields in user-defined order
  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  // Build initial column order: recognized OCR fields first, then computed
  const defaultOrder = useMemo(
    () => [
      ...fields.filter((f) => f.isRecognized || f.isRequired).map((f) => f.key),
      ...COMPUTED_COLUMNS,
    ],
    [fields],
  );

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelected(defaultSelected);
      setSearch('');
      setColumnOrder(defaultOrder);
      setActiveTab('selection');
    }
  }, [open, defaultSelected, defaultOrder]);

  // Keep columnOrder in sync with selection changes
  const toggle = (key: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
        setColumnOrder((o) => o.filter((k) => k !== key));
      } else {
        n.add(key);
        setColumnOrder((o) => [...o, key]);
      }
      return n;
    });
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setColumnOrder((o) => {
      const n = [...o];
      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
      return n;
    });
  };

  const moveDown = (idx: number) => {
    setColumnOrder((o) => {
      if (idx >= o.length - 1) return o;
      const n = [...o];
      [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
      return n;
    });
  };

  const filtered = search.trim()
    ? fields.filter(
        (f) =>
          f.label.toLowerCase().includes(search.toLowerCase()) ||
          f.key.toLowerCase().includes(search.toLowerCase()) ||
          f.exampleValue.toLowerCase().includes(search.toLowerCase()),
      )
    : fields;

  const selectAll = () => {
    const ocrKeys = fields.map((f) => f.key);
    const allKeys = [...ocrKeys, ...COMPUTED_COLUMNS];
    setSelected(new Set(allKeys));
    setColumnOrder((prev) => {
      const existingSet = new Set(prev);
      return [...prev, ...allKeys.filter((k) => !existingSet.has(k))];
    });
  };
  const selectNone = () => { setSelected(new Set()); setColumnOrder([]); };
  const selectRecommended = () => {
    const ocrKeys = fields.filter((f) => f.isRecognized).map((f) => f.key);
    const keys = [...ocrKeys, ...COMPUTED_COLUMNS];
    setSelected(new Set(keys));
    setColumnOrder(keys);
  };

  const verifiedCount = invoices.filter(
    (inv) => (inv.ocr_data_verified as Record<string, unknown> | undefined)?.unifiedData,
  ).length;

  const recognizedCount = fields.filter((f) => f.isRecognized).length;
  const totalCount = fields.length + COMPUTED_COLUMNS.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 bg-[#0d0f1a] border border-white/10 rounded-2xl overflow-hidden flex flex-col max-h-[88vh]">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.07] bg-[#0a0c14] shrink-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-slate-100">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              </div>
              Configurer l'export Excel
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1">
              Sélectionnez les colonnes à inclure dans le fichier
            </p>
          </DialogHeader>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-xs text-slate-500">
              <span className="text-slate-300 font-semibold">{invoices.length}</span> facture{invoices.length > 1 ? 's' : ''}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-xs text-slate-500">
              <span className="text-slate-300 font-semibold">{totalCount}</span> champs disponibles
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-xs text-slate-500">
              <span className="text-amber-400 font-semibold">{selected.size}</span> sélectionnés
            </span>
            {verifiedCount > 0 && (
              <>
                <span className="text-slate-700">·</span>
                <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-normal">
                  {verifiedCount}/{invoices.length} données vérifiées
                </Badge>
              </>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setActiveTab('selection')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'selection'
                  ? 'bg-[#151825] text-slate-100 border border-white/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <TableProperties className="w-3 h-3" />
              Sélection
            </button>
            <button
              onClick={() => setActiveTab('ordre')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'ordre'
                  ? 'bg-[#151825] text-slate-100 border border-white/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <ListOrdered className="w-3 h-3" />
              Ordre des colonnes
              {selected.size > 0 && (
                <span className="ml-1 bg-amber-500/20 text-amber-300 text-[9px] font-mono px-1 py-0.5 rounded-full">
                  {selected.size}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'selection' && (
          <>
            {/* ── Controls ── */}
            <div className="px-6 py-3 border-b border-white/[0.05] bg-white/[0.01] shrink-0 space-y-3">
              {/* Quick selectors */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider mr-1">Sélection :</span>
                <button
                  onClick={selectAll}
                  className="text-xs px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/10 text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                >
                  Tout ({totalCount})
                </button>
                <button
                  onClick={selectRecommended}
                  className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/15 transition-colors"
                >
                  Reconnus ({recognizedCount})
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/10 text-slate-400 hover:bg-white/[0.08] transition-colors"
                >
                  Aucun
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  placeholder="Filtrer les champs…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white/[0.04] border-white/10 text-slate-200 placeholder:text-slate-600 focus-visible:ring-amber-500/30"
                />
              </div>
            </div>

            {/* ── Field list ── */}
            <div className="overflow-y-auto flex-1 px-2 py-2">
              {/* Recognized / required section */}
              {filtered.some((f) => f.isRecognized) && (
                <div className="mb-1">
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <TableProperties className="w-3 h-3 text-amber-500/60" />
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Champs reconnus ({filtered.filter((f) => f.isRecognized).length})
                    </span>
                  </div>
                  {filtered
                    .filter((f) => f.isRecognized)
                    .map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        checked={selected.has(field.key)}
                        onToggle={() => toggle(field.key)}
                      />
                    ))}
                </div>
              )}

              {/* Raw / unrecognized section */}
              {filtered.some((f) => !f.isRecognized) && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                      Autres champs bruts ({filtered.filter((f) => !f.isRecognized).length})
                    </span>
                  </div>
                  {filtered
                    .filter((f) => !f.isRecognized)
                    .map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        checked={selected.has(field.key)}
                        onToggle={() => toggle(field.key)}
                      />
                    ))}
                </div>
              )}

              {/* Section données calculées — sélectionnables */}
              {(!search.trim() || COMPUTED_COLUMNS.some((c) => c.toLowerCase().includes(search.toLowerCase()))) && (
                <div className="mt-3 border-t border-white/[0.05] pt-2">
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <Calculator className="w-3 h-3 text-blue-500/60" />
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Données calculées — tableau + indicateurs
                    </span>
                  </div>
                  {COMPUTED_COLUMNS
                    .filter((col) => !search.trim() || col.toLowerCase().includes(search.toLowerCase()))
                    .map((col) => (
                      <FieldRow
                        key={col}
                        field={{
                          key: col,
                          label: col,
                          exampleValue: '',
                          count: invoices.filter((inv) => inv.status === 'verified').length,
                          total: invoices.length,
                          isRecognized: true,
                          isRequired: false,
                          source: 'raw' as const,
                          isComputed: true,
                        }}
                        checked={selected.has(col)}
                        onToggle={() => toggle(col)}
                      />
                    ))}
                </div>
              )}

              {filtered.length === 0 && (
                <div className="text-center py-8 text-slate-600 text-sm">
                  Aucun champ trouvé pour « {search} »
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'ordre' && (
          <div className="overflow-y-auto flex-1 px-4 py-3">
            {columnOrder.length === 0 ? (
              <div className="text-center py-12 text-slate-600 text-sm">
                Aucun champ sélectionné — allez dans l'onglet Sélection
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[10px] text-slate-600 mb-3">
                  Tapez un numéro dans la case pour déplacer la colonne à cette position, ou utilisez les flèches.
                </p>
                {columnOrder.map((key, idx) => (
                  <OrderRow
                    key={key}
                    colKey={key}
                    idx={idx}
                    total={columnOrder.length}
                    onMoveUp={() => moveUp(idx)}
                    onMoveDown={() => moveDown(idx)}
                    onMoveTo={(target) => {
                      setColumnOrder((o) => {
                        const n = [...o];
                        n.splice(idx, 1);
                        n.splice(target, 0, key);
                        return n;
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="px-6 pb-5 pt-3 border-t border-white/[0.07] flex items-center justify-between shrink-0 bg-[#0a0c14]">
          <p className="text-xs text-slate-500">
            {selected.size === 0
              ? 'Aucune colonne sélectionnée'
              : `${selected.size} colonne${selected.size > 1 ? 's' : ''} · ~${invoices.length} ligne${invoices.length > 1 ? 's' : ''}`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
              className="text-slate-400 hover:text-slate-100 border border-white/10 h-9"
            >
              Annuler
            </Button>
            <Button
              onClick={() => onExport(columnOrder.length > 0 ? columnOrder : Array.from(selected))}
              disabled={isExporting || selected.size === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-9 min-w-[140px]"
            >
              {isExporting ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Export…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Exporter Excel
                </span>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Row ───────────────────────────────────────────────────────────────

function OrderRow({
  colKey,
  idx,
  total,
  onMoveUp,
  onMoveDown,
  onMoveTo,
}: {
  colKey: string;
  idx: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveTo: (targetIdx: number) => void;
}) {
  const [inputVal, setInputVal] = useState(String(idx + 1));

  // Keep in sync when external reorder changes idx
  // (only sync if input not focused)
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isFocused = document.activeElement === inputRef.current;
  if (!isFocused && inputVal !== String(idx + 1)) {
    setInputVal(String(idx + 1));
  }

  const commit = () => {
    const n = parseInt(inputVal, 10);
    if (!isFinite(n)) { setInputVal(String(idx + 1)); return; }
    const clamped = Math.max(1, Math.min(total, n)) - 1;
    if (clamped !== idx) onMoveTo(clamped);
    setInputVal(String(clamped + 1));
  };

  return (
    <div className="flex items-center gap-2 bg-[#14161f] border border-white/[0.07] px-3 py-2 rounded-lg group">
      <GripVertical className="w-3.5 h-3.5 text-slate-700 shrink-0" />
      {/* Index input */}
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={total}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); } }}
        className="w-9 text-center text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md py-0.5 focus:outline-none focus:border-amber-500/50 focus:bg-amber-500/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shrink-0"
      />
      <span className="flex-1 text-xs text-slate-200 truncate">{colKey}</span>
      <div className="flex gap-0.5 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors"
        >
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={idx >= total - 1}
          className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  checked,
  onToggle,
}: {
  field: FieldInfo;
  checked: boolean;
  onToggle: () => void;
}) {
  const coverage = field.count / field.total;
  const coverageColor =
    coverage === 1 ? 'text-emerald-500' : coverage >= 0.6 ? 'text-amber-500' : 'text-slate-600';

  return (
    <button
      onClick={onToggle}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left
        transition-colors duration-100 group
        ${checked
          ? 'bg-white/[0.04] hover:bg-white/[0.06]'
          : 'hover:bg-white/[0.025]'}
      `}
    >
      {/* Checkbox */}
      <div className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border transition-colors ${
        checked
          ? 'bg-amber-500 border-amber-500'
          : 'border-white/20 bg-white/[0.03] group-hover:border-white/30'
      }`}>
        {checked && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-black" fill="none">
          <polyline points="1.5,6 4.5,9 10.5,3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium truncate ${
            field.isRecognized ? 'text-slate-200' : 'text-slate-400'
          }`}>
            {field.label}
          </span>
          {field.isRequired && (
            <span className="text-[9px] px-1.5 py-0 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 font-semibold shrink-0">
              REQUIS
            </span>
          )}
          {field.isComputed && (
            <span className="text-[9px] px-1.5 py-0 rounded bg-blue-500/10 text-blue-400/80 border border-blue-500/20 font-medium shrink-0">
              calculé
            </span>
          )}
          {field.source === 'verified' && !field.isRequired && !field.isComputed && (
            <span className="text-[9px] px-1.5 py-0 rounded bg-emerald-500/10 text-emerald-500/70 border border-emerald-500/15 shrink-0">
              vérifié
            </span>
          )}
        </div>
        {!field.isRecognized && !field.isComputed && (
          <p className="text-[10px] text-slate-600 font-mono truncate mt-0.5">{field.key}</p>
        )}
      </div>

      {/* Example value */}
      {field.exampleValue && (
        <span className="text-[10px] text-slate-500 font-mono truncate max-w-[110px] shrink-0 hidden sm:block">
          {field.exampleValue.length > 18 ? field.exampleValue.slice(0, 18) + '…' : field.exampleValue}
        </span>
      )}

      {/* Coverage — hide for computed (always "available") */}
      {!field.isComputed && (
        <span className={`text-[10px] font-mono shrink-0 ${coverageColor}`}>
          {field.count}/{field.total}
        </span>
      )}
    </button>
  );
}
