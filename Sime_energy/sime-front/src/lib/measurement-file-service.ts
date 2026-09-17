// ============================================================
// Service — Relevés du module Mesures
// Table : measurement_files (métadonnées) + bucket measurement-files (contenu)
// Migration : 20260917_measurement_files
//
// Un relevé = le résultat normalisé du backend (`MeasurementData` sans les
// KPI, recalculés à la lecture) stocké en JSON gzippé, plus une ligne de
// métadonnées pour la liste. Isolation par utilisateur (chemin de l'objet
// = auth.uid()/…, policies table et storage sur le propriétaire).
// ============================================================

import { supabase } from '@/lib/supabase';
import type { MeasurementData } from '@/services/measurementService';
import { computeMeasurementKpis } from '@/services/measurementStats';
import { uploadJson, downloadJson, removeObject, type ContentEncoding } from '@/lib/storage-json';

const BUCKET = 'measurement-files';

interface MeasurementFileRow {
  id: string;
  file_name: string;
  alias: string | null;
  sensor_type: string;
  sensor_label: string | null;
  metric_label: string | null;
  unit: string | null;
  quantity_kind: MeasurementData['quantity_kind'] | null;
  measurement_count: number;
  period_start: string | null;
  period_end: string | null;
  storage_path: string | null;
  content_encoding: ContentEncoding;
  uploaded_at: string;
}

const ROW_COLUMNS =
  'id,file_name,alias,sensor_type,sensor_label,metric_label,unit,quantity_kind,measurement_count,period_start,period_end,storage_path,content_encoding,uploaded_at';

/** Ce qui part dans le bucket : tout sauf les KPI (dérivés) et l'identité (dans la ligne). */
type StoredContent = Pick<MeasurementData, 'measurements' | 'sensor_type' | 'metric_label' | 'unit' | 'quantity_kind'> & {
  processing_info?: unknown;
};

function periodOf(measurements: { timestamp?: string }[] | undefined): { start: string | null; end: string | null } {
  if (!measurements || measurements.length === 0) return { start: null, end: null };
  const first = measurements[0]?.timestamp ?? null;
  const last = measurements[measurements.length - 1]?.timestamp ?? null;
  return { start: first, end: last };
}

function withKpis(d: MeasurementData): MeasurementData {
  try {
    d.kpis = computeMeasurementKpis(d.measurements ?? [], {
      unit: d.unit ?? '',
      metricLabel: d.metric_label ?? 'Valeur',
      quantityKind: d.quantity_kind ?? 'energy',
    });
  } catch (e) {
    console.warn('Impossible de calculer les statistiques du relevé :', e);
  }
  return d;
}

// ---- API ----

/** Métadonnées de tous les relevés de l'utilisateur, du plus ancien au plus récent. */
export async function listMeasurementFiles(): Promise<MeasurementFileRow[]> {
  const { data, error } = await supabase
    .from('measurement_files')
    .select(ROW_COLUMNS)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MeasurementFileRow[];
}

/** Télécharge le contenu d'un relevé et le rend prêt pour la session (KPI recalculés). */
export async function loadMeasurementFile(row: MeasurementFileRow): Promise<MeasurementData> {
  if (!row.storage_path) throw new Error(`Le contenu de « ${row.alias ?? row.file_name} » n'a pas été enregistré (envoi interrompu). Réimportez-le.`);
  const content = await downloadJson<StoredContent>(BUCKET, row.storage_path, row.content_encoding);
  return withKpis({
    id: row.id,
    file_name: row.file_name,
    alias: row.alias ?? undefined,
    sensor_type: content.sensor_type ?? row.sensor_type,
    metric_label: content.metric_label ?? row.metric_label ?? undefined,
    unit: content.unit ?? row.unit ?? undefined,
    quantity_kind: content.quantity_kind ?? row.quantity_kind ?? undefined,
    measurements: content.measurements ?? [],
    processing_info: content.processing_info as MeasurementData['processing_info'],
  });
}

/** Charge toute la bibliothèque (liste + contenus, 4 téléchargements en parallèle). */
export async function loadMeasurementLibrary(
  onError?: (row: MeasurementFileRow, e: unknown) => void,
): Promise<MeasurementData[]> {
  const rows = await listMeasurementFiles();
  const out: (MeasurementData | null)[] = new Array(rows.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      try { out[i] = await loadMeasurementFile(rows[i]); }
      catch (e) { onError?.(rows[i], e); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
  return out.filter((d): d is MeasurementData => d !== null);
}

/**
 * Crée la ligne puis envoie le contenu. Si l'envoi échoue, la ligne reste
 * avec storage_path NULL : le relevé apparaît dans la liste mais son
 * chargement signale l'absence de contenu — mieux qu'une perte invisible.
 */
export async function createMeasurementFile(
  d: MeasurementData & { id: string },
  userId: string,
  organizationId: string | null,
): Promise<void> {
  const period = periodOf(d.measurements);
  const { error } = await supabase.from('measurement_files').insert({
    id: d.id,
    created_by: userId,
    organization_id: organizationId,
    file_name: d.file_name ?? 'relevé',
    alias: d.alias ?? null,
    sensor_type: d.sensor_type ?? 'CUSTOM',
    sensor_label: d.processing_info?.sensor_label ?? null,
    metric_label: d.metric_label ?? null,
    unit: d.unit ?? null,
    quantity_kind: d.quantity_kind ?? null,
    measurement_count: d.measurements?.length ?? 0,
    period_start: period.start,
    period_end: period.end,
  });
  if (error) throw error;

  const content: StoredContent = {
    measurements: d.measurements,
    sensor_type: d.sensor_type,
    metric_label: d.metric_label,
    unit: d.unit,
    quantity_kind: d.quantity_kind,
    processing_info: d.processing_info,
  };
  const { path, encoding } = await uploadJson(BUCKET, userId, d.id, content);
  const { error: patchError } = await supabase
    .from('measurement_files')
    .update({ storage_path: path, content_encoding: encoding })
    .eq('id', d.id);
  if (patchError) throw patchError;
}

export async function renameMeasurementFile(id: string, alias: string | null): Promise<void> {
  const { error } = await supabase.from('measurement_files').update({ alias }).eq('id', id);
  if (error) throw error;
}

export async function deleteMeasurementFile(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('measurement_files')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const path = (data as { storage_path: string | null } | null)?.storage_path;
  if (path) await removeObject(BUCKET, path);
  const { error: delError } = await supabase.from('measurement_files').delete().eq('id', id);
  if (delError) throw delError;
}
