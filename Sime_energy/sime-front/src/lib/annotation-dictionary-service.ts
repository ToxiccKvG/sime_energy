/**
 * Service pour la gestion des dictionnaires d'annotation dans Supabase
 * Supporte plusieurs dictionnaires par organisation
 */

import { supabase } from '@/lib/supabase';
import type {
  AnnotationDictionary,
  AnnotationDictionaryCollection,
  AnnotationDisplaySettings,
} from '@/types/annotation-dictionary';
import {
  DEFAULT_ANNOTATION_DICTIONARY,
  DEFAULT_DISPLAY_SETTINGS,
} from '@/types/annotation-dictionary';

export interface AnnotationDictionaryDB {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  color?: string;
  fields: AnnotationDictionary['fields'];
  table_templates: AnnotationDictionary['tableTemplates'];
  created_at: string;
  updated_at: string;
}

export interface AnnotationSettingsDB {
  id: string;
  organization_id: string;
  show_labels: boolean;
  selected_dictionary_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Récupère tous les dictionnaires d'annotation pour une organisation
 */
export async function getAnnotationDictionaries(
  organizationId: string
): Promise<AnnotationDictionary[]> {
  const { data, error } = await supabase
    .from('annotation_dictionaries')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching dictionaries:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    // Retourner le dictionnaire par défaut
    return [
      {
        ...DEFAULT_ANNOTATION_DICTIONARY,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  return data.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    color: d.color,
    fields: d.fields || [],
    tableTemplates: d.table_templates || [],
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }));
}

/**
 * Récupère les paramètres d'affichage pour une organisation
 */
export async function getAnnotationSettings(
  organizationId: string
): Promise<AnnotationDisplaySettings> {
  const { data, error } = await supabase
    .from('annotation_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return DEFAULT_DISPLAY_SETTINGS;
    }
    console.error('Error fetching settings:', error);
    throw error;
  }

  return {
    showLabels: data.show_labels ?? true,
    selectedDictionaryId: data.selected_dictionary_id,
  };
}

/**
 * Récupère la collection complète (dictionnaires + paramètres)
 */
export async function getAnnotationCollection(
  organizationId: string
): Promise<AnnotationDictionaryCollection> {
  const [dictionaries, displaySettings] = await Promise.all([
    getAnnotationDictionaries(organizationId),
    getAnnotationSettings(organizationId),
  ]);

  return { dictionaries, displaySettings };
}

/**
 * Crée un nouveau dictionnaire
 */
export async function createDictionary(
  organizationId: string,
  dictionary: Omit<AnnotationDictionary, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AnnotationDictionary> {
  const { data, error } = await supabase
    .from('annotation_dictionaries')
    .insert({
      organization_id: organizationId,
      name: dictionary.name,
      description: dictionary.description,
      color: dictionary.color,
      fields: dictionary.fields,
      table_templates: dictionary.tableTemplates,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    color: data.color,
    fields: data.fields || [],
    tableTemplates: data.table_templates || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Met à jour un dictionnaire existant
 */
export async function updateDictionary(
  dictionaryId: string,
  updates: Partial<Omit<AnnotationDictionary, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<AnnotationDictionary> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.fields !== undefined) updateData.fields = updates.fields;
  if (updates.tableTemplates !== undefined) updateData.table_templates = updates.tableTemplates;

  const { data, error } = await supabase
    .from('annotation_dictionaries')
    .update(updateData)
    .eq('id', dictionaryId)
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    color: data.color,
    fields: data.fields || [],
    tableTemplates: data.table_templates || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Supprime un dictionnaire
 */
export async function deleteDictionary(dictionaryId: string): Promise<void> {
  const { error } = await supabase
    .from('annotation_dictionaries')
    .delete()
    .eq('id', dictionaryId);

  if (error) throw error;
}

/**
 * Met à jour les paramètres d'affichage
 */
export async function updateAnnotationSettings(
  organizationId: string,
  settings: Partial<AnnotationDisplaySettings>
): Promise<AnnotationDisplaySettings> {
  // Vérifier si des paramètres existent déjà
  const { data: existing } = await supabase
    .from('annotation_settings')
    .select('id')
    .eq('organization_id', organizationId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('annotation_settings')
      .update({
        show_labels: settings.showLabels,
        selected_dictionary_id: settings.selectedDictionaryId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    return {
      showLabels: data.show_labels ?? true,
      selectedDictionaryId: data.selected_dictionary_id,
    };
  } else {
    const { data, error } = await supabase
      .from('annotation_settings')
      .insert({
        organization_id: organizationId,
        show_labels: settings.showLabels ?? true,
        selected_dictionary_id: settings.selectedDictionaryId,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      showLabels: data.show_labels ?? true,
      selectedDictionaryId: data.selected_dictionary_id,
    };
  }
}

/**
 * Réinitialise tous les dictionnaires aux valeurs par défaut
 */
export async function resetAllDictionaries(organizationId: string): Promise<void> {
  // Supprimer tous les dictionnaires existants
  await supabase
    .from('annotation_dictionaries')
    .delete()
    .eq('organization_id', organizationId);

  // Réinitialiser les paramètres
  await supabase
    .from('annotation_settings')
    .delete()
    .eq('organization_id', organizationId);
}
