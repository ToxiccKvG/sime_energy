// ============================================================
// Service — Fichiers importés du module IOT
// Table : iot_files (métadonnées) + bucket iot-files (contenu)
// Migration : 20260916_iot_files
//
// Un fichier = une ligne iot_files (légère, listée à l'ouverture du
// module) + un objet du bucket portant rawData en JSON gzippé,
// téléchargé à la première ouverture. L'isolation est par
// utilisateur : le chemin de l'objet commence par auth.uid() et les
// policies (table et storage) ne laissent passer que le propriétaire.
// ============================================================

import { supabase } from '@/lib/supabase';
import type { ImportedFile } from '@/components/iot/shared';
import { uploadJson, downloadJson, removeObject, type ContentEncoding } from '@/lib/storage-json';

const BUCKET = 'iot-files';

/** Ligne iot_files telle que renvoyée par PostgREST. */
interface IotFileRow {
  id: string;
  name: string;
  type: ImportedFile['type'];
  statut: NonNullable<ImportedFile['statut']>;
  row_count: number;
  columns: string[];
  preview: Record<string, unknown>[];
  taille: number | null;
  parent_id: string | null;
  device_location: string | null;
  device_room: string | null;
  storage_path: string | null;
  content_encoding: ContentEncoding;
  uploaded_at: string;
}

const ROW_COLUMNS =
  'id,name,type,statut,row_count,columns,preview,taille,parent_id,device_location,device_room,storage_path,content_encoding,uploaded_at';

// ---- Conversions ligne ↔ ImportedFile ----

function rowToFile(r: IotFileRow): ImportedFile {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    uploadedAt: new Date(r.uploaded_at),
    rowCount: r.row_count,
    columns: r.columns ?? [],
    preview: r.preview ?? [],
    // Le contenu n'est pas dans la liste : il arrive via fetchFileContent.
    rawData: [],
    contentLoaded: false,
    statut: r.statut,
    taille: r.taille ?? undefined,
    parentId: r.parent_id ?? undefined,
    deviceLocation: r.device_location ?? undefined,
    deviceRoom: r.device_room ?? undefined,
  };
}

/** Partie métadonnées d'un ImportedFile (tout sauf rawData). */
function fileToRow(f: Partial<ImportedFile>): Partial<IotFileRow> {
  const row: Partial<IotFileRow> = {};
  if (f.name !== undefined)           row.name = f.name;
  if (f.type !== undefined)           row.type = f.type;
  if (f.statut !== undefined)         row.statut = f.statut;
  if (f.rowCount !== undefined)       row.row_count = f.rowCount;
  if (f.columns !== undefined)        row.columns = f.columns;
  if (f.preview !== undefined)        row.preview = f.preview;
  if (f.taille !== undefined)         row.taille = f.taille ?? null;
  if (f.parentId !== undefined)       row.parent_id = f.parentId ?? null;
  if (f.deviceLocation !== undefined) row.device_location = f.deviceLocation ?? null;
  if (f.deviceRoom !== undefined)     row.device_room = f.deviceRoom ?? null;
  if (f.uploadedAt !== undefined)     row.uploaded_at = f.uploadedAt.toISOString();
  return row;
}

// ---- Contenu : JSON gzippé dans le bucket (lib/storage-json.ts) ----
//
// Même convention que l'ancien localStorage : les Date sérialisées en ISO
// sont restaurées à la lecture (fichiers nettoyés, ShellyRow.date).

async function uploadContent(userId: string, fileId: string, rawData: Record<string, unknown>[]) {
  return uploadJson(BUCKET, userId, fileId, rawData);
}

// ---- API ----

export async function listFiles(): Promise<ImportedFile[]> {
  const { data, error } = await supabase
    .from('iot_files')
    .select(ROW_COLUMNS)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as IotFileRow[]).map(rowToFile);
}

/**
 * Crée la ligne puis envoie le contenu. Si l'envoi échoue, la ligne
 * reste avec storage_path NULL : le fichier apparaît dans la liste mais
 * son ouverture signale l'absence de contenu — mieux qu'une perte
 * invisible.
 */
export async function createFile(
  file: ImportedFile,
  userId: string,
  organizationId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('iot_files')
    .insert({ id: file.id, created_by: userId, organization_id: organizationId, ...fileToRow(file) });
  if (error) throw error;

  const { path, encoding } = await uploadContent(userId, file.id, file.rawData);
  const { error: patchError } = await supabase
    .from('iot_files')
    .update({ storage_path: path, content_encoding: encoding })
    .eq('id', file.id);
  if (patchError) throw patchError;
}

/** Met à jour les métadonnées et, si `rawData` est fourni, remplace le contenu. */
export async function updateFile(
  id: string,
  patch: Partial<ImportedFile>,
  userId: string,
): Promise<void> {
  const row = fileToRow(patch);
  if (patch.rawData !== undefined) {
    const { path, encoding } = await uploadContent(userId, id, patch.rawData);
    row.storage_path = path;
    row.content_encoding = encoding;
  }
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('iot_files').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteFile(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('iot_files')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  const path = (data as { storage_path: string | null } | null)?.storage_path;
  if (path) await removeObject(BUCKET, path);
  const { error: delError } = await supabase.from('iot_files').delete().eq('id', id);
  if (delError) throw delError;
}

export async function fetchFileContent(id: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('iot_files')
    .select('storage_path,content_encoding')
    .eq('id', id)
    .single();
  if (error) throw error;

  const { storage_path, content_encoding } = data as Pick<IotFileRow, 'storage_path' | 'content_encoding'>;
  if (!storage_path) throw new Error("Le contenu de ce fichier n'a pas été enregistré (envoi interrompu). Réimportez-le.");

  const rows = await downloadJson<unknown>(BUCKET, storage_path, content_encoding, { reviveDates: true });
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}
