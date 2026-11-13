/**
 * Service pour gérer les opérations liées aux mesures et données d'énergie
 * Endpoints: /process-file/measures, /process-file/analyze-energy-label, /process-file/process-hierarchy
 */

import { computeMeasurementKpis, MeasurementKpis, QuantityKind } from './measurementStats';
import { backendHeaders } from './backend-client';

export interface MeasurementData {
  /** Identifiant du relevé en base (measurement_files) ; absent tant qu'il n'est pas persisté. */
  id?: string;
  measurements?: any[];
  /** Renvoyé par le backend : original_rows, valid_measurements, sensor_label… */
  processing_info?: { original_rows?: number; valid_measurements?: number; sensor_label?: string; [k: string]: unknown };
  /** Calculé côté client (voir measurementStats.ts) à partir des mesures brutes reçues du backend. */
  kpis?: MeasurementKpis;
  /** Clé du capteur (cf. SENSOR_REGISTRY backend). */
  sensor_type?: string;
  /** Libellé de la grandeur tracée (ex. "Puissance active", "CO₂"). */
  metric_label?: string;
  /** Unité de la grandeur principale (W, kWh, ppm, …). */
  unit?: string;
  /** Nature de la grandeur principale — détermine le calcul du cumul (voir measurementStats.ts). */
  quantity_kind?: QuantityKind;
  /** Nom du fichier importé (renseigné côté client à l'upload). */
  file_name?: string;
  /** Alias libre donné par l'utilisateur (ex. « Départ TGBT — CA 8335 »), prioritaire sur le nom de fichier. */
  alias?: string;
}

/** Libellé d'un relevé : alias, sinon nom de fichier, sinon type de capteur. */
export function measurementLabel(d: MeasurementData, index: number): string {
  return d.alias?.trim() || d.file_name || d.sensor_type || `Fichier ${index + 1}`;
}

export interface HierarchyNode {
  id: string;
  name: string;
  file?: string | null;
  sensorType?: string | null;
  averageConsumption?: number | null;
  energyLabel?: Record<string, unknown> | null;
  level: number;
  children?: HierarchyNode[];
}

export interface HierarchyData {
  timestamp: string;
  totalNodes: number;
  totalLevels: number;
  hierarchy: HierarchyNode[];
}

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Upload et traite un fichier de mesure (CSV, XLSX, XLS).
 *
 * Renvoie un relevé par série : un seul en général, plusieurs pour un capteur
 * personnalisé à `series_col` (fichier « long », ex. export de shelly_cl avec
 * une ligne par appareil et par horodatage). Chaque série devient un relevé à
 * part, nommé d'après l'appareil — jamais une courbe qui mélange les appareils.
 */
export async function uploadMeasurementFile(
  file: File,
  sensorType: string = "",
  sensorConfig?: object,
): Promise<MeasurementData[]> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sensor_type", sensorType || "CUSTOM");
  if (sensorConfig) {
    formData.append("sensor_config", JSON.stringify(sensorConfig));
  }

  const response = await fetch(`${API_URL}/processing/process-file/measures`, {
    method: "POST",
    headers: await backendHeaders(),
    body: formData,
  });

  if (!response.ok) {
    // Le backend renvoie la vraie raison dans le champ JSON `detail`
    // (ex. « Le fichier ne correspond pas au capteur sélectionné »).
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* réponse non-JSON : on garde statusText */
    }
    throw new Error(detail);
  }

  const body: MeasurementData & { series?: (MeasurementData & { series_label?: string })[] } = await response.json();
  // Une série par appareil : nommée d'après lui (alias renommable), le fichier
  // d'origine reste visible à côté dans la liste des relevés.
  const parts: MeasurementData[] = body.series
    ? body.series.map(({ series_label, ...s }) => ({ ...s, alias: series_label }))
    : [body];
  for (const data of parts) {
    data.file_name = file.name;
    try {
      data.kpis = computeMeasurementKpis(data.measurements ?? [], {
        unit: data.unit ?? '',
        metricLabel: data.metric_label ?? 'Valeur',
        quantityKind: data.quantity_kind ?? 'energy',
      });
    } catch (e) {
      console.warn('Impossible de calculer les statistiques du fichier :', e);
    }
  }
  return parts;
}

/**
 * Traite une hiérarchie de schéma électrique
 */
export async function processHierarchy(
  hierarchyData: HierarchyData
): Promise<{ hierarchy: HierarchyData; [key: string]: unknown }> {
  const response = await fetch(`${API_URL}/processing/process-file/process-hierarchy`, {
    method: "POST",
    headers: await backendHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      hierarchy: hierarchyData,
    }),
  });

  if (!response.ok) {
    throw new Error("Erreur lors du traitement de la hiérarchie");
  }

  return response.json();
}

/**
 * Crée une hiérarchie à partir de nœuds et arêtes
 */
// Données d'un nœud du schéma électrique (éditeur de schéma de mesure).
interface NoeudSchemaData {
  label: string;
  associatedFile?: string | null;
  sensorType?: string | null;
  averageConsumption?: number | null;
  energyLabel?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export function generateHierarchyJSON(
  nodes: Array<{ id: string; data: NoeudSchemaData }>,
  edges: Array<{ source: string; target: string }>
): HierarchyData {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Trouver les nœuds racines
  const rootNodeIds = new Set(nodes.map((n) => n.id));
  edges.forEach((e) => rootNodeIds.delete(e.target));

  let maxLevel = 0;

  const buildHierarchy = (nodeId: string, level: number = 0): HierarchyNode | null => {
    const node = nodeMap.get(nodeId);
    if (!node) return null;

    maxLevel = Math.max(maxLevel, level);

    const children = edges
      .filter((e) => e.source === nodeId)
      .map((e) => buildHierarchy(e.target, level + 1))
      .filter((child): child is HierarchyNode => child !== null);

    return {
      id: node.id,
      name: node.data.label,
      file: node.data.associatedFile || null,
      sensorType: node.data.sensorType || null,
      averageConsumption: node.data.averageConsumption ?? null,
      energyLabel: node.data.energyLabel ?? null,
      level: level,
      children: children.length > 0 ? children : undefined,
    };
  };

  const hierarchy = Array.from(rootNodeIds)
    .map((id) => buildHierarchy(id))
    .filter((node): node is HierarchyNode => node !== null);

  return {
    timestamp: new Date().toISOString(),
    totalNodes: nodes.length,
    totalLevels: maxLevel + 1,
    hierarchy: hierarchy,
  };
}
