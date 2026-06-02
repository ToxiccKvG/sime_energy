import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type {
  ImportedFile, ShellyRow, DonneesTechniques, JourFerie,
  Source, TimeSeriesRow, CalendrierSite,
} from './shared';
import { JOURS_FERIES_FIXES } from './shared';

// ---- Persistance localStorage ----
//
// Note : la couche facturation/tarification a été retirée — bump v1 → v2
// pour forcer un reset propre du state des utilisateurs existants.
const STORAGE_KEY = 'sime-iot-v2';

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
}

function saveToStorage(state: IOTState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[IOT] localStorage save failed', e);
  }
}

function loadFromStorage(): Partial<IOTState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw, dateReviver) as Partial<IOTState>;
  } catch {
    return null;
  }
}

// ---- State ----

interface IOTState {
  // Sources
  sources: Source[];
  sourceData: Record<string, TimeSeriesRow[]>;
  // Stockage (bibliothèque fichiers)
  files: ImportedFile[];
  selectedFileId: string | null;
  // Profil de charge / données Shelly
  shellyRows: ShellyRow[];
  // Données techniques (généralités, hors facturation)
  donneesTechniques: DonneesTechniques;
  // Calendrier
  joursFerier: JourFerie[];
  calendriers: CalendrierSite[];
  // Navigation
  activeTab: string;
}

const DEFAULT_DONNEES_TECHNIQUES: DonneesTechniques = {
  nJours: 31,
};

const DEFAULT_SOURCES: Source[] = [
  {
    id: 'src-senelec',
    nom: 'SENELEC',
    type: 'SENELEC',
    description: 'Réseau public SENELEC',
    couleur: '#3b82f6',
    capteur: 'Shelly',
    actif: true,
    ordre: 0,
  },
];

function buildJoursFerier(): JourFerie[] {
  const year = new Date().getFullYear();
  return JOURS_FERIES_FIXES.map(jf => ({
    date: new Date(year, jf.mois - 1, jf.jour),
    nom: jf.nom,
    type: 'férie' as const,
    actif: true,
  }));
}

const DEFAULT_CALENDRIER: CalendrierSite = {
  id: 'cal-default',
  nom: 'Site principal',
  semaine: {
    0: { actif: false, plages: [] },                                  // Dim
    1: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },  // Lun
    2: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    3: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    4: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    5: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    6: { actif: false, plages: [] },                                  // Sam
  },
  exceptions: [],
};

const initialState: IOTState = {
  sources: DEFAULT_SOURCES,
  sourceData: {},
  files: [],
  selectedFileId: null,
  shellyRows: [],
  donneesTechniques: DEFAULT_DONNEES_TECHNIQUES,
  joursFerier: buildJoursFerier(),
  calendriers: [DEFAULT_CALENDRIER],
  activeTab: 'dashboard',
};

// ---- Actions ----

type Action =
  // Sources
  | { type: 'ADD_SOURCE'; source: Source }
  | { type: 'UPDATE_SOURCE'; id: string; data: Partial<Source> }
  | { type: 'REMOVE_SOURCE'; id: string }
  | { type: 'REORDER_SOURCES'; ids: string[] }
  | { type: 'SET_SOURCE_DATA'; sourceId: string; rows: TimeSeriesRow[] }
  // Files / Shelly
  | { type: 'ADD_FILE'; file: ImportedFile }
  | { type: 'UPDATE_FILE'; id: string; data: Partial<ImportedFile> }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'SET_SELECTED_FILE'; id: string | null }
  | { type: 'SET_SHELLY_ROWS'; rows: ShellyRow[] }
  | { type: 'UPDATE_DONNEES_TECHNIQUES'; data: Partial<DonneesTechniques> }
  // Calendrier
  | { type: 'ADD_JOUR_FERIE'; jour: JourFerie }
  | { type: 'TOGGLE_JOUR_FERIE'; index: number }
  | { type: 'UPDATE_JOUR_FERIE'; index: number; data: Partial<JourFerie> }
  | { type: 'REMOVE_JOUR_FERIE'; index: number }
  | { type: 'SET_JOURS_FERIER'; jours: JourFerie[] }
  | { type: 'UPDATE_CALENDRIER'; id: string; data: Partial<CalendrierSite> }
  // Navigation
  | { type: 'SET_ACTIVE_TAB'; tab: string };

function reducer(state: IOTState, action: Action): IOTState {
  switch (action.type) {
    case 'ADD_SOURCE':
      return { ...state, sources: [...state.sources, action.source] };
    case 'UPDATE_SOURCE':
      return {
        ...state,
        sources: state.sources.map(s => s.id === action.id ? { ...s, ...action.data } : s),
      };
    case 'REMOVE_SOURCE':
      return { ...state, sources: state.sources.filter(s => s.id !== action.id) };
    case 'REORDER_SOURCES':
      return {
        ...state,
        sources: action.ids
          .map((id, i) => { const s = state.sources.find(x => x.id === id); return s ? { ...s, ordre: i } : null; })
          .filter(Boolean) as Source[],
      };
    case 'SET_SOURCE_DATA':
      return { ...state, sourceData: { ...state.sourceData, [action.sourceId]: action.rows } };
    case 'ADD_FILE':
      return { ...state, files: [...state.files, action.file] };
    case 'UPDATE_FILE':
      return { ...state, files: state.files.map(f => f.id === action.id ? { ...f, ...action.data } : f) };
    case 'REMOVE_FILE':
      return { ...state, files: state.files.filter(f => f.id !== action.id) };
    case 'SET_SELECTED_FILE':
      return { ...state, selectedFileId: action.id };
    case 'SET_SHELLY_ROWS':
      return { ...state, shellyRows: action.rows };
    case 'UPDATE_DONNEES_TECHNIQUES':
      return { ...state, donneesTechniques: { ...state.donneesTechniques, ...action.data } };
    case 'ADD_JOUR_FERIE':
      return { ...state, joursFerier: [...state.joursFerier, action.jour] };
    case 'TOGGLE_JOUR_FERIE':
      return {
        ...state,
        joursFerier: state.joursFerier.map((jf, i) =>
          i === action.index ? { ...jf, actif: !jf.actif } : jf
        ),
      };
    case 'UPDATE_JOUR_FERIE':
      return {
        ...state,
        joursFerier: state.joursFerier.map((jf, i) =>
          i === action.index ? { ...jf, ...action.data } : jf
        ),
      };
    case 'REMOVE_JOUR_FERIE':
      return { ...state, joursFerier: state.joursFerier.filter((_, i) => i !== action.index) };
    case 'SET_JOURS_FERIER':
      return { ...state, joursFerier: action.jours };
    case 'UPDATE_CALENDRIER':
      return {
        ...state,
        calendriers: state.calendriers.map(c =>
          c.id === action.id ? { ...c, ...action.data } : c
        ),
      };
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.tab };
    default:
      return state;
  }
}

// ---- Context ----

interface IOTContextValue {
  state: IOTState;
  // Sources
  addSource: (source: Source) => void;
  updateSource: (id: string, data: Partial<Source>) => void;
  removeSource: (id: string) => void;
  reorderSources: (ids: string[]) => void;
  setSourceData: (sourceId: string, rows: TimeSeriesRow[]) => void;
  // Stockage / Files
  addFile: (file: ImportedFile) => void;
  updateFile: (id: string, data: Partial<ImportedFile>) => void;
  removeFile: (id: string) => void;
  setSelectedFile: (id: string | null) => void;
  setShellyRows: (rows: ShellyRow[]) => void;
  updateDonneesTechniques: (data: Partial<DonneesTechniques>) => void;
  // Calendrier
  addJourFerie: (jour: JourFerie) => void;
  toggleJourFerie: (index: number) => void;
  updateJourFerie: (index: number, data: Partial<JourFerie>) => void;
  removeJourFerie: (index: number) => void;
  setJoursFerier: (jours: JourFerie[]) => void;
  updateCalendrier: (id: string, data: Partial<CalendrierSite>) => void;
  // Navigation
  setActiveTab: (tab: string) => void;
}

const IOTContext = createContext<IOTContextValue | null>(null);

export function IOTProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = loadFromStorage();
    if (!saved) return initialState;
    // Purge shellyRows dont les champs numériques calculés sont manquants
    const shellyRows = Array.isArray(saved.shellyRows)
      ? saved.shellyRows.filter((r: unknown) => {
          if (!r || typeof r !== 'object') return false;
          const row = r as Record<string, unknown>;
          return typeof row.kwhTotal === 'number' && typeof row.kwhNet === 'number';
        })
      : [];
    // Migration : onglets fusionnés (Upload/Stockage → Fichiers, Profil → Analyse)
    const REMOVED_TABS: Record<string, string> = {
      upload:   'fichiers',
      stockage: 'fichiers',
      profil:   'tcd',
    };
    const migratedTab = saved.activeTab && REMOVED_TABS[saved.activeTab]
      ? REMOVED_TABS[saved.activeTab]
      : saved.activeTab;
    return { ...initialState, ...saved, shellyRows, activeTab: migratedTab ?? initialState.activeTab };
  });

  useEffect(() => { saveToStorage(state); }, [state]);

  const addSource = useCallback((source: Source) => dispatch({ type: 'ADD_SOURCE', source }), []);
  const updateSource = useCallback((id: string, data: Partial<Source>) => dispatch({ type: 'UPDATE_SOURCE', id, data }), []);
  const removeSource = useCallback((id: string) => dispatch({ type: 'REMOVE_SOURCE', id }), []);
  const reorderSources = useCallback((ids: string[]) => dispatch({ type: 'REORDER_SOURCES', ids }), []);
  const setSourceData = useCallback((sourceId: string, rows: TimeSeriesRow[]) => dispatch({ type: 'SET_SOURCE_DATA', sourceId, rows }), []);

  const addFile = useCallback((file: ImportedFile) => dispatch({ type: 'ADD_FILE', file }), []);
  const updateFile = useCallback((id: string, data: Partial<ImportedFile>) => dispatch({ type: 'UPDATE_FILE', id, data }), []);
  const removeFile = useCallback((id: string) => dispatch({ type: 'REMOVE_FILE', id }), []);
  const setSelectedFile = useCallback((id: string | null) => dispatch({ type: 'SET_SELECTED_FILE', id }), []);
  const setShellyRows = useCallback((rows: ShellyRow[]) => dispatch({ type: 'SET_SHELLY_ROWS', rows }), []);
  const updateDonneesTechniques = useCallback((data: Partial<DonneesTechniques>) => dispatch({ type: 'UPDATE_DONNEES_TECHNIQUES', data }), []);

  const addJourFerie = useCallback((jour: JourFerie) => dispatch({ type: 'ADD_JOUR_FERIE', jour }), []);
  const toggleJourFerie = useCallback((index: number) => dispatch({ type: 'TOGGLE_JOUR_FERIE', index }), []);
  const updateJourFerie = useCallback((index: number, data: Partial<JourFerie>) => dispatch({ type: 'UPDATE_JOUR_FERIE', index, data }), []);
  const removeJourFerie = useCallback((index: number) => dispatch({ type: 'REMOVE_JOUR_FERIE', index }), []);
  const setJoursFerier = useCallback((jours: JourFerie[]) => dispatch({ type: 'SET_JOURS_FERIER', jours }), []);
  const updateCalendrier = useCallback((id: string, data: Partial<CalendrierSite>) => dispatch({ type: 'UPDATE_CALENDRIER', id, data }), []);

  const setActiveTab = useCallback((tab: string) => dispatch({ type: 'SET_ACTIVE_TAB', tab }), []);

  return (
    <IOTContext.Provider value={{
      state,
      addSource, updateSource, removeSource, reorderSources, setSourceData,
      addFile, updateFile, removeFile, setSelectedFile, setShellyRows,
      updateDonneesTechniques,
      addJourFerie, toggleJourFerie, updateJourFerie, removeJourFerie, setJoursFerier, updateCalendrier,
      setActiveTab,
    }}>
      {children}
    </IOTContext.Provider>
  );
}

export function useIOT() {
  const ctx = useContext(IOTContext);
  if (!ctx) throw new Error('useIOT must be used within IOTProvider');
  return ctx;
}
