// ============================================================
// JSON gzippé dans un bucket Supabase Storage — commun aux modules
// IOT (iot-files) et Mesures (measurement-files).
//
// Compression côté navigateur (CompressionStream) : un jeu de mesures
// pèse 10 à 60× moins une fois gzippé, ce qui compte sur une connexion
// lente. Repli 'identity' (JSON brut) si l'API manque.
// ============================================================

import { supabase } from '@/lib/supabase';

export type ContentEncoding = 'gzip' | 'identity';

const canGzip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** Restaure les Date sérialisées en ISO par JSON.stringify. */
export function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return value;
}

async function encode(value: unknown): Promise<{ blob: Blob; encoding: ContentEncoding }> {
  const json = JSON.stringify(value);
  if (!canGzip) return { blob: new Blob([json], { type: 'application/json' }), encoding: 'identity' };
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const gz = await new Response(stream).blob();
  return { blob: new Blob([gz], { type: 'application/gzip' }), encoding: 'gzip' };
}

async function decode<T>(blob: Blob, encoding: ContentEncoding, reviveDates: boolean): Promise<T> {
  let text: string;
  if (encoding === 'gzip') {
    if (!canGzip) throw new Error('Ce navigateur ne sait pas décompresser le contenu (DecompressionStream absent).');
    text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else {
    text = await blob.text();
  }
  return JSON.parse(text, reviveDates ? dateReviver : undefined) as T;
}

export function objectPath(userId: string, id: string, encoding: ContentEncoding): string {
  return `${userId}/${id}.json${encoding === 'gzip' ? '.gz' : ''}`;
}

/** Envoie `value` dans `bucket` sous {userId}/{id}.json[.gz] ; renvoie le chemin et l'encodage. */
export async function uploadJson(bucket: string, userId: string, id: string, value: unknown) {
  const { blob, encoding } = await encode(value);
  const path = objectPath(userId, id, encoding);
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw error;
  return { path, encoding };
}

export async function downloadJson<T>(bucket: string, path: string, encoding: ContentEncoding, opts?: { reviveDates?: boolean }): Promise<T> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return decode<T>(data, encoding, opts?.reviveDates ?? false);
}

export async function removeObject(bucket: string, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
