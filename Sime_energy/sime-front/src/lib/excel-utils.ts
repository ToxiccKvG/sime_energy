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

// READ: parse an xlsx ArrayBuffer; returns sheet names + raw rows per sheet
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<{
  sheetNames: string[];
  getRows(name: string): unknown[][];
}> {
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
