import ExcelJS from 'exceljs';

function unwrapCellValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  const obj = v as Record<string, unknown>;
  if (Array.isArray(obj['richText'])) {
    return (obj['richText'] as Array<{ text: string }>).map(r => r.text).join('');
  }
  if ('result' in obj) return obj['result'] ?? null;
  if ('error' in obj) return null;
  if ('hyperlink' in obj) return obj['text'] ?? obj['hyperlink'];
  return v;
}

function triggerDownload(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---- Lecture : détection du format au CONTENU, pas à l'extension ----
//
// ExcelJS ne lit que le .xlsx (un zip). Depuis le remplacement de SheetJS
// (a9cee302, CVE), tout autre fichier échouait avec « Can't find end of
// central directory » — y compris les CSV et les exports de loggers nommés
// « .xls » qui sont en réalité du texte. On regarde donc les premiers
// octets :
//   50 4B 03 04  → zip  → xlsx (ExcelJS)
//   D0 CF 11 E0  → OLE2 → .xls binaire 97-2003 : non pris en charge, message clair
//   sinon        → texte → CSV / TSV (séparateur détecté)

export class UnsupportedSpreadsheetError extends Error {}

function sniffFormat(buffer: ArrayBuffer): 'xlsx' | 'xls' | 'text' {
  const b = new Uint8Array(buffer.slice(0, 4));
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'xlsx';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls';
  return 'text';
}

function decodeText(buffer: ArrayBuffer): string {
  // UTF-8 avec BOM éventuel ; repli latin-1 si le flux n'est pas de l'UTF-8 valide
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/** Séparateur le plus fréquent hors guillemets sur les 20 premières lignes. */
function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20);
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0, '|': 0 };
  for (const line of sample) {
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch in counts) counts[ch]++;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Convertit une cellule texte en nombre / date quand c'est sans ambiguïté, sinon la laisse en string. */
function coerceCell(raw: string): unknown {
  const v = raw.trim();
  if (v === '') return null;
  // nombre : « 1234.5 », « 1 234,5 », « -12 »
  if (/^-?\d{1,3}(?:[ \u00a0]\d{3})*(?:[.,]\d+)?$/.test(v) || /^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$/.test(v)) {
    const n = Number(v.replace(/[ \u00a0]/g, '').replace(',', '.'));
    if (!isNaN(n)) return n;
  }
  return v;
}

/** Parseur CSV minimal (RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans les cellules). */
function parseCsv(text: string, delimiter: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row.map(coerceCell));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row.map(coerceCell));
  return stripPreamble(rows);
}

/**
 * Les exports d'enregistreurs (loggers H&T, analyseurs) commencent souvent par
 * un en-tête libre — « >>Logging Name:… », « >>Sample Rate:1800 sec. », une
 * ligne de tirets — avant le vrai tableau. Ces lignes n'ont qu'une cellule
 * alors que le tableau en a N : on saute tout ce qui précède la première ligne
 * ayant le nombre de colonnes majoritaire.
 */
function stripPreamble(rows: unknown[][]): unknown[][] {
  if (rows.length < 3) return rows;
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (modal < 2) return rows;
  const start = rows.findIndex(r => r.length >= modal);
  return start > 0 ? rows.slice(start) : rows;
}

// READ: parse a spreadsheet ArrayBuffer (xlsx or CSV/TSV); returns sheet names + raw rows per sheet
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<{
  sheetNames: string[];
  getRows(name: string): unknown[][];
}> {
  const format = sniffFormat(buffer);

  if (format === 'xls') {
    throw new UnsupportedSpreadsheetError(
      "Fichier Excel 97-2003 (.xls binaire) : ce format n'est pas pris en charge. Ouvrez-le dans Excel et enregistrez-le en « Classeur Excel (.xlsx) », ou exportez-le en CSV.",
    );
  }

  if (format === 'text') {
    const text = decodeText(buffer);
    if (/^\s*<(!doctype|html|table)/i.test(text)) {
      throw new UnsupportedSpreadsheetError(
        "Ce fichier est une page HTML déguisée en tableur (export d'appareil). Ouvrez-le dans Excel et enregistrez-le en .xlsx ou en CSV.",
      );
    }
    const rows = parseCsv(text, detectDelimiter(text));
    if (rows.length === 0) throw new UnsupportedSpreadsheetError('Fichier texte vide ou illisible.');
    return { sheetNames: ['CSV'], getRows: (name) => (name === 'CSV' ? rows : []) };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetData: Record<string, unknown[][]> = {};
  workbook.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map(unwrapCellValue);
      rows.push(vals);
    });
    sheetData[ws.name] = rows;
  });

  return {
    sheetNames: workbook.worksheets.map(ws => ws.name),
    getRows: (name) => sheetData[name] ?? [],
  };
}

// READ: convert raw rows (first row = headers) to array of objects
// Equivalent to XLSX.utils.sheet_to_json(ws, { defval: null, raw: false, dateNF: 'YYYY-MM-DD' })
export function rowsToObjects(
  rawRows: unknown[][],
  opts?: { dateNF?: string; defval?: unknown }
): Record<string, unknown>[] {
  if (rawRows.length < 2) return [];
  const headers = (rawRows[0] as unknown[]).map(h => String(h ?? ''));
  return rawRows.slice(1).map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      let val: unknown = (row as unknown[])[i] ?? opts?.defval ?? null;
      if (val instanceof Date && opts?.dateNF === 'YYYY-MM-DD') {
        val = `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
      }
      if (h) obj[h] = val;
    });
    return obj;
  });
}

// WRITE: export array of objects as a single-sheet xlsx download
export async function exportJsonToXlsx(
  data: Record<string, unknown>[],
  sheetName: string,
  filename: string,
  opts?: { header?: string[]; autoFilter?: boolean }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);
  if (data.length > 0) {
    const keys = opts?.header ?? Object.keys(data[0]);
    ws.addRow(keys);
    data.forEach(row => ws.addRow(keys.map(k => row[k] ?? null)));
    if (opts?.autoFilter) {
      ws.autoFilter = { from: 'A1', to: { row: 1, column: keys.length } };
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

// WRITE: export 2D array (array of arrays) as a single-sheet xlsx download
export async function exportAoaToXlsx(
  rows: unknown[][],
  sheetName: string,
  filename: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);
  rows.forEach(row => ws.addRow(row as ExcelJS.CellValue[]));
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

// WRITE: export multiple sheets as a single xlsx download
export async function exportMultiSheetXlsx(
  sheets: Array<{
    name: string;
    data: Record<string, unknown>[] | unknown[][];
    autoFilter?: boolean;
    header?: string[];
  }>,
  filename: string
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    if (!sheet.data.length) continue;
    if (Array.isArray(sheet.data[0])) {
      (sheet.data as unknown[][]).forEach(row => ws.addRow(row as ExcelJS.CellValue[]));
    } else {
      const objData = sheet.data as Record<string, unknown>[];
      const keys = sheet.header ?? Object.keys(objData[0]);
      ws.addRow(keys);
      objData.forEach(row => ws.addRow(keys.map(k => row[k] ?? null)));
      if (sheet.autoFilter) {
        ws.autoFilter = { from: 'A1', to: { row: 1, column: keys.length } };
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}
