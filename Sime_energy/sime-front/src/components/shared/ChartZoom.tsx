// ============================================================
// Agrandir un graphique — commun aux modules IOT et Mesures
//
// Demande du manager (12/10) : voir un graphique SEUL, en grand, sur
// fond blanc (lecture, présentation, impression). Le bouton « Agrandir »
// ouvre le même graphique en plein écran : ce n'est pas une image, on
// garde le survol et les valeurs. Les couleurs claires (fond, axes,
// textes) sont imposées par la classe .chart-zoom (index.css), ce qui
// évite de reprendre chaque graphique un par un.
//
// Les courbes (ResponsiveContainer) prennent la hauteur de l'écran via
// index.css ; les graphiques à taille fixe (camembert) lisent
// useChartZoomed() pour se dessiner en grand.
// ============================================================

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';

const ChartZoomContext = createContext(false);

/** Vrai quand le composant est dessiné dans la vue agrandie. */
export function useChartZoomed(): boolean {
  return useContext(ChartZoomContext);
}

interface ChartZoomProps {
  /** Titre affiché en haut de la vue agrandie. */
  title: string;
  children: ReactNode;
  className?: string;
}

export function ChartZoom({ title, children, className = '' }: ChartZoomProps) {
  const [open, setOpen] = useState(false);

  // Échap ferme la vue ; la page derrière ne défile pas tant qu'elle est ouverte.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-no-export
        title="Agrandir le graphique (fond blanc)"
        className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border border-white/10 bg-[#0f111a]/80 px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
      >
        <Maximize2 className="h-3.5 w-3.5" /> Agrandir
      </button>
      {children}

      {open && (
        <div className="chart-zoom fixed inset-0 z-[60] flex flex-col bg-white text-slate-800" role="dialog" aria-modal="true" aria-label={title}>
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              <X className="h-4 w-4" /> Fermer <span className="text-xs text-slate-400">(Échap)</span>
            </button>
          </div>
          <div className="chart-zoom-body min-h-0 flex-1 overflow-auto p-6">
            <ChartZoomContext.Provider value={true}>{children}</ChartZoomContext.Provider>
          </div>
        </div>
      )}
    </div>
  );
}
