// ============================================================
// Couleur par donnée + dégradé des cartes de chaleur
//
// Demande du 20/10 : laisser la personne choisir la couleur de chaque
// donnée affichée, et proposer des palettes de contraste. Le choix est
// mémorisé par donnée (lib/chart-preferences) et vaut pour tous les
// graphiques où cette donnée apparaît.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { Droplet, RotateCcw } from 'lucide-react';
import {
  ECHELLES_CHALEUR, setEchelleChaleur, setSeriesColor, stopsChaleur, useChartPreferences, usePalette,
} from '@/lib/chart-preferences';

export interface DonneeCouleur {
  /** Clé sous laquelle la couleur est mémorisée. */
  key: string;
  label: string;
  /** Couleur affichée actuellement (choisie ou palette). */
  color: string;
}

interface CouleursDonneesProps {
  donnees: DonneeCouleur[];
  /** Afficher le choix du dégradé (vue carte de chaleur). */
  chaleur?: boolean;
}

export function CouleursDonnees({ donnees, chaleur = false }: CouleursDonneesProps) {
  const prefs = useChartPreferences();
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (donnees.length === 0 && !chaleur) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Choisir la couleur de chaque donnée"
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
      >
        <Droplet className="h-3.5 w-3.5" />
        Couleurs
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-lg border border-white/10 bg-[#0f111a] p-2 shadow-xl space-y-2">
          {donnees.length > 0 && (
            <div>
              <p className="text-[0.6875rem] text-slate-500 px-1.5 pb-1.5">
                La couleur choisie suit la donnée dans tous les graphiques.
              </p>
              {donnees.map(d => {
                const choisie = d.key in prefs.seriesColors;
                return (
                  <div key={d.key} className="px-1.5 py-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={d.color}
                        onChange={e => setSeriesColor(d.key, e.target.value)}
                        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0"
                        title="Couleur libre"
                      />
                      <span className="flex-1 truncate text-xs text-slate-200" title={d.label}>{d.label}</span>
                      {choisie && (
                        <button onClick={() => setSeriesColor(d.key, '')} title="Revenir à la couleur de la palette"
                          className="text-slate-500 hover:text-white">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Teintes de la palette active : choix rapide et contrasté */}
                    <div className="flex gap-1 pl-10">
                      {palette.colors.map(c => (
                        <button key={c} onClick={() => setSeriesColor(d.key, c)} title={c}
                          className={`h-3.5 w-3.5 rounded-sm ${c.toLowerCase() === d.color.toLowerCase() ? 'ring-2 ring-white' : ''}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {chaleur && (
            <div className="border-t border-white/10 pt-2">
              <p className="text-[0.6875rem] text-slate-500 px-1.5 pb-1.5">Dégradé de la carte de chaleur</p>
              {ECHELLES_CHALEUR.map(e => {
                const stops = stopsChaleur({ ...prefs, echelleChaleur: e.id }, palette, donnees[0]?.color ?? palette.colors[0]);
                const actif = prefs.echelleChaleur === e.id;
                return (
                  <button key={e.id} onClick={() => setEchelleChaleur(e.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md transition-colors ${actif ? 'bg-blue-500/15' : 'hover:bg-white/5'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-xs ${actif ? 'text-white' : 'text-slate-300'}`}>{e.label}</span>
                      <span className="h-2.5 w-20 shrink-0 rounded-full" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
                    </span>
                    <span className="block text-[0.6875rem] text-slate-500 mt-0.5">{e.hint}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
