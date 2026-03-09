/**
 * Service pour gérer les opérations liées aux factures
 * Endpoints: /process-file/pdf-invoices, /process-file/excel-invoices, /process-file/invoice-tables-to-json
 */

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

export interface InvoiceResult {
  fileName: string;
  pageNumber: number;
  unifiedData: Record<string, any>;
  tableCount: number;
  columnCount: number;
  columns: string[];
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

/**
 * Upload et traite un fichier de facture (PDF ou Excel)
 */
export async function uploadInvoiceFile(file: File): Promise<StructuredExtractedData[]> {
  const endpoint = file.name.endsWith(".pdf")
    ? "/processing/process-file/pdf-invoices"
    : file.name.endsWith(".xls") || file.name.endsWith(".xlsx")
      ? "/processing/process-file/excel-invoices"
      : null;

  if (!endpoint) {
    throw new Error("Format de fichier non supporté. Veuillez utiliser PDF, XLS ou XLSX.");
  }

  return withRetry(
    async () => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const responseData = await response.json();
      const uploadedData: StructuredExtractedData[] = [];
      const isPdfFile = file.name.endsWith(".pdf");

      if (isPdfFile) {
        // Nouvelle structure pour PDF
        if (responseData.pages && Array.isArray(responseData.pages)) {
          responseData.pages.forEach((page: any) => {
            uploadedData.push({
              isPdf: true,
              fileName: responseData.fileName || file.name,
              pageNumber: page.page_number,
              sections: {},
              customFields: {},
              pageImage: page.image,
              imageWidth: page.width,
              imageHeight: page.height,
              forms: page.forms || [],
              tables: page.tables || [],
            });
          });
        }
      } else {
        // Structure pour Excel
        const dataArray = Array.isArray(responseData) ? responseData : [responseData];
        dataArray.forEach((extracted: any) => {
          uploadedData.push({
            isPdf: false,
            fileName: file.name,
            pageNumber: undefined,
            sections: extracted.sections || {},
            customFields: extracted.customFields || {},
          });
        });
      }

      return uploadedData;
    },
    {
      maxAttempts: 3,
      baseDelayMs: 2000, // Plus long pour les gros fichiers
      maxDelayMs: 30000,
      timeoutMs: 120000, // 2 minutes
    },
    `Upload:${file.name}`
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

export interface InvoiceTablesToJsonResponse {
  invoices: InvoiceResult[];
  processingInfo: ProcessingInfo;
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
    headers: {
      "Content-Type": "application/json",
    },
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

/**
 * Extrait les bounding boxes d'un PDF
 */
export function getBoundingBoxesForPdf(
  data: StructuredExtractedData
): Array<{
  fieldKey: string;
  coordinates: [number, number, number, number];
  confidence: number;
  isSelected: boolean;
  type?: "form" | "table" | "cell";
  tableIndex?: number;
}> {
  const boundingBoxes: Array<{
    fieldKey: string;
    coordinates: [number, number, number, number];
    confidence: number;
    isSelected: boolean;
    type?: "form" | "table" | "cell";
    tableIndex?: number;
  }> = [];

  // Extraire les bounding boxes depuis forms
  if (data.isPdf && data.forms && Array.isArray(data.forms)) {
    data.forms.forEach((form, index) => {
      if (form.box) {
        boundingBoxes.push({
          fieldKey: form.Key || `field_${index}`,
          coordinates: form.box,
          confidence: 100,
          isSelected: false,
          type: "form",
        });
      }
    });
  }

  // Ajouter les bounding boxes des tables
  if (data.isPdf && data.tables && Array.isArray(data.tables)) {
    data.tables.forEach((table, tableIndex) => {
      if (table.box) {
        boundingBoxes.push({
          fieldKey: `table_${tableIndex}`,
          coordinates: table.box,
          confidence: 100,
          isSelected: false,
          type: "table",
          tableIndex: tableIndex,
        });
      }
    });
  }

  return boundingBoxes;
}

/**
 * Récupère les sections PDF ou les valeurs par défaut
 */
export function getPdfSections(
  data: StructuredExtractedData
): Record<string, Record<string, FieldMetadata>> {
  if (!data.isPdf || !data.forms) {
    return data.sections || {};
  }

  const sections: Record<string, Record<string, FieldMetadata>> = {};

  data.forms.forEach((form) => {
    if (!sections.formulaires) {
      sections.formulaires = {};
    }

    sections.formulaires[form.Key] = {
      value: form.Value,
      coordinates: form.box,
      confidence: 1.0,
      page: data.pageNumber || 1,
      original_text: form.Value,
    };
  });

  return sections;
}

/**
 * Récupère les champs personnalisés PDF ou les valeurs par défaut
 */
export function getPdfCustomFields(
  data: StructuredExtractedData
): Record<string, FieldMetadata> {
  if (!data.isPdf || !data.forms) {
    return data.customFields || {};
  }

  const customFields: Record<string, FieldMetadata> = {};

  data.forms.forEach((form) => {
    customFields[form.Key] = {
      value: form.Value,
      coordinates: form.box,
      confidence: 1.0,
      page: data.pageNumber || 1,
      original_text: form.Value,
    };
  });

  return customFields;
}
