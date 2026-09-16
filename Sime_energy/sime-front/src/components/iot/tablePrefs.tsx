// ============================================================================
// Préférences d'affichage des tableaux du module IOT
// ----------------------------------------------------------------------------
// Deux réglages globaux, mémorisés dans le navigateur :
//   - fit     : 'fit'  → le tableau tient dans la largeur disponible (texte tronqué)
//               'scroll' → largeurs confortables, défilement latéral dans le cadre
//   - density : 'comfort' | 'compact' (police + marges des cellules)
// Ils sont posés en attributs data-* sur le conteneur du module (IOT.tsx) et
// appliqués par CSS à tous les <table class="min-w-full"> (voir index.css,
// section "Tableaux IOT"). Aucun tableau n'a à être modifié individuellement.
// ============================================================================
import {
  createContext, useContext, useEffect, useLayoutEffect, useState,
  type ReactNode, type RefObject,
} from 'react';
import { MoveHorizontal, Maximize2, Rows3, Rows4 } from 'lucide-react';

export type TableFit = 'fit' | 'scroll';
export type TableDensity = 'comfort' | 'compact';

interface TablePrefs { fit: TableFit; density: TableDensity }
interface TablePrefsCtx extends TablePrefs {
  setFit: (v: TableFit) => void;
  setDensity: (v: TableDensity) => void;
}

const STORAGE_KEY = 'sime-iot-table-prefs';
const DEFAULTS: TablePrefs = { fit: 'fit', density: 'comfort' };

function load(): TablePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<TablePrefs>;
    return {
      fit:     p.fit === 'scroll' ? 'scroll' : 'fit',
      density: p.density === 'compact' ? 'compact' : 'comfort',
    };
  } catch { return DEFAULTS; }
}

const Ctx = createContext<TablePrefsCtx>({ ...DEFAULTS, setFit: () => {}, setDensity: () => {} });

export function TablePrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<TablePrefs>(load);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* quota / navigation privée */ }
  }, [prefs]);
  return (
    <Ctx.Provider value={{
      ...prefs,
      setFit:     fit     => setPrefs(p => ({ ...p, fit })),
      setDensity: density => setPrefs(p => ({ ...p, density })),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTablePrefs = () => useContext(Ctx);

// ---- Sélecteur (2 groupes de boutons) ----
function Seg<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void;
  options: { v: T; label: string; icon: typeof Rows3; title: string }[];
}) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
      {options.map(o => {
        const Icon = o.icon;
        const active = o.v === value;
        return (
          <button key={o.v} type="button" title={o.title} onClick={() => onChange(o.v)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TableDisplayToggle() {
  const { fit, density, setFit, setDensity } = useTablePrefs();
  return (
    <div className="flex items-center gap-2">
      <Seg value={fit} onChange={setFit} options={[
        { v: 'fit',    label: 'Ajuster', icon: Maximize2,      title: 'Ajuster les colonnes à la largeur de l\'écran' },
        { v: 'scroll', label: 'Défiler', icon: MoveHorizontal, title: 'Largeurs confortables, défilement latéral' },
      ]} />
      <Seg value={density} onChange={setDensity} options={[
        { v: 'comfort', label: 'Confort', icon: Rows3, title: 'Lignes aérées' },
        { v: 'compact', label: 'Compact', icon: Rows4, title: 'Lignes serrées : plus de colonnes visibles' },
      ]} />
    </div>
  );
}

// ---- Colonnes figées à gauche ----
// Fige les `count` premières cellules de chaque ligne du <table> contenu dans
// `ref` (position sticky). Les décalages `left` sont mesurés sur l'en-tête et
// recalculés à chaque rendu et à chaque redimensionnement.
export function usePinnedColumns(ref: RefObject<HTMLElement>, count: number) {
  useLayoutEffect(() => {
    const table = ref.current?.querySelector('table');
    const head  = table?.tHead?.rows[0];
    if (!table || !head) return;

    const apply = () => {
      const lefts: number[] = [];
      let acc = 0;
      for (let i = 0; i < count && i < head.cells.length; i++) {
        lefts.push(acc);
        acc += head.cells[i].getBoundingClientRect().width;
      }
      const rows = [head, ...Array.from(table.tBodies[0]?.rows ?? [])];
      for (const row of rows) {
        for (let i = 0; i < lefts.length && i < row.cells.length; i++) {
          const c = row.cells[i];
          c.classList.add('iot-pinned');
          c.classList.toggle('iot-pinned-last', i === lefts.length - 1);
          c.style.left = `${lefts[i]}px`;
        }
      }
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(table);
    return () => ro.disconnect();
  });
}
