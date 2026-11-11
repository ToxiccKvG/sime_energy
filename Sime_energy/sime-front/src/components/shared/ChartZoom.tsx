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
// Partout par défaut : le ResponsiveContainer de ZoomableChart.tsx et
// PieOfPie posent ce bouton d'eux-mêmes ; un ChartZoom posé à la main
// sur une carte entière (vue Visualisation) empêche les graphiques
// qu'elle contient d'en ajouter un second (useInsideChartZoom).
//
// Les courbes (ResponsiveContainer) prennent la hauteur de l'écran via
// index.css ; les graphiques à taille fixe (camembert) lisent
// useChartZoomed() pour se dessiner en grand.
// ============================================================

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, X } from 'lucide-react';

const ChartZoomContext = createContext(false);
const ChartZoomScopeContext = createContext(false);

/** Vrai quand le composant est dessiné dans la vue agrandie. */
export function useChartZoomed(): boolean {
  return useContext(ChartZoomContext);
}

/** Vrai sous un ChartZoom (vue normale ou agrandie) : pas de second bouton « Agrandir ». */
export function useInsideChartZoom(): boolean {
  return useContext(ChartZoomScopeContext);
}

/** Titre visible au-dessus du graphique (titre de carte, en-tête), à défaut « Graphique ». */
function titleAbove(el: HTMLElement | null): string {
  let node = el?.parentElement ?? null;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    const candidates = node.querySelectorAll<HTMLElement>('h1, h2, h3, h4, p.font-semibold, p.font-medium, span.font-semibold');
    for (const c of candidates) {
      if (el?.contains(c)) continue;
      const text = c.textContent?.trim();
      if (text) return text.length > 120 ? `${text.slice(0, 117)}…` : text;
    }
  }
  return 'Graphique';
}

interface ChartZoomProps {
  /** Titre de la vue agrandie ; sans titre, on reprend celui affiché au-dessus du graphique. */
  title?: string;
  children: ReactNode;
  className?: string;
}

export function ChartZoom({ title, children, className = '' }: ChartZoomProps) {
  const [open, setOpen] = useState(false);
  const [autoTitle, setAutoTitle] = useState('Graphique');
  const boxRef = useRef<HTMLDivElement>(null);

  // Échap ferme la vue ; la page derrière ne défile pas tant qu'elle est ouverte.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open]);

  const openZoom = () => {
    if (!title) setAutoTitle(titleAbove(boxRef.current));
    setOpen(true);
  };
  const shownTitle = title ?? autoTitle;

  return (
    <ChartZoomScopeContext.Provider value={true}>
      <div ref={boxRef} className={`relative ${className}`}>
        <button
          type="button"
          onClick={openZoom}
          data-no-export
          title="Agrandir le graphique (fond blanc)"
          className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-md border border-white/10 bg-[#0f111a]/80 px-2 py-1 text-xs text-slate-300 opacity-70 hover:bg-white/10 hover:text-white hover:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Agrandir
        </button>
        {children}

        {open && (
          <div className="chart-zoom fixed inset-0 z-[60] flex flex-col bg-white text-slate-800" role="dialog" aria-modal="true" aria-label={shownTitle}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3">
              <h2 className="text-lg font-semibold text-slate-900">{shownTitle}</h2>
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
    </ChartZoomScopeContext.Provider>
  );
}
