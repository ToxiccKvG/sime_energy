/**
 * Hook pour gérer les dictionnaires d'annotation
 * Supporte plusieurs dictionnaires et les paramètres d'affichage
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '@/context/OrganizationContext';
import {
  getAnnotationCollection,
  createDictionary,
  updateDictionary,
  deleteDictionary,
  updateAnnotationSettings,
  resetAllDictionaries,
} from '@/lib/annotation-dictionary-service';
import type {
  AnnotationDictionary,
  AnnotationDictionaryCollection,
  AnnotationDisplaySettings,
  AnnotationField,
  ValidationResult,
  FieldValidationResult,
  TableRecognitionResult,
  TableTemplate,
} from '@/types/annotation-dictionary';
import {
  DEFAULT_ANNOTATION_DICTIONARY,
  DEFAULT_DISPLAY_SETTINGS,
  TABLE_RECOGNITION_THRESHOLD,
} from '@/types/annotation-dictionary';
import { toast } from 'sonner';

const LOCAL_STORAGE_KEY = 'annotation_dictionaries';
const LOCAL_SETTINGS_KEY = 'annotation_settings';

interface FormField {
  Key: string;
  Value: string;
  box?: [number, number, number, number];
}

interface TableCell {
  text: string;
  box?: [number, number, number, number];
}

interface TableData {
  box?: [number, number, number, number];
  rows?: TableCell[][];
}

interface UseAnnotationDictionaryReturn {
  /** Liste de tous les dictionnaires */
  dictionaries: AnnotationDictionary[];
  /** Dictionnaire actuellement sélectionné */
  currentDictionary: AnnotationDictionary | null;
  /** Paramètres d'affichage */
  displaySettings: AnnotationDisplaySettings;
  /** Indique si le chargement est en cours */
  isLoading: boolean;
  /** Indique si une sauvegarde est en cours */
  isSaving: boolean;
  /** Sélectionne un dictionnaire */
  selectDictionary: (id: string | null) => void;
  /** Crée un nouveau dictionnaire */
  createNewDictionary: (dict: Omit<AnnotationDictionary, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AnnotationDictionary>;
  /** Met à jour un dictionnaire */
  updateDictionaryById: (id: string, updates: Partial<AnnotationDictionary>) => void;
  /** Supprime un dictionnaire */
  deleteDictionaryById: (id: string) => void;
  /** Ajoute un champ au dictionnaire courant */
  addField: (field: Omit<AnnotationField, 'id'>) => void;
  /** Met à jour un champ */
  updateField: (id: string, updates: Partial<AnnotationField>) => void;
  /** Supprime un champ */
  removeField: (id: string) => void;
  /** Ajoute un modèle de tableau */
  addTableTemplate: (template: Omit<TableTemplate, 'id'>) => void;
  /** Met à jour un modèle de tableau */
  updateTableTemplate: (id: string, updates: Partial<TableTemplate>) => void;
  /** Supprime un modèle de tableau */
  removeTableTemplate: (id: string) => void;
  /** Toggle l'affichage des labels */
  toggleShowLabels: () => void;
  /** Met à jour les paramètres d'affichage */
  updateDisplaySettings: (settings: Partial<AnnotationDisplaySettings>) => void;
  /** Réinitialise tout aux valeurs par défaut */
  resetToDefault: () => void;
  /** Valide une liste de champs et tableaux contre le dictionnaire courant */
  validateFields: (forms: FormField[], tables?: TableData[]) => ValidationResult;
  /** Vérifie si une clé correspond à un champ du dictionnaire courant */
  matchFieldKey: (key: string) => AnnotationField | undefined;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function normalizeString(str: string): string {
  // Comparaison stricte : on ignore seulement la casse et les espaces en bord
  return str.toLowerCase().trim();
}

function stringsMatch(str1: string, str2: string): boolean {
  // Pas de tolérance sur accents/punctuations/substring : égalité stricte (casse insensible)
  return normalizeString(str1) === normalizeString(str2);
}

function keysMatch(fieldKey: string, dictionaryField: AnnotationField): boolean {
  return normalizeString(fieldKey) === normalizeString(dictionaryField.key);
}

function extractFirstRowTexts(table: TableData): string[] {
  if (!table.rows || table.rows.length === 0) return [];
  return table.rows[0].map((cell) => cell.text?.trim() || '').filter(Boolean);
}

function extractFirstColumnTexts(table: TableData): string[] {
  if (!table.rows) return [];
  return table.rows.map((row) => row[0]?.text?.trim() || '').filter(Boolean);
}

function matchTableWithTemplate(
  table: TableData,
  template: TableTemplate
): {
  matchPercentage: number;
  foundColumnHeaders: string[];
  missingColumnHeaders: string[];
  foundRowHeaders: string[];
  missingRowHeaders: string[];
  layoutMatches: boolean;
} {
  const firstRowTexts = extractFirstRowTexts(table);
  const firstColumnTexts = extractFirstColumnTexts(table);

  const foundColumnHeaders: string[] = [];
  const missingColumnHeaders: string[] = [];
  const foundRowHeaders: string[] = [];
  const missingRowHeaders: string[] = [];

  if (template.headerLayout === 'row' || template.headerLayout === 'both') {
    for (const header of template.columnHeaders) {
      const foundInFirstRow = firstRowTexts.some((text) => stringsMatch(text, header));
      if (foundInFirstRow) {
        foundColumnHeaders.push(header);
      } else {
        missingColumnHeaders.push(header);
      }
    }
  }

  if (template.headerLayout === 'column' || template.headerLayout === 'both') {
    for (const header of template.rowHeaders) {
      const foundInFirstCol = firstColumnTexts.some((text) => stringsMatch(text, header));
      if (foundInFirstCol) {
        foundRowHeaders.push(header);
      } else {
        missingRowHeaders.push(header);
      }
    }
  }

  let totalExpected = 0;
  let totalFound = 0;

  if (template.headerLayout === 'row') {
    totalExpected = template.columnHeaders.length;
    totalFound = foundColumnHeaders.length;
  } else if (template.headerLayout === 'column') {
    totalExpected = template.rowHeaders.length;
    totalFound = foundRowHeaders.length;
  } else {
    totalExpected = template.columnHeaders.length + template.rowHeaders.length;
    totalFound = foundColumnHeaders.length + foundRowHeaders.length;
  }

  const matchPercentage = totalExpected > 0 ? (totalFound / totalExpected) * 100 : 0;

  let layoutMatches = true;
  if (template.headerLayout === 'row' && template.columnHeaders.length > 0) {
    layoutMatches = foundColumnHeaders.length > 0;
  } else if (template.headerLayout === 'column' && template.rowHeaders.length > 0) {
    layoutMatches = foundRowHeaders.length > 0;
  } else if (template.headerLayout === 'both') {
    const hasColHeaders = template.columnHeaders.length === 0 || foundColumnHeaders.length > 0;
    const hasRowHeaders = template.rowHeaders.length === 0 || foundRowHeaders.length > 0;
    layoutMatches = hasColHeaders && hasRowHeaders;
  }

  return {
    matchPercentage: layoutMatches ? matchPercentage : 0,
    foundColumnHeaders,
    missingColumnHeaders,
    foundRowHeaders,
    missingRowHeaders,
    layoutMatches,
  };
}

export function useAnnotationDictionary(): UseAnnotationDictionaryReturn {
  const { organization } = useOrganization();
  const [collection, setCollection] = useState<AnnotationDictionaryCollection>({
    dictionaries: [DEFAULT_ANNOTATION_DICTIONARY],
    displaySettings: DEFAULT_DISPLAY_SETTINGS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Dictionnaire actuellement sélectionné
  const currentDictionary = useMemo(() => {
    if (!collection.displaySettings.selectedDictionaryId) {
      return collection.dictionaries[0] || null;
    }
    return (
      collection.dictionaries.find((d) => d.id === collection.displaySettings.selectedDictionaryId) ||
      collection.dictionaries[0] ||
      null
    );
  }, [collection.dictionaries, collection.displaySettings.selectedDictionaryId]);

  // Charger depuis Supabase ou localStorage
  useEffect(() => {
    const loadCollection = async () => {
      setIsLoading(true);
      try {
        if (organization?.id) {
          const data = await getAnnotationCollection(organization.id);
          setCollection(data);
        } else {
          // Fallback localStorage
          const storedDicts = localStorage.getItem(LOCAL_STORAGE_KEY);
          const storedSettings = localStorage.getItem(LOCAL_SETTINGS_KEY);
          
          const dictionaries = storedDicts
            ? JSON.parse(storedDicts)
            : [DEFAULT_ANNOTATION_DICTIONARY];
          const displaySettings = storedSettings
            ? JSON.parse(storedSettings)
            : DEFAULT_DISPLAY_SETTINGS;

          setCollection({ dictionaries, displaySettings });
        }
      } catch (error) {
        console.error('Error loading dictionaries:', error);
        // Fallback localStorage
        try {
          const storedDicts = localStorage.getItem(LOCAL_STORAGE_KEY);
          const storedSettings = localStorage.getItem(LOCAL_SETTINGS_KEY);
          
          setCollection({
            dictionaries: storedDicts ? JSON.parse(storedDicts) : [DEFAULT_ANNOTATION_DICTIONARY],
            displaySettings: storedSettings ? JSON.parse(storedSettings) : DEFAULT_DISPLAY_SETTINGS,
          });
        } catch (e) {
          console.error('localStorage fallback error:', e);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadCollection();
  }, [organization?.id]);

  // Sauvegarder en localStorage
  const saveToLocalStorage = useCallback((col: AnnotationDictionaryCollection) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(col.dictionaries));
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(col.displaySettings));
  }, []);

  // Sélectionner un dictionnaire
  const selectDictionary = useCallback(
    async (id: string | null) => {
      const newSettings = { ...collection.displaySettings, selectedDictionaryId: id };
      
      setCollection((prev) => ({
        ...prev,
        displaySettings: newSettings,
      }));

      saveToLocalStorage({ ...collection, displaySettings: newSettings });

      if (organization?.id) {
        try {
          await updateAnnotationSettings(organization.id, { selectedDictionaryId: id });
        } catch (error) {
          console.error('Error saving settings:', error);
        }
      }
    },
    [collection, organization?.id, saveToLocalStorage]
  );

  // Créer un nouveau dictionnaire
  const createNewDictionary = useCallback(
    async (dict: Omit<AnnotationDictionary, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnnotationDictionary> => {
      setIsSaving(true);
      try {
        let newDict: AnnotationDictionary;

        if (organization?.id) {
          newDict = await createDictionary(organization.id, dict);
        } else {
          newDict = {
            ...dict,
            id: generateId('dict'),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }

        setCollection((prev) => ({
          ...prev,
          dictionaries: [...prev.dictionaries, newDict],
        }));

        saveToLocalStorage({
          ...collection,
          dictionaries: [...collection.dictionaries, newDict],
        });

        toast.success(`Dictionnaire "${dict.name}" créé`);
        return newDict;
      } catch (error) {
        console.error('Error creating dictionary:', error);
        toast.error('Erreur lors de la création');
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [collection, organization?.id, saveToLocalStorage]
  );

  // Mettre à jour un dictionnaire
  const updateDictionaryById = useCallback(
    async (id: string, updates: Partial<AnnotationDictionary>) => {
      setIsSaving(true);
      try {
        const updatedDicts = collection.dictionaries.map((d) =>
          d.id === id ? { ...d, ...updates, updatedAt: new Date().toISOString() } : d
        );

        setCollection((prev) => ({
          ...prev,
          dictionaries: updatedDicts,
        }));

        saveToLocalStorage({ ...collection, dictionaries: updatedDicts });

        if (organization?.id && id !== 'default') {
          await updateDictionary(id, updates);
        }
      } catch (error) {
        console.error('Error updating dictionary:', error);
        toast.error('Erreur lors de la mise à jour');
      } finally {
        setIsSaving(false);
      }
    },
    [collection, organization?.id, saveToLocalStorage]
  );

  // Supprimer un dictionnaire
  const deleteDictionaryById = useCallback(
    async (id: string) => {
      if (collection.dictionaries.length <= 1) {
        toast.error('Impossible de supprimer le dernier dictionnaire');
        return;
      }

      setIsSaving(true);
      try {
        const updatedDicts = collection.dictionaries.filter((d) => d.id !== id);
        const newSettings = {
          ...collection.displaySettings,
          selectedDictionaryId:
            collection.displaySettings.selectedDictionaryId === id
              ? updatedDicts[0]?.id || null
              : collection.displaySettings.selectedDictionaryId,
        };

        setCollection({
          dictionaries: updatedDicts,
          displaySettings: newSettings,
        });

        saveToLocalStorage({ dictionaries: updatedDicts, displaySettings: newSettings });

        if (organization?.id && id !== 'default') {
          await deleteDictionary(id);
        }

        toast.success('Dictionnaire supprimé');
      } catch (error) {
        console.error('Error deleting dictionary:', error);
        toast.error('Erreur lors de la suppression');
      } finally {
        setIsSaving(false);
      }
    },
    [collection, organization?.id, saveToLocalStorage]
  );

  // === Gestion des champs du dictionnaire courant ===
  const addField = useCallback(
    (field: Omit<AnnotationField, 'id'>) => {
      if (!currentDictionary) return;
      const newField: AnnotationField = { ...field, id: generateId('field') };
      updateDictionaryById(currentDictionary.id, {
        fields: [...currentDictionary.fields, newField],
      });
    },
    [currentDictionary, updateDictionaryById]
  );

  const updateField = useCallback(
    (id: string, updates: Partial<AnnotationField>) => {
      if (!currentDictionary) return;
      updateDictionaryById(currentDictionary.id, {
        fields: currentDictionary.fields.map((f) =>
          f.id === id ? { ...f, ...updates } : f
        ),
      });
    },
    [currentDictionary, updateDictionaryById]
  );

  const removeField = useCallback(
    (id: string) => {
      if (!currentDictionary) return;
      updateDictionaryById(currentDictionary.id, {
        fields: currentDictionary.fields.filter((f) => f.id !== id),
      });
    },
    [currentDictionary, updateDictionaryById]
  );

  // === Gestion des modèles de tableaux ===
  const addTableTemplate = useCallback(
    (template: Omit<TableTemplate, 'id'>) => {
      if (!currentDictionary) return;
      const newTemplate: TableTemplate = {
        ...template,
        id: generateId('table'),
        excelMappings: template.excelMappings ?? [],
      };
      updateDictionaryById(currentDictionary.id, {
        tableTemplates: [...currentDictionary.tableTemplates, newTemplate],
      });
    },
    [currentDictionary, updateDictionaryById]
  );

  const updateTableTemplate = useCallback(
    (id: string, updates: Partial<TableTemplate>) => {
      if (!currentDictionary) return;
      updateDictionaryById(currentDictionary.id, {
        tableTemplates: currentDictionary.tableTemplates.map((t) =>
          t.id === id
            ? { ...t, ...updates, excelMappings: updates.excelMappings ?? t.excelMappings ?? [] }
            : t
        ),
      });
    },
    [currentDictionary, updateDictionaryById]
  );

  const removeTableTemplate = useCallback(
    (id: string) => {
      if (!currentDictionary) return;
      updateDictionaryById(currentDictionary.id, {
        tableTemplates: currentDictionary.tableTemplates.filter((t) => t.id !== id),
      });
    },
    [currentDictionary, updateDictionaryById]
  );

  // === Paramètres d'affichage ===
  const toggleShowLabels = useCallback(async () => {
    const newSettings = {
      ...collection.displaySettings,
      showLabels: !collection.displaySettings.showLabels,
    };

    setCollection((prev) => ({
      ...prev,
      displaySettings: newSettings,
    }));

    saveToLocalStorage({ ...collection, displaySettings: newSettings });

    if (organization?.id) {
      try {
        await updateAnnotationSettings(organization.id, { showLabels: newSettings.showLabels });
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }
  }, [collection, organization?.id, saveToLocalStorage]);

  const updateDisplaySettings = useCallback(
    async (settings: Partial<AnnotationDisplaySettings>) => {
      const newSettings = { ...collection.displaySettings, ...settings };

      setCollection((prev) => ({
        ...prev,
        displaySettings: newSettings,
      }));

      saveToLocalStorage({ ...collection, displaySettings: newSettings });

      if (organization?.id) {
        try {
          await updateAnnotationSettings(organization.id, settings);
        } catch (error) {
          console.error('Error saving settings:', error);
        }
      }
    },
    [collection, organization?.id, saveToLocalStorage]
  );

  // Réinitialiser tout
  const resetToDefault = useCallback(async () => {
    setIsSaving(true);
    try {
      if (organization?.id) {
        await resetAllDictionaries(organization.id);
      }

      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(LOCAL_SETTINGS_KEY);

      setCollection({
        dictionaries: [DEFAULT_ANNOTATION_DICTIONARY],
        displaySettings: DEFAULT_DISPLAY_SETTINGS,
      });

      toast.success('Dictionnaires réinitialisés');
    } catch (error) {
      console.error('Error resetting:', error);
      toast.error('Erreur lors de la réinitialisation');
    } finally {
      setIsSaving(false);
    }
  }, [organization?.id]);

  // === Validation ===
  const matchFieldKey = useCallback(
    (key: string): AnnotationField | undefined => {
      if (!currentDictionary) return undefined;
      return currentDictionary.fields.find((field) => keysMatch(key, field));
    },
    [currentDictionary]
  );

  const validateFields = useCallback(
    (forms: FormField[], tables?: TableData[]): ValidationResult => {
      if (!currentDictionary) {
        return {
          isValid: true,
          missingRequiredFields: [],
          extraFields: [],
          fieldResults: [],
          tableRecognition: [],
          missingRequiredTables: [],
          message: 'Aucun dictionnaire sélectionné',
        };
      }

      const fieldResults: FieldValidationResult[] = [];
      const matchedDictionaryFieldIds = new Set<string>();

      for (const form of forms) {
        const matchedField = matchFieldKey(form.Key);

        if (matchedField) {
          matchedDictionaryFieldIds.add(matchedField.id);
          fieldResults.push({
            fieldKey: form.Key,
            status: 'valid',
            matchedDictionaryField: matchedField,
          });
        } else {
          fieldResults.push({
            fieldKey: form.Key,
            status: 'extra',
            message: `"${form.Key}" n'est pas un champ attendu`,
          });
        }
      }

      const missingRequiredFields: AnnotationField[] = [];
      for (const dictField of currentDictionary.fields) {
        if (dictField.required && !matchedDictionaryFieldIds.has(dictField.id)) {
          missingRequiredFields.push(dictField);
          fieldResults.push({
            fieldKey: dictField.key,
            status: 'missing',
            matchedDictionaryField: dictField,
            message: `Champ obligatoire "${dictField.key}" manquant`,
          });
        }
      }

      const tableRecognition: TableRecognitionResult[] = [];
      const recognizedTemplateIds = new Set<string>();

      if (tables && tables.length > 0) {
        for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
          const table = tables[tableIndex];

          let bestMatch: {
            template: TableTemplate;
            matchPercentage: number;
            foundColumnHeaders: string[];
            missingColumnHeaders: string[];
            foundRowHeaders: string[];
            missingRowHeaders: string[];
          } | null = null;

          for (const template of currentDictionary.tableTemplates) {
            const result = matchTableWithTemplate(table, template);

            if (
              result.layoutMatches &&
              result.matchPercentage >= TABLE_RECOGNITION_THRESHOLD * 100 &&
              (!bestMatch || result.matchPercentage > bestMatch.matchPercentage)
            ) {
              bestMatch = {
                template,
                matchPercentage: result.matchPercentage,
                foundColumnHeaders: result.foundColumnHeaders,
                missingColumnHeaders: result.missingColumnHeaders,
                foundRowHeaders: result.foundRowHeaders,
                missingRowHeaders: result.missingRowHeaders,
              };
            }
          }

          if (bestMatch) {
            recognizedTemplateIds.add(bestMatch.template.id);
            tableRecognition.push({
              tableIndex,
              isRecognized: true,
              matchedTemplate: bestMatch.template,
              matchPercentage: bestMatch.matchPercentage,
              foundColumnHeaders: bestMatch.foundColumnHeaders,
              missingColumnHeaders: bestMatch.missingColumnHeaders,
              foundRowHeaders: bestMatch.foundRowHeaders,
              missingRowHeaders: bestMatch.missingRowHeaders,
              allCellTexts: [],
            });
          } else {
            tableRecognition.push({
              tableIndex,
              isRecognized: false,
              matchPercentage: 0,
              foundColumnHeaders: [],
              missingColumnHeaders: [],
              foundRowHeaders: [],
              missingRowHeaders: [],
              allCellTexts: [],
            });
          }
        }
      }

      const missingRequiredTables: TableTemplate[] = currentDictionary.tableTemplates.filter(
        (template) => template.required && !recognizedTemplateIds.has(template.id)
      );

      const extraFields = fieldResults.filter((r) => r.status === 'extra').map((r) => r.fieldKey);

      // Les tableaux non reconnus ou incomplets empêchent la validation (même si optionnels)
      const allTablesValid = tableRecognition.every(
        (t) =>
          t.isRecognized &&
          t.missingColumnHeaders.length === 0 &&
          t.missingRowHeaders.length === 0
      );
      const isValid =
        missingRequiredFields.length === 0 &&
        missingRequiredTables.length === 0 &&
        (tableRecognition.length === 0 || allTablesValid);

      let message: string;
      if (isValid && extraFields.length === 0) {
        message = 'Tous les champs et tableaux sont valides';
      } else if (missingRequiredFields.length > 0) {
        message = `${missingRequiredFields.length} champ(s) obligatoire(s) manquant(s)`;
      } else if (missingRequiredTables.length > 0) {
        message = `${missingRequiredTables.length} tableau(x) obligatoire(s) non trouvé(s)`;
      } else if (tableRecognition.some((t) => !t.isRecognized)) {
        const unrecognizedCount = tableRecognition.filter((t) => !t.isRecognized).length;
        message = `${unrecognizedCount} tableau(x) non reconnu(s)`;
      } else {
        message = `${extraFields.length} champ(s) supplémentaire(s) détecté(s)`;
      }

      return {
        isValid,
        missingRequiredFields,
        extraFields,
        fieldResults,
        tableRecognition,
        missingRequiredTables,
        message,
      };
    },
    [currentDictionary, matchFieldKey]
  );

  return {
    dictionaries: collection.dictionaries,
    currentDictionary,
    displaySettings: collection.displaySettings,
    isLoading,
    isSaving,
    selectDictionary,
    createNewDictionary,
    updateDictionaryById,
    deleteDictionaryById,
    addField,
    updateField,
    removeField,
    addTableTemplate,
    updateTableTemplate,
    removeTableTemplate,
    toggleShowLabels,
    updateDisplaySettings,
    resetToDefault,
    validateFields,
    matchFieldKey,
  };
}
