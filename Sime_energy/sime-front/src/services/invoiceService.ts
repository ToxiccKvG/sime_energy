/**
 * Service pour gérer les opérations liées aux factures
 * Endpoints: /process-file/pdf-invoices, /process-file/excel-invoices, /process-file/invoice-tables-to-json
 */

import { backendHeaders } from './backend-client';

export interface StructuredExtractedData {
  isPdf: boolean;
  fileName: string;
  pageNumber?: number;
  sections: Record<string, Record<string, FieldMetadata>>;
  customFields: Record<string, FieldMetadata>;
  measurements?: any;
  kpis?: any;
  pageImage?: string;
  imageWidth?: number;
  imageHeight?: number;
  forms?: Array<{
    Key: string;
    Value: string;
    box: [number, number, number, number];
  }>;
  tables?: Array<{
    box: [number, number, number, number];
    rows: Array<Array<{
      text: string;
      box: [number, number, number, number];
    }>>;
  }>;
}

export interface FieldMetadata {
  value: string;
  coordinates: [number, number, number, number];
  page: number;
  confidence: number;
  original_text: string;
}

export interface ProcessingInfo {
  totalInvoices?: number;
  totalTables?: number;
  tableCount?: number;
  totalConsumption?: number | null;
  totalAmount?: number | null;
  hasTemplates?: boolean;
  fileName?: string;
  consumption?: {
    total: number;
    average: number;
    stdDeviation: number;
    min: number;
    max: number;
    count: number;
  };
  amount?: {
    total: number;
    average: number;
    min: number;
    max: number;
    count: number;
  };
}

export interface BackendInvoiceResponse {
  dictionary?: {
    id: string;
    name: string;
  };
  fileName: string;
  pageNumber: number;
  tables: Array<{
    tableName?: string;
    templateId?: string;
    templateName?: string;
    headers?: string[];
    rowHeaders?: string[];
    rows: Array<Record<string, any>>;
    missingHeaders?: string[];
    excelMappingsUsed?: boolean;
    rowCount: number;
    columnCount: number;
  }>;
  unifiedData: Record<string, any>;
  processingInfo: ProcessingInfo;
}

const API_URL = import.meta.env.VITE_API_URL;

const INVOICE_ENDPOINTS = {
  pdf: "/processing/process-file/pdf-invoices",
  excel: "/processing/process-file/excel-invoices",
} as const;

function invoiceEndpoint(fileName: string): string | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return INVOICE_ENDPOINTS.pdf;
  if (name.endsWith(".xls") || name.endsWith(".xlsx")) return INVOICE_ENDPOINTS.excel;
  return null;
}

export interface InvoiceProcessingContext {
  invoiceId: string;
  auditId: string;
  organizationId: string;
}

/**
 * Envoie une facture déjà créée en base (statut « pending ») au backend pour OCR / lecture Excel.
 * Le backend met lui-même la facture à jour. Lève une erreur (avec `status` HTTP) en cas d'échec.
 */
export async function processInvoiceFile(file: File, ctx: InvoiceProcessingContext): Promise<void> {
  const endpoint = invoiceEndpoint(file.name);
  if (!endpoint) throw new Error("Format de fichier non supporté. Veuillez utiliser PDF, XLS ou XLSX.");

  await withRetry(
    async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("file_name", file.name);
      formData.append("invoice_id", ctx.invoiceId);
      formData.append("audit_id", ctx.auditId);
      formData.append("organization_id", ctx.organizationId);

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: await backendHeaders(),
        body: formData,
      });
      if (!response.ok) {
        const detail = await response.json().then(b => b?.detail).catch(() => null);
        const error = new Error(detail || `HTTP ${response.status}`) as Error & { status: number };
        error.status = response.status;
        throw error;
      }
    },
    // L'OCR d'un PDF de plusieurs pages peut dépasser une minute
    { maxAttempts: 2, timeoutMs: 180_000 },
    `processInvoiceFile:${file.name}`,
  );
}

/**
 * Option pour mapper les tables à un nom de template (dictionnaire)
 */
export interface TableTemplateMapping {
  tableIndex: number;
  tableName: string; // nom du tableau (template du dictionnaire)
}

export interface InvoiceTablesToJsonPayload {
  dictionary_name?: string;
  dictionary_id?: string;
  pages: Array<{
    fileName: string;
    page_number: number;
    tables: Array<{
      box?: [number, number, number, number];
      rows: Array<
        Array<{
          text: string;
          box?: [number, number, number, number];
        }>
      >;
      table_name?: string; // nom du tableau (issu du template dictionnaire)
    }>;
  }>;
}

/**
 * Transforme les données des tableaux en format JSON unifié
 */
export async function transformInvoiceTablesToJson(
  extractedData: StructuredExtractedData[],
  tableMappings?: TableTemplateMapping[],
  dictionaryName?: string,
  dictionaryId?: string
): Promise<BackendInvoiceResponse> {
  const pagesWithTables = extractedData.filter(
    (data) => data.isPdf && data.tables && data.tables.length > 0
  );

  if (pagesWithTables.length === 0) {
    return {
      fileName: '',
      pageNumber: 0,
      tables: [],
      unifiedData: {},
      processingInfo: {
        tableCount: 0,
        totalConsumption: null,
        totalAmount: null,
        hasTemplates: false,
      },
    };
  }

  const invoiceData: InvoiceTablesToJsonPayload = {
    dictionary_name: dictionaryName,
    dictionary_id: dictionaryId,
    pages: pagesWithTables.map((data) => ({
      fileName: data.fileName,
      page_number: data.pageNumber || 1,
      tables: data.tables!.map((table, idx) => ({
        box: table.box,
        rows: table.rows.map((row) =>
          row.map((cell) => ({
            text: cell.text,
            box: cell.box,
          }))
        ),
        table_name: tableMappings?.find((m) => m.tableIndex === idx)?.tableName,
      })),
    })),
  };

  console.log('Envoi au backend /invoice-tables-to-json:', invoiceData);

  const response = await fetch(`${API_URL}/processing/process-file/invoice-tables-to-json`, {
    method: "POST",
    headers: await backendHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(invoiceData),
  });

  if (!response.ok) {
    throw new Error("Erreur lors de la transformation des données");
  }

  const result = await response.json();
  console.log('Réponse du backend:', result);
  return result;
}

/**
 * Configuration pour le retry avec backoff
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

/**
 * Détermine si une erreur est retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    // Erreur réseau (connexion refusée, timeout, etc.)
    return true;
  }

  if (error instanceof Error && 'status' in error) {
    const status = (error as any).status;
    // Retry sur erreurs serveur (5xx) mais pas sur erreurs client (4xx)
    return status >= 500;
  }

  // Par défaut, considérer comme non-retryable
  return false;
}

/**
 * Génère un délai avec jitter pour éviter les thundering herd
 */
function getBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Fonction utilitaire générique pour retry avec backoff exponentiel
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  context?: string
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    timeoutMs = 60000,
  } = options;

  let lastError: unknown;
  const startTime = Date.now();
  const logPrefix = context ? `[Retry:${context}]` : '[Retry]';

  console.log(`${logPrefix} Démarrage opération (${maxAttempts} tentatives max)`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptStartTime = Date.now();

    try {
      console.log(`${logPrefix} Tentative ${attempt + 1}/${maxAttempts}`);

      // Créer un AbortController pour le timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Exécuter l'opération avec timeout
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error(`Timeout après ${timeoutMs}ms`))
          );
        })
      ]);

      clearTimeout(timeoutId);
      const duration = Date.now() - attemptStartTime;

      console.log(`${logPrefix} Succès à la tentative ${attempt + 1} (${duration}ms)`);

      return result;

    } catch (err) {
      const duration = Date.now() - attemptStartTime;
      lastError = err;

      console.warn(`${logPrefix} Échec tentative ${attempt + 1}/${maxAttempts} (${duration}ms):`, err);

      // Dernière tentative : arrêter
      if (attempt === maxAttempts - 1) {
        break;
      }

      // Vérifier si l'erreur est retryable
      if (!isRetryableError(err)) {
        console.warn(`${logPrefix} Erreur non-retryable détectée, arrêt immédiat`);
        break;
      }

      // Calculer le délai avant retry
      const delay = getBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      console.log(`${logPrefix} Retry dans ${Math.round(delay)}ms...`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const totalDuration = Date.now() - startTime;
  const errorMessage = `Opération échouée après ${maxAttempts} tentatives (${totalDuration}ms)`;

  console.error(`${logPrefix} ${errorMessage}`, lastError);

  throw lastError instanceof Error
    ? new Error(`${errorMessage}: ${lastError.message}`)
    : new Error(errorMessage);
}

/**
 * Appelle transformInvoiceTablesToJson avec backoff exponentiel production-ready
 */
export async function transformInvoiceTablesToJsonWithRetry(
  extractedData: StructuredExtractedData[],
  tableMappings?: TableTemplateMapping[],
  dictionaryName?: string,
  dictionaryId?: string,
  options: RetryOptions = {}
): Promise<BackendInvoiceResponse> {
  const pageCount = extractedData.length;
  const tableCount = extractedData.reduce((sum, data) => sum + (data.tables?.length || 0), 0);

  return withRetry(
    () => transformInvoiceTablesToJson(extractedData, tableMappings, dictionaryName, dictionaryId),
    {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      timeoutMs: 30000,
      ...options,
    },
    `Transform:${pageCount}pages-${tableCount}tables`
  );
}

