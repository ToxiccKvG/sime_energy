/**
 * Service pour gérer les exports de données (CSV, Excel)
 */

import * as XLSX from "xlsx";
import { StructuredExtractedData } from "./invoiceService";
import { getPdfSections, getPdfCustomFields } from "./invoiceService";

export interface TableRowData {
  id: string;
  fileName: string;
  pageNumber?: number;
  [key: string]: any;
}

/**
 * Génère un contenu CSV à partir des données extraites
 */
export function generateCSV(extractedData: StructuredExtractedData[]): string {
  if (extractedData.length === 0) return "";

  const allFields = new Set<string>();
  extractedData.forEach((data) => {
    const sections = getPdfSections(data);
    if (sections && typeof sections === "object") {
      Object.keys(sections).forEach((sectionName) => {
        if (sections[sectionName] && typeof sections[sectionName] === "object") {
          Object.keys(sections[sectionName]).forEach((field) => allFields.add(field));
        }
      });
    }

    const customFields = getPdfCustomFields(data);
    if (customFields && typeof customFields === "object") {
      Object.keys(customFields).forEach((field) => allFields.add(field));
    }
  });

  const headers = ["Nom du fichier", "Page", ...Array.from(allFields)];

  const getFieldValue = (data: StructuredExtractedData, fieldKey: string): string => {
    const sections = getPdfSections(data);
    if (sections && typeof sections === "object") {
      for (const sectionName of Object.keys(sections)) {
        if (sections[sectionName] && sections[sectionName][fieldKey]) {
          return sections[sectionName][fieldKey].value || "";
        }
      }
    }

    const customFields = getPdfCustomFields(data);
    if (customFields && customFields[fieldKey]) {
      return customFields[fieldKey].value || "";
    }

    return "";
  };

  const rows = extractedData.map((data) => {
    const row = [data.fileName, data.pageNumber ? data.pageNumber.toString() : "1"];

    Array.from(allFields).forEach((field) => {
      const value = getFieldValue(data, field);
      const escapedValue =
        typeof value === "string" &&
        (value.includes(",") || value.includes('"') || value.includes("\n"))
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      row.push(escapedValue);
    });

    return row;
  });

  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");

  return csvContent;
}

/**
 * Télécharge un fichier CSV
 */
export function downloadCSV(
  csvContent: string,
  fileName: string = `export_${new Date().toISOString().slice(0, 10)}.csv`
): void {
  if (!csvContent) {
    throw new Error("Aucune donnée à exporter");
  }

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);

  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Génère un CSV structuré avec métadonnées
 */
export function generateStructuredCSV(
  extractedData: StructuredExtractedData[],
  metadata: {
    norm?: string;
    organization?: string;
    building?: string;
  }
): string {
  let csvContent = "";

  csvContent += `# RAPPORT D'AUDIT\n`;
  csvContent += `# Norme,${metadata.norm || "N/A"}\n`;
  csvContent += `# Organisation,${metadata.organization || "N/A"}\n`;
  csvContent += `# Site,${metadata.building || "N/A"}\n`;
  csvContent += `# Date d'export,${new Date().toLocaleDateString("fr-FR")}\n`;
  csvContent += `# Nombre de factures,${extractedData.length}\n`;
  csvContent += `\n`;

  csvContent += generateCSV(extractedData);

  return csvContent;
}

/**
 * Exporte les données en Excel
 */
export function exportToExcel(
  dataToExport: TableRowData[] | StructuredExtractedData[],
  metadata: {
    norm?: string;
    organization?: string;
    building?: string;
    files?: File[];
    totalTables?: number;
    isDataTransformed?: boolean;
  } = {}
): void {
  if (dataToExport.length === 0) {
    throw new Error("Aucune donnée à exporter");
  }

  let excelData: any[] = [];
  let allFields: Set<string> = new Set();

  // Déterminer si c'est des données transformées (tableRowData) ou brutes
  const isTransformed = (dataToExport[0] as any).fileName !== undefined;

  if (isTransformed) {
    // Données transformées
    excelData = (dataToExport as TableRowData[]).map((row) => {
      const excelRow: any = {
        Fichier: row.fileName,
        Page: row.pageNumber || 1,
      };

      Object.keys(row).forEach((key) => {
        if (key !== "id" && key !== "fileName" && key !== "pageNumber") {
          excelRow[key] = row[key];
          allFields.add(key);
        }
      });

      return excelRow;
    });
  } else {
    // Données brutes
    const extractedData = dataToExport as StructuredExtractedData[];
    extractedData.forEach((data) => {
      const sections = getPdfSections(data);
      if (sections && typeof sections === "object") {
        Object.keys(sections).forEach((sectionName) => {
          if (sections[sectionName] && typeof sections[sectionName] === "object") {
            Object.keys(sections[sectionName]).forEach((field) => allFields.add(field));
          }
        });
      }

      const customFields = getPdfCustomFields(data);
      if (customFields && typeof customFields === "object") {
        Object.keys(customFields).forEach((field) => allFields.add(field));
      }
    });

    const getFieldValue = (data: StructuredExtractedData, fieldKey: string): string => {
      const sections = getPdfSections(data);
      if (sections && typeof sections === "object") {
        for (const sectionName of Object.keys(sections)) {
          if (sections[sectionName] && sections[sectionName][fieldKey]) {
            return sections[sectionName][fieldKey].value || "";
          }
        }
      }

      const customFields = getPdfCustomFields(data);
      if (customFields && customFields[fieldKey]) {
        return customFields[fieldKey].value || "";
      }

      return "";
    };

    excelData = extractedData.map((data) => {
      const row: any = {
        Fichier: data.fileName,
        Page: data.pageNumber || 1,
      };

      Array.from(allFields).forEach((field) => {
        row[field] = getFieldValue(data, field);
      });

      return row;
    });
  }

  // Créer le workbook
  const wb = XLSX.utils.book_new();

  // Feuille principale avec les données
  const ws = XLSX.utils.json_to_sheet(excelData);
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  ws["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  XLSX.utils.book_append_sheet(wb, ws, "Données Extraites");

  // Feuille de métadonnées
  const metaData = [
    ["Extraction facturation"],
    [""],
    ["Norme", metadata.norm || "N/A"],
    ["Organisation", metadata.organization || "N/A"],
    ["Site", metadata.building || "N/A"],
    ["Date d'export", new Date().toLocaleDateString("fr-FR")],
    ["Nombre de fichiers", metadata.files?.length || 0],
    ["Nombre de factures", dataToExport.length],
    ["Champs extraits", allFields.size],
    ["Données transformées", metadata.isDataTransformed ? "Oui" : "Non"],
  ];

  const metaWs = XLSX.utils.aoa_to_sheet(metaData);
  XLSX.utils.book_append_sheet(wb, metaWs, "Informations");

  // Télécharger
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  const fileName = `rapport_audit_${metadata.organization || "organisation"}_${timestamp}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

/**
 * Génère un nom de fichier avec timestamp
 */
export function generateFileName(prefix: string = "export", extension: string = "csv"): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  return `${prefix}_${timestamp}.${extension}`;
}
