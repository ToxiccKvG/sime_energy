// ============================================================
// IOT MODULE — Onglet Stockage
// Bibliothèque centrale des fichiers importés
// ============================================================

import { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet, Trash2, Eraser, BarChart2,
  Upload, Clock, Rows3, CheckCircle2, AlertCircle, HardDrive,
  Pencil, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useIOT } from './IOTContext';
import type { ImportedFile } from './shared';

// ---- Helpers ----
function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(d));
  } catch {
    return '—';
  }
}

const STATUT_COLORS: Record<string, string> = {
  original: 'bg-slate-500/20 text-slate-400',
  nettoyé:  'bg-green-500/20 text-green-400',
  analysé:  'bg-blue-500/20 text-blue-400',
};

const TYPE_COLORS: Record<string, string> = {
  shelly:      'bg-yellow-500/20 text-yellow-400',
  facturation: 'bg-purple-500/20 text-purple-400',
  autre:       'bg-slate-500/20 text-slate-400',
};

// ---- Carte fichier ----
function FichierCard({
  file,
  onDelete,
  onRename,
  onOpenNettoyage,
  onOpenTCD,
}: {
  file: ImportedFile;
  onDelete: () => void;
  onRename: (newName: string) => void;
  onOpenNettoyage: () => void;
  onOpenTCD: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const statut = file.statut ?? 'original';

  useEffect(() => {
    if (editingName && inputRef.current) {
      inputRef.current.focus();
      // Sélectionne tout sauf l'extension pour faciliter l'édition
      const dotIdx = file.name.lastIndexOf('.');
      if (dotIdx > 0) inputRef.current.setSelectionRange(0, dotIdx);
      else inputRef.current.select();
    }
  }, [editingName, file.name]);

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== file.name) onRename(trimmed);
    else setDraftName(file.name);
    setEditingName(false);
  };
  const cancelRename = () => {
    setDraftName(file.name);
    setEditingName(false);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/3 hover:border-white/20 transition-all p-4 space-y-3">
      {/* En-tête */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                }}
                onBlur={commitRename}
                className="h-7 text-sm bg-white/10 border-white/20 text-white"
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-400 hover:bg-green-500/10"
                onMouseDown={(e) => e.preventDefault()} onClick={commitRename}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:bg-white/10"
                onMouseDown={(e) => e.preventDefault()} onClick={cancelRename}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 group">
              <p className="text-white font-semibold text-sm truncate" title={file.name}>{file.name}</p>
              <button
                onClick={() => { setDraftName(file.name); setEditingName(true); }}
                className="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Renommer"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge className={`text-[10px] border-0 px-1.5 py-0 ${TYPE_COLORS[file.type] ?? TYPE_COLORS.autre}`}>
              {file.type}
            </Badge>
            <Badge className={`text-[10px] border-0 px-1.5 py-0 ${STATUT_COLORS[statut]}`}>
              {statut === 'original' && <AlertCircle className="h-2.5 w-2.5 mr-0.5 inline" />}
              {statut !== 'original' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" />}
              {statut}
            </Badge>
          </div>
        </div>
      </div>

      {/* Métadonnées */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Rows3 className="h-3 w-3 shrink-0" />
          <span>{file.rowCount.toLocaleString('fr-FR')} lignes</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <HardDrive className="h-3 w-3 shrink-0" />
          <span>{formatBytes(file.taille)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">{formatDate(file.uploadedAt)}</span>
        </div>
      </div>

      {/* Colonnes */}
      {file.columns.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {file.columns.slice(0, 6).map(col => (
            <span key={col} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-mono">
              {col}
            </span>
          ))}
          {file.columns.length > 6 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-600">
              +{file.columns.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
        <Button size="sm" variant="ghost"
          className="h-7 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1.5"
          onClick={onOpenNettoyage}>
          <Eraser className="h-3.5 w-3.5" />
          Nettoyer
        </Button>
        <Button size="sm" variant="ghost"
          className="h-7 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1.5"
          onClick={onOpenTCD}>
          <BarChart2 className="h-3.5 w-3.5" />
          Analyse
        </Button>
        <div className="flex-1" />
        {showConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-red-400">Confirmer ?</span>
            <Button size="sm" variant="ghost"
              className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={onDelete}>Oui</Button>
            <Button size="sm" variant="ghost"
              className="h-6 px-2 text-xs text-slate-400 hover:bg-white/10"
              onClick={() => setShowConfirm(false)}>Non</Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost"
            className="h-7 w-7 p-0 text-slate-600 hover:text-red-400 hover:bg-red-500/10"
            onClick={() => setShowConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Onglet Stockage
// ============================================================
export function StockageTab() {
  const { state, removeFile, updateFile, setSelectedFile, setActiveTab } = useIOT();
  const { files } = state;
  const [filter, setFilter] = useState<'tous' | 'shelly' | 'facturation' | 'nettoyé'>('tous');

  const filtered = files.filter(f => {
    if (filter === 'shelly')      return f.type === 'shelly';
    if (filter === 'facturation') return f.type === 'facturation';
    if (filter === 'nettoyé')     return f.statut === 'nettoyé';
    return true;
  });

  const openInTab = (fileId: string, tab: string) => {
    setSelectedFile(fileId);
    setActiveTab(tab);
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-3 text-sm text-slate-400">
          <span><span className="text-white font-bold">{files.length}</span> fichier(s)</span>
          <span><span className="text-yellow-400 font-bold">{files.filter(f => f.type === 'shelly').length}</span> Shelly</span>
          <span><span className="text-green-400 font-bold">{files.filter(f => f.statut === 'nettoyé').length}</span> nettoyé(s)</span>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white"
          onClick={() => document.getElementById('iot-drop-zone')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <Upload className="h-4 w-4 mr-1" /> Importer un fichier
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-lg border border-white/10 w-fit">
        {(['tous', 'shelly', 'facturation', 'nettoyé'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Grille de fichiers */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <HardDrive className="h-14 w-14 opacity-20 mb-4" />
          <p className="text-base font-medium">
            {files.length === 0 ? 'Aucun fichier stocké' : 'Aucun fichier pour ce filtre'}
          </p>
          {files.length === 0 && (
            <>
              <p className="text-sm mt-1 text-slate-600">Importez un fichier via la zone de dépôt au-dessus</p>
              <Button className="mt-4 bg-blue-600 hover:bg-blue-500 text-white" size="sm"
                onClick={() => document.getElementById('iot-drop-zone')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <Upload className="h-4 w-4 mr-1" /> Aller à la zone de dépôt
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(file => (
            <FichierCard
              key={file.id}
              file={file}
              onDelete={() => removeFile(file.id)}
              onRename={(newName) => updateFile(file.id, { name: newName })}
              onOpenNettoyage={() => openInTab(file.id, 'nettoyage')}
              onOpenTCD={() => openInTab(file.id, 'tcd')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
