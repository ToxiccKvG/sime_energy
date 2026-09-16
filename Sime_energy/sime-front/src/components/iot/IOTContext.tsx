import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type {
  ImportedFile, ShellyRow, DonneesTechniques, JourFerie,
  CalendrierSite,
} from './shared';
import { JOURS_FERIES_FIXES } from './shared';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import * as fileService from '@/lib/iot-file-service';

// ---- Persistance ----
//
// Les FICHIERS vivent en base (iot_files + bucket iot-files, migration
// 20260916) : liste chargée au montage, contenu à la première ouverture.
// Le localStorage ne garde plus que les préférences de session — petites,
// donc jamais au-dessus du quota.
//
// Historique des bumps (chacun force un reset propre du state local) :
//   v1 → v2 : retrait de la couche facturation/tarification ;
//   v2 → v3 : retrait des « sources » locales (modèle riche) — les sources
//             vivent désormais en base (shelly_device_roles) ;
//   v3 → v4 : retrait de `files` et `shellyRows` — les fichiers sont en
//             base, le jeu actif se reconstruit à l'ouverture d'un fichier.
const STORAGE_KEY = 'sime-iot-v4';

/** Ce qui est encore persisté localement : préférences, pas des données. */
type PersistedState = Pick<IOTState,
  'selectedFileId' | 'donneesTechniques' | 'joursFerier' | 'calendriers' | 'activeTab'
>;

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
}

function saveToStorage(state: IOTState) {
  const persisted: PersistedState = {
    selectedFileId: state.selectedFileId,
    donneesTechniques: state.donneesTechniques,
    joursFerier: state.joursFerier,
    calendriers: state.calendriers,
    activeTab: state.activeTab,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn('[IOT] localStorage save failed', e);
  }
}

function loadFromStorage(): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw, dateReviver) as Partial<PersistedState>;
  } catch {
    return null;
  }
}

// ---- State ----

/**
 * Préréglage posé par l'onglet Sources (« Analyser cette source ») et
 * consommé une seule fois par l'onglet Analyse : il pré-coche des appareils,
 * rien de plus — l'utilisateur reste libre de modifier la sélection, et le
 * chargement libre (site / famille / appareil / période) reste le défaut.
 */
export interface AnalysePreset {
  label: string;
  site: string;
  deviceIds: string[];
}

interface IOTState {
  // Raccourci Sources → Analyse (non persisté)
  analysePreset: AnalysePreset | null;
  // Bibliothèque fichiers (miroir de iot_files ; rawData chargé à la demande)
  files: ImportedFile[];
  filesLoading: boolean;
  /** false tant que la première liste n'est pas arrivée de la base. */
  filesLoaded: boolean;
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
  analysePreset: null,
  files: [],
  filesLoading: false,
  filesLoaded: false,
  selectedFileId: null,
  shellyRows: [],
  donneesTechniques: DEFAULT_DONNEES_TECHNIQUES,
  joursFerier: buildJoursFerier(),
  calendriers: [DEFAULT_CALENDRIER],
  activeTab: 'dashboard',
};

// ---- Actions ----

type Action =
  // Raccourci Sources → Analyse
  | { type: 'SET_ANALYSE_PRESET'; preset: AnalysePreset | null }
  // Files / Shelly
  | { type: 'SET_FILES'; files: ImportedFile[] }
  | { type: 'SET_FILES_LOADING'; loading: boolean }
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
    case 'SET_ANALYSE_PRESET':
      return { ...state, analysePreset: action.preset };
    case 'SET_FILES':
      return { ...state, files: action.files, filesLoaded: true };
    case 'SET_FILES_LOADING':
      return { ...state, filesLoading: action.loading };
    case 'ADD_FILE':
      // Un fichier ajouté depuis l'UI arrive avec son contenu.
      return { ...state, files: [...state.files, { ...action.file, contentLoaded: true }] };
    case 'UPDATE_FILE':
      return {
        ...state,
        files: state.files.map(f => f.id === action.id
          ? { ...f, ...action.data, ...(action.data.rawData !== undefined ? { contentLoaded: true } : {}) }
          : f),
      };
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
  // Raccourci Sources → Analyse
  setAnalysePreset: (preset: AnalysePreset | null) => void;
  // Stockage / Files — l'UI est mise à jour immédiatement, la base ensuite ;
  // un échec serveur est signalé par un toast (jamais silencieux).
  addFile: (file: ImportedFile) => void;
  updateFile: (id: string, data: Partial<ImportedFile>) => void;
  removeFile: (id: string) => void;
  /**
   * Garantit que `rawData` du fichier est en mémoire (téléchargé depuis
   * le bucket si besoin) et renvoie le fichier complet, ou null s'il
   * n'existe plus ou si le contenu est indisponible (toast affiché).
   */
  ensureFileContent: (id: string) => Promise<ImportedFile | null>;
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
  const { user } = useAuth();
  const { organization } = useOrganization();

  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const saved = loadFromStorage();
    if (!saved) return initialState;
    // Migration : onglets fusionnés (Upload/Stockage → Fichiers, Profil → Analyse)
    const REMOVED_TABS: Record<string, string> = {
      upload:   'fichiers',
      stockage: 'fichiers',
      profil:   'tcd',
    };
    const migratedTab = saved.activeTab && REMOVED_TABS[saved.activeTab]
      ? REMOVED_TABS[saved.activeTab]
      : saved.activeTab;
    return { ...initialState, ...saved, activeTab: migratedTab ?? initialState.activeTab };
  });

  useEffect(() => { saveToStorage(state); }, [state]);

  // `files` lu dans des callbacks async sans les re-créer à chaque rendu.
  const filesRef = useRef(state.files);
  filesRef.current = state.files;
  // Téléchargements en cours, pour ne pas lancer deux fois le même.
  const pendingContent = useRef(new Map<string, Promise<ImportedFile | null>>());

  const notifyError = useCallback((title: string, e: unknown) => {
    console.error('[IOT]', title, e);
    toast({
      title,
      description: e instanceof Error ? e.message : String(e),
      variant: 'destructive',
    });
  }, []);

  // ---- Liste des fichiers : depuis la base, à la connexion ----
  useEffect(() => {
    if (!user?.id) {
      dispatch({ type: 'SET_FILES', files: [] });
      return;
    }
    let cancelled = false;
    dispatch({ type: 'SET_FILES_LOADING', loading: true });
    fileService.listFiles()
      .then(files => { if (!cancelled) dispatch({ type: 'SET_FILES', files }); })
      .catch(e => { if (!cancelled) notifyError('Impossible de charger la bibliothèque de fichiers', e); })
      .finally(() => { if (!cancelled) dispatch({ type: 'SET_FILES_LOADING', loading: false }); });
    return () => { cancelled = true; };
  }, [user?.id, notifyError]);

  // Un fichier sélectionné qui n'existe plus (supprimé ailleurs, autre
  // compte) ne doit pas rester pointé.
  useEffect(() => {
    if (!state.filesLoaded || state.filesLoading || !state.selectedFileId) return;
    if (!state.files.some(f => f.id === state.selectedFileId)) {
      dispatch({ type: 'SET_SELECTED_FILE', id: null });
    }
  }, [state.files, state.filesLoaded, state.filesLoading, state.selectedFileId]);

  const setAnalysePreset = useCallback((preset: AnalysePreset | null) => dispatch({ type: 'SET_ANALYSE_PRESET', preset }), []);

  const addFile = useCallback((file: ImportedFile) => {
    dispatch({ type: 'ADD_FILE', file });
    if (!user?.id) { notifyError('Fichier non enregistré', new Error('Utilisateur non connecté')); return; }
    fileService.createFile(file, user.id, organization?.id ?? null)
      .catch(e => notifyError(`« ${file.name} » n'a pas pu être enregistré sur le serveur`, e));
  }, [user?.id, organization?.id, notifyError]);

  const updateFile = useCallback((id: string, data: Partial<ImportedFile>) => {
    dispatch({ type: 'UPDATE_FILE', id, data });
    if (!user?.id) return;
    fileService.updateFile(id, data, user.id)
      .catch(e => notifyError('Modification non enregistrée sur le serveur', e));
  }, [user?.id, notifyError]);

  const removeFile = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FILE', id });
    fileService.deleteFile(id)
      .catch(e => notifyError('Suppression non enregistrée sur le serveur', e));
  }, [notifyError]);

  const ensureFileContent = useCallback((id: string): Promise<ImportedFile | null> => {
    const current = filesRef.current.find(f => f.id === id);
    if (!current) return Promise.resolve(null);
    if (current.contentLoaded) return Promise.resolve(current);
    const pending = pendingContent.current.get(id);
    if (pending) return pending;

    const p = fileService.fetchFileContent(id)
      .then(rawData => {
        dispatch({ type: 'UPDATE_FILE', id, data: { rawData } });
        const base = filesRef.current.find(f => f.id === id) ?? current;
        return { ...base, rawData, contentLoaded: true };
      })
      .catch(e => { notifyError(`Contenu de « ${current.name} » indisponible`, e); return null; })
      .finally(() => { pendingContent.current.delete(id); });
    pendingContent.current.set(id, p);
    return p;
  }, [notifyError]);
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
      setAnalysePreset,
      addFile, updateFile, removeFile, ensureFileContent, setSelectedFile, setShellyRows,
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
