import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import type {
  ImportedFile, ShellyRow, LigneFacturation, DonneesTechniques, JourFerie,
  Source, TimeSeriesRow, CalendrierSite, ReleveCompteur, Simulation,
} from './shared';
import { JOURS_FERIES_FIXES } from './shared';
import type { ParamsTarif } from '@/lib/iot-profil-engine';
import { PARAMS_TARIF_DEFAUT } from '@/lib/iot-profil-engine';

// ---- Persistance localStorage ----

const STORAGE_KEY = 'sime-iot-v1';

// Revive ISO date strings → Date objects during JSON.parse
function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
}

function saveToStorage(state: IOTState) {
  try {
    // Ne pas persister rawData (lourd, inutile après import)
    const toSave = {
      ...state,
      files: state.files.map(({ rawData: _rd, ...rest }) => ({ ...rest, rawData: [] })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
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
  // Sources (Onglet 1)
  sources: Source[];
  sourceData: Record<string, TimeSeriesRow[]>; // sourceId → données
  // Upload (Onglet 2)
  files: ImportedFile[];
  // Profil de charge / données Shelly
  shellyRows: ShellyRow[];
  // Facturation
  facturationRows: LigneFacturation[];
  donneesTechniques: DonneesTechniques;
  paramsTarif: ParamsTarif;
  // Calendrier (Onglet 5)
  joursFerier: JourFerie[];
  calendriers: CalendrierSite[];
  // Bilan M1/M2/M3 (Onglet 6)
  relevesCompteur: ReleveCompteur[];
  sourceM2Id: string | null;   // source SENELEC (achat réseau)
  sourceM1Id: string | null;   // source PV (autoproduit)
  sourceM3Ids: string[];       // sources CHARGE (total site)
  tarifSenelec: number;        // FCFA/kWh pour calcul coût évité
  // Simulations (Onglet 7)
  simulations: Simulation[];
  // Navigation
  activeTab: string;
}

const DEFAULT_DONNEES_TECHNIQUES: DonneesTechniques = {
  nJours: 31,
  nJoursDepassement: 0,
  puissanceSouscrite: 150,
  puissanceMaxRelevee: 150,
  puissanceTransfo: 400,
  taxeCommunale: 0,
  categorie: 'TG',
  alphaA: 0.013,
  betaA: 0.65,
  alphaR: 0.04,
  betaR: 5.25,
  h1: 720,
  h2: 0,
  redevance: 0,
};

// Source SENELEC par défaut pré-créée
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
    0: { actif: false, plages: [] },                           // Dim
    1: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] }, // Lun
    2: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    3: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    4: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    5: { actif: true,  plages: [{ debut: '08:00', fin: '18:00' }] },
    6: { actif: false, plages: [] },                           // Sam
  },
  exceptions: [],
};

const initialState: IOTState = {
  sources: DEFAULT_SOURCES,
  sourceData: {},
  files: [],
  shellyRows: [],
  facturationRows: [],
  donneesTechniques: DEFAULT_DONNEES_TECHNIQUES,
  paramsTarif: PARAMS_TARIF_DEFAUT,
  joursFerier: buildJoursFerier(),
  calendriers: [DEFAULT_CALENDRIER],
  relevesCompteur: [],
  sourceM2Id: 'src-senelec',
  sourceM1Id: null,
  sourceM3Ids: [],
  tarifSenelec: 140.74,
  simulations: [],
  activeTab: 'sources',
};

// ---- Actions ----

type Action =
  // Sources
  | { type: 'ADD_SOURCE'; source: Source }
  | { type: 'UPDATE_SOURCE'; id: string; data: Partial<Source> }
  | { type: 'REMOVE_SOURCE'; id: string }
  | { type: 'REORDER_SOURCES'; ids: string[] }
  | { type: 'SET_SOURCE_DATA'; sourceId: string; rows: TimeSeriesRow[] }
  // Files / Shelly / Facturation
  | { type: 'ADD_FILE'; file: ImportedFile }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'SET_SHELLY_ROWS'; rows: ShellyRow[] }
  | { type: 'SET_FACTURATION_ROWS'; rows: LigneFacturation[] }
  | { type: 'UPDATE_DONNEES_TECHNIQUES'; data: Partial<DonneesTechniques> }
  | { type: 'UPDATE_PARAMS_TARIF'; params: Partial<ParamsTarif> }
  // Calendrier
  | { type: 'ADD_JOUR_FERIE'; jour: JourFerie }
  | { type: 'TOGGLE_JOUR_FERIE'; index: number }
  | { type: 'UPDATE_JOUR_FERIE'; index: number; data: Partial<JourFerie> }
  | { type: 'REMOVE_JOUR_FERIE'; index: number }
  | { type: 'SET_JOURS_FERIER'; jours: JourFerie[] }
  | { type: 'UPDATE_CALENDRIER'; id: string; data: Partial<CalendrierSite> }
  // Bilan
  | { type: 'ADD_RELEVE'; releve: ReleveCompteur }
  | { type: 'REMOVE_RELEVE'; id: string }
  | { type: 'SET_BILAN_CONFIG'; sourceM2Id: string | null; sourceM1Id: string | null; sourceM3Ids: string[]; tarifSenelec: number }
  // Simulations
  | { type: 'ADD_SIMULATION'; simulation: Simulation }
  | { type: 'UPDATE_SIMULATION'; id: string; data: Partial<Simulation> }
  | { type: 'REMOVE_SIMULATION'; id: string }
  | { type: 'TOGGLE_SIMULATION'; id: string }
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
    case 'REMOVE_FILE':
      return { ...state, files: state.files.filter(f => f.id !== action.id) };
    case 'SET_SHELLY_ROWS':
      return { ...state, shellyRows: action.rows };
    case 'SET_FACTURATION_ROWS':
      return { ...state, facturationRows: action.rows };
    case 'UPDATE_DONNEES_TECHNIQUES':
      return { ...state, donneesTechniques: { ...state.donneesTechniques, ...action.data } };
    case 'UPDATE_PARAMS_TARIF':
      return { ...state, paramsTarif: { ...state.paramsTarif, ...action.params } };
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
    case 'ADD_RELEVE':
      return { ...state, relevesCompteur: [...state.relevesCompteur, action.releve] };
    case 'REMOVE_RELEVE':
      return { ...state, relevesCompteur: state.relevesCompteur.filter(r => r.id !== action.id) };
    case 'SET_BILAN_CONFIG':
      return {
        ...state,
        sourceM2Id: action.sourceM2Id,
        sourceM1Id: action.sourceM1Id,
        sourceM3Ids: action.sourceM3Ids,
        tarifSenelec: action.tarifSenelec,
      };
    case 'ADD_SIMULATION':
      return { ...state, simulations: [...state.simulations, action.simulation] };
    case 'UPDATE_SIMULATION':
      return {
        ...state,
        simulations: state.simulations.map(s => s.id === action.id ? { ...s, ...action.data } : s),
      };
    case 'REMOVE_SIMULATION':
      return { ...state, simulations: state.simulations.filter(s => s.id !== action.id) };
    case 'TOGGLE_SIMULATION':
      return {
        ...state,
        simulations: state.simulations.map(s => s.id === action.id ? { ...s, actif: !s.actif } : s),
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
  // Files / data
  addFile: (file: ImportedFile) => void;
  removeFile: (id: string) => void;
  setShellyRows: (rows: ShellyRow[]) => void;
  setFacturationRows: (rows: LigneFacturation[]) => void;
  updateDonneesTechniques: (data: Partial<DonneesTechniques>) => void;
  updateParamsTarif: (params: Partial<ParamsTarif>) => void;
  // Calendrier
  addJourFerie: (jour: JourFerie) => void;
  toggleJourFerie: (index: number) => void;
  updateJourFerie: (index: number, data: Partial<JourFerie>) => void;
  removeJourFerie: (index: number) => void;
  setJoursFerier: (jours: JourFerie[]) => void;
  updateCalendrier: (id: string, data: Partial<CalendrierSite>) => void;
  // Bilan
  addReleve: (releve: ReleveCompteur) => void;
  removeReleve: (id: string) => void;
  setBilanConfig: (sourceM2Id: string | null, sourceM1Id: string | null, sourceM3Ids: string[], tarifSenelec: number) => void;
  // Simulations
  addSimulation: (simulation: Simulation) => void;
  updateSimulation: (id: string, data: Partial<Simulation>) => void;
  removeSimulation: (id: string) => void;
  toggleSimulation: (id: string) => void;
  // Navigation
  setActiveTab: (tab: string) => void;
}

const IOTContext = createContext<IOTContextValue | null>(null);

export function IOTProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = loadFromStorage();
    return saved ? { ...initialState, ...saved } : initialState;
  });

  // Persister automatiquement à chaque changement de state
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const addSource = useCallback((source: Source) => dispatch({ type: 'ADD_SOURCE', source }), []);
  const updateSource = useCallback((id: string, data: Partial<Source>) => dispatch({ type: 'UPDATE_SOURCE', id, data }), []);
  const removeSource = useCallback((id: string) => dispatch({ type: 'REMOVE_SOURCE', id }), []);
  const reorderSources = useCallback((ids: string[]) => dispatch({ type: 'REORDER_SOURCES', ids }), []);
  const setSourceData = useCallback((sourceId: string, rows: TimeSeriesRow[]) => dispatch({ type: 'SET_SOURCE_DATA', sourceId, rows }), []);

  const addFile = useCallback((file: ImportedFile) => dispatch({ type: 'ADD_FILE', file }), []);
  const removeFile = useCallback((id: string) => dispatch({ type: 'REMOVE_FILE', id }), []);
  const setShellyRows = useCallback((rows: ShellyRow[]) => dispatch({ type: 'SET_SHELLY_ROWS', rows }), []);
  const setFacturationRows = useCallback((rows: LigneFacturation[]) => dispatch({ type: 'SET_FACTURATION_ROWS', rows }), []);
  const updateDonneesTechniques = useCallback((data: Partial<DonneesTechniques>) => dispatch({ type: 'UPDATE_DONNEES_TECHNIQUES', data }), []);
  const updateParamsTarif = useCallback((params: Partial<ParamsTarif>) => dispatch({ type: 'UPDATE_PARAMS_TARIF', params }), []);

  const addJourFerie = useCallback((jour: JourFerie) => dispatch({ type: 'ADD_JOUR_FERIE', jour }), []);
  const toggleJourFerie = useCallback((index: number) => dispatch({ type: 'TOGGLE_JOUR_FERIE', index }), []);
  const updateJourFerie = useCallback((index: number, data: Partial<JourFerie>) => dispatch({ type: 'UPDATE_JOUR_FERIE', index, data }), []);
  const removeJourFerie = useCallback((index: number) => dispatch({ type: 'REMOVE_JOUR_FERIE', index }), []);
  const setJoursFerier = useCallback((jours: JourFerie[]) => dispatch({ type: 'SET_JOURS_FERIER', jours }), []);
  const updateCalendrier = useCallback((id: string, data: Partial<CalendrierSite>) => dispatch({ type: 'UPDATE_CALENDRIER', id, data }), []);

  const addReleve = useCallback((releve: ReleveCompteur) => dispatch({ type: 'ADD_RELEVE', releve }), []);
  const removeReleve = useCallback((id: string) => dispatch({ type: 'REMOVE_RELEVE', id }), []);
  const setBilanConfig = useCallback((sourceM2Id: string | null, sourceM1Id: string | null, sourceM3Ids: string[], tarifSenelec: number) =>
    dispatch({ type: 'SET_BILAN_CONFIG', sourceM2Id, sourceM1Id, sourceM3Ids, tarifSenelec }), []);

  const addSimulation = useCallback((simulation: Simulation) => dispatch({ type: 'ADD_SIMULATION', simulation }), []);
  const updateSimulation = useCallback((id: string, data: Partial<Simulation>) => dispatch({ type: 'UPDATE_SIMULATION', id, data }), []);
  const removeSimulation = useCallback((id: string) => dispatch({ type: 'REMOVE_SIMULATION', id }), []);
  const toggleSimulation = useCallback((id: string) => dispatch({ type: 'TOGGLE_SIMULATION', id }), []);

  const setActiveTab = useCallback((tab: string) => dispatch({ type: 'SET_ACTIVE_TAB', tab }), []);

  return (
    <IOTContext.Provider value={{
      state,
      addSource, updateSource, removeSource, reorderSources, setSourceData,
      addFile, removeFile, setShellyRows, setFacturationRows,
      updateDonneesTechniques, updateParamsTarif,
      addJourFerie, toggleJourFerie, updateJourFerie, removeJourFerie, setJoursFerier, updateCalendrier,
      addReleve, removeReleve, setBilanConfig,
      addSimulation, updateSimulation, removeSimulation, toggleSimulation,
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
