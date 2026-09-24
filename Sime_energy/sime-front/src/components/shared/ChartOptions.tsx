// ============================================================
// Réglages de graphique — barre commune aux modules IOT et Mesures
//
// Un seul endroit pour : la palette de couleurs, l'affichage des
// légendes et le titre du graphique. Les réglages valent pour les deux
// modules (lib/chart-preferences.ts) ; le titre est propre au graphique
// désigné par `chartId`.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Palette as PaletteIcon, Tags, Pencil, Check, X, RotateCcw, Ruler } from 'lucide-react';
import {
  PALETTES, useChartPreferences, usePalette, setPalette, setShowLegend, setChartTitle, chartTitle,
  type PaletteId,
} from '@/lib/chart-preferences';
import {
  availablePrefixes, setUnitMode, setUnitPrefix, useUnitSettings,
  type UnitPrefix,
} from '@/lib/unit-format';

interface ChartOptionsProps {
  /** Identifiant stable du graphique, ex. « mesures:courbe » — porte le titre personnalisé. */
  chartId: string;
  /** Titre calculé, utilisé tant que l'utilisateur n'en a pas saisi un. */
  defaultTitle: string;
  /** Masquer le champ de titre (graphique sans en-tête propre). */
  hideTitle?: boolean;
  /** Unité de la grandeur affichée — active le réglage d'écriture des valeurs. */
  unit?: string;
  className?: string;
}

export function ChartOptions({ chartId, defaultTitle, hideTitle = false, unit, className = '' }: ChartOptionsProps) {
  const prefs = useChartPreferences();
  const active = usePalette();
  const units = useUnitSettings();
  const prefixes = availablePrefixes(unit ?? '');
  const [open, setOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // Fermer les sélecteurs au clic extérieur — sinon ils restent ouverts sur le graphique.
  useEffect(() => {
    if (!open && !unitOpen) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setUnitOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, unitOpen]);

  const current = chartTitle(prefs, chartId, defaultTitle);
  const isCustom = !!prefs.titles[chartId];

  const commit = () => { setChartTitle(chartId, draft); setEditing(false); };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} ref={boxRef}>
      {!hideTitle && (
        editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
              placeholder={defaultTitle}
              className="h-7 w-56 px-2 rounded-md bg-white/5 border border-blue-500/50 text-white text-xs"
            />
            <button onClick={commit} title="Valider" className="text-emerald-400 hover:text-emerald-300">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditing(false)} title="Annuler" className="text-slate-500 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
            {isCustom && (
              <button
                onClick={() => { setChartTitle(chartId, ''); setEditing(false); }}
                title="Revenir au titre automatique"
                className="text-slate-500 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={() => { setDraft(isCustom ? current : ''); setEditing(true); }}
            title="Renommer ce graphique"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Titre
          </button>
        )
      )}

      <button
        onClick={() => setShowLegend(!prefs.showLegend)}
        title={prefs.showLegend ? 'Masquer les légendes' : 'Afficher les légendes'}
        className={`flex items-center gap-1.5 text-xs transition-colors ${
          prefs.showLegend ? 'text-blue-400 hover:text-blue-300' : 'text-slate-500 hover:text-white'
        }`}
      >
        <Tags className="h-3.5 w-3.5" />
        Légendes
      </button>

      {prefixes.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setUnitOpen(o => !o)}
            title="Choisir comment les valeurs sont écrites"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <Ruler className="h-3.5 w-3.5" />
            {units.mode === 'raw' ? prefixes[0].label
              : units.mode === 'forced' ? (prefixes.find(p => p.value === units.prefix)?.label ?? prefixes[0].label)
              : 'Auto'}
          </button>
          {unitOpen && (
            <div className="absolute right-0 top-7 z-50 w-64 rounded-lg border border-white/10 bg-[#0f111a] p-2 shadow-xl">
              <p className="text-[11px] text-slate-500 px-1.5 pb-1.5">
                Change l'écriture des valeurs, pas les données. Les exports CSV gardent les nombres bruts.
              </p>
              <button
                onClick={() => { setUnitMode('auto'); setUnitOpen(false); }}
                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${units.mode === 'auto' ? 'bg-blue-500/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <span className="text-xs">Automatique</span>
                <span className="block text-[11px] text-slate-500">Passe en k au-delà de 1 000, en M au-delà d'un million.</span>
              </button>
              <button
                onClick={() => { setUnitMode('raw'); setUnitOpen(false); }}
                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${units.mode === 'raw' ? 'bg-blue-500/15 text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                <span className="text-xs">Unité du fichier ({prefixes[0].label})</span>
                <span className="block text-[11px] text-slate-500">Jamais de multiple — pour comparer des chiffres bruts.</span>
              </button>
              <p className="text-[11px] text-slate-500 px-2 pt-1.5 pb-0.5">Imposer un multiple</p>
              <div className="flex gap-1 px-1 pb-1">
                {prefixes.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { setUnitPrefix(p.value as UnitPrefix); setUnitOpen(false); }}
                    className={`flex-1 px-2 py-1 rounded-md text-xs transition-colors ${units.mode === 'forced' && units.prefix === p.value ? 'bg-blue-500/25 text-white' : 'text-slate-300 hover:bg-white/5'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          title="Choisir la palette de couleurs"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <PaletteIcon className="h-3.5 w-3.5" />
          {active.label}
          <span className="flex items-center gap-0.5 ml-0.5">
            {active.colors.slice(0, 4).map(c => (
              <span key={c} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </span>
        </button>

        {open && (
          <div className="absolute right-0 top-7 z-50 w-72 rounded-lg border border-white/10 bg-[#0f111a] p-2 shadow-xl">
            <p className="text-[11px] text-slate-500 px-1.5 pb-1.5">
              La palette s'applique à tous les graphiques, dans IOT comme dans Mesures.
            </p>
            {PALETTES.map(p => (
              <button
                key={p.id}
                onClick={() => { setPalette(p.id as PaletteId); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${
                  p.id === active.id ? 'bg-blue-500/15' : 'hover:bg-white/5'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-xs ${p.id === active.id ? 'text-white' : 'text-slate-300'}`}>{p.label}</span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    {p.colors.slice(0, 6).map(c => (
                      <span key={c} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{p.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
