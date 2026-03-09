/**
 * Service pour orchestrer le workflow complet d'un audit
 * Combine tous les services (invoice, measurement, export) dans un workflow cohérent
 */

import {
  uploadInvoiceFile,
  transformInvoiceTablesToJson,
  StructuredExtractedData,
  InvoiceResult,
  ProcessingInfo,
} from "./invoiceService";
import {
  uploadMeasurementFile,
  analyzeEnergyLabel,
  processHierarchy,
  generateHierarchyJSON,
  MeasurementData,
  EnergyLabelAnalysis,
  HierarchyData,
} from "./measurementService";
import { generateCSV, exportToExcel, TableRowData } from "./exportService";

export interface AuditWorkflowState {
  // Étape 1-3: Information de base
  norm: string;
  organization: string;
  building: string;

  // Étape 4: Factures
  extractedData: StructuredExtractedData[];
  invoices?: InvoiceResult[];
  processingInfo?: ProcessingInfo;
  tablePreviewData?: TableRowData[];
  isDataTransformed?: boolean;

  // Étape 5: Mesures
  measureFiles: File[];
  measurementData?: MeasurementData[];
  kpis?: any;

  // Étape 6: Schéma
  schemaHierarchy?: HierarchyData;
  hierarchyProcessedData?: any;

  // Étape 7: Exports
  allColumns?: string[];
}

export interface AuditWorkflowHandlers {
  onFilesUploaded: (data: StructuredExtractedData[]) => void;
  onDataTransformed: (invoices: InvoiceResult[], processingInfo: ProcessingInfo) => void;
  onMeasuresUploaded: (data: MeasurementData[]) => void;
  onHierarchyGenerated: (hierarchy: HierarchyData) => void;
  onHierarchyProcessed: (result: any) => void;
  onError: (error: Error) => void;
}

/**
 * Effectue l'import et le traitement des factures en une seule opération
 */
export async function importAndProcessInvoices(
  files: File[],
  handlers: { onProgress?: (current: number, total: number) => void }
): Promise<StructuredExtractedData[]> {
  const uploadedData: StructuredExtractedData[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    handlers.onProgress?.(i, total);

    try {
      const data = await uploadInvoiceFile(file);
      uploadedData.push(...data);
    } catch (error) {
      console.error(`Erreur lors du traitement de ${file.name}:`, error);
      throw new Error(
        `Impossible de traiter ${file.name}: ${error instanceof Error ? error.message : "Erreur inconnue"}`
      );
    }
  }

  handlers.onProgress?.(total, total);
  return uploadedData;
}

/**
 * Effectue l'upload et le traitement des mesures en une seule opération
 */
export async function importAndProcessMeasurements(
  files: File[],
  sensorType: string,
  handlers: { onProgress?: (current: number, total: number) => void }
): Promise<MeasurementData[]> {
  if (!sensorType) {
    throw new Error("Type de capteur requis");
  }

  const uploadedData: MeasurementData[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    handlers.onProgress?.(i, total);

    try {
      const data = await uploadMeasurementFile(file, sensorType);
      uploadedData.push(data);
    } catch (error) {
      console.error(`Erreur lors du traitement de ${file.name}:`, error);
      throw new Error(
        `Impossible de traiter ${file.name}: ${error instanceof Error ? error.message : "Erreur inconnue"}`
      );
    }
  }

  handlers.onProgress?.(total, total);
  return uploadedData;
}

/**
 * Analyse une image d'étiquette énergétique
 */
export async function analyzeEnergyLabelImage(file: File): Promise<EnergyLabelAnalysis> {
  return analyzeEnergyLabel(file);
}

/**
 * Effectue la transformation complète des données
 */
export async function transformAuditData(
  extractedData: StructuredExtractedData[]
): Promise<{ invoices: InvoiceResult[]; processingInfo: ProcessingInfo }> {
  return transformInvoiceTablesToJson(extractedData);
}

/**
 * Génère et traite une hiérarchie de schéma électrique
 */
export async function generateAndProcessHierarchy(
  nodes: Array<{ id: string; data: { label: string; [key: string]: any } }>,
  edges: Array<{ source: string; target: string }>
): Promise<{ hierarchy: HierarchyData; [key: string]: any }> {
  const hierarchyData = generateHierarchyJSON(nodes, edges);
  return processHierarchy(hierarchyData);
}

/**
 * Exporte les données de l'audit
 */
export async function exportAuditData(
  state: AuditWorkflowState,
  format: "csv" | "excel"
): Promise<{ fileName: string; data?: string }> {
  const metadata = {
    norm: state.norm,
    organization: state.organization,
    building: state.building,
  };

  if (format === "csv") {
    const csvContent = generateCSV(state.extractedData);
    const fileName = `audit_${state.organization || "donnees"}_${new Date().toISOString().slice(0, 10)}.csv`;
    return { fileName, data: csvContent };
  } else {
    const dataToExport =
      state.tablePreviewData && state.tablePreviewData.length > 0
        ? state.tablePreviewData
        : state.extractedData;

    exportToExcel(dataToExport as any, {
      ...metadata,
      files: state.measureFiles,
      isDataTransformed: state.isDataTransformed,
    });

    return { fileName: "audit_report.xlsx" };
  }
}

/**
 * Valide l'état du workflow à chaque étape
 */
export function validateWorkflowState(
  state: AuditWorkflowState,
  step: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Étape 1-3: Infos de base
  if (step >= 1 && !state.norm) errors.push("Norme d'audit requise");
  if (step >= 2 && !state.organization) errors.push("Organisation requise");
  if (step >= 3 && !state.building) errors.push("Site requis");

  // Étape 4: Factures
  if (step >= 4 && state.extractedData.length === 0) {
    errors.push("Au moins un document doit être uploadé");
  }

  // Étape 5: Mesures
  if (step >= 5 && state.measureFiles.length === 0) {
    errors.push("Au moins un fichier de mesure doit être uploadé");
  }

  // Étape 6: Schéma
  if (step >= 6 && !state.schemaHierarchy) {
    errors.push("Schéma électrique non généré");
  }

  // Étape 7: Export
  if (step >= 7 && (!state.isDataTransformed && state.extractedData.length === 0)) {
    errors.push("Aucune donnée à exporter");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Réinitialise l'état du workflow
 */
export function resetWorkflowState(): AuditWorkflowState {
  return {
    norm: "",
    organization: "",
    building: "",
    extractedData: [],
    measureFiles: [],
  };
}

/**
 * Résume l'audit actuel
 */
export function generateAuditSummary(state: AuditWorkflowState): {
  totalInvoices: number;
  totalMeasures: number;
  extractedFields: number;
  dataTransformed: boolean;
  schemaReady: boolean;
  readyForExport: boolean;
} {
  const totalFields = new Set<string>();

  state.extractedData.forEach((data) => {
    const sections = data.sections || {};
    Object.values(sections).forEach((section) => {
      Object.keys(section).forEach((key) => totalFields.add(key));
    });

    const customFields = data.customFields || {};
    Object.keys(customFields).forEach((key) => totalFields.add(key));
  });

  return {
    totalInvoices: state.extractedData.length,
    totalMeasures: state.measureFiles.length,
    extractedFields: totalFields.size,
    dataTransformed: state.isDataTransformed ?? false,
    schemaReady: !!state.schemaHierarchy,
    readyForExport:
      state.extractedData.length > 0 ||
      (state.tablePreviewData && state.tablePreviewData.length > 0),
  };
}
