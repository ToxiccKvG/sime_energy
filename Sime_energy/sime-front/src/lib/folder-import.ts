// ============================================================
// Import de dossiers — commun aux modules Mesures et IOT
//
// Deux voies : le sélecteur de dossier du navigateur (<input webkitdirectory>)
// et le glisser-déposer d'un dossier (DataTransferItem.webkitGetAsEntry,
// parcouru récursivement). Dans les deux cas on ne garde que les fichiers
// utiles et on écarte les parasites que les dossiers de terrain traînent
// toujours : `._xxx` (AppleDouble sur clés USB/SSD), `~$xxx` (verrous
// Excel), `.DS_Store`, `Thumbs.db`.
// ============================================================

const JUNK_RE = /^(\._|~\$|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;

/** Vrai si le fichier mérite d'être importé (extension acceptée, pas un parasite). */
export function isImportable(file: File, accept: RegExp): boolean {
  const name = file.name.split('/').pop() ?? file.name;
  return !JUNK_RE.test(name) && accept.test(name);
}

type FSEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (entries: FSEntry[]) => void, err?: (e: unknown) => void) => void };
};

function readAllEntries(dir: FSEntry): Promise<FSEntry[]> {
  // readEntries ne renvoie qu'un lot (≤ 100 dans Chrome) : boucler jusqu'à vide.
  const reader = dir.createReader!();
  const all: FSEntry[] = [];
  return new Promise((resolve, reject) => {
    const next = () => reader.readEntries(batch => {
      if (batch.length === 0) resolve(all);
      else { all.push(...batch); next(); }
    }, reject);
    next();
  });
}

async function walk(entry: FSEntry, out: File[], accept: RegExp, depth: number): Promise<void> {
  if (entry.isFile && entry.file) {
    const f = await new Promise<File>((res, rej) => entry.file!(res, rej));
    if (isImportable(f, accept)) out.push(f);
  } else if (entry.isDirectory && entry.createReader && depth < 8) {
    if (JUNK_RE.test(entry.name)) return;
    for (const child of await readAllEntries(entry)) await walk(child, out, accept, depth + 1);
  }
}

/**
 * Fichiers d'un glisser-déposer, dossiers compris (parcours récursif).
 * Repli sur `dataTransfer.files` si le navigateur n'expose pas les entrées.
 */
export async function filesFromDataTransfer(dt: DataTransfer, accept: RegExp): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries: FSEntry[] = [];
  for (const it of items) {
    const entry = (it as DataTransferItem & { webkitGetAsEntry?: () => FSEntry | null }).webkitGetAsEntry?.() ?? null;
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) {
    return Array.from(dt.files).filter(f => isImportable(f, accept));
  }
  const out: File[] = [];
  for (const e of entries) await walk(e, out, accept, 0);
  return out;
}

/** Fichiers d'un <input type="file"> (avec ou sans webkitdirectory), filtrés. */
export function filesFromInput(list: FileList | null, accept: RegExp): File[] {
  return list ? Array.from(list).filter(f => isImportable(f, accept)) : [];
}

/** Pose l'attribut non standard `webkitdirectory` sur un input (absent des types React). */
export function directoryInputProps(): Record<string, string> {
  return { webkitdirectory: '', directory: '' };
}
