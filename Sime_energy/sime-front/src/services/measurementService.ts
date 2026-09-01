/**
 * Service pour gérer les opérations liées aux mesures et données d'énergie
 * Endpoints: /process-file/measures, /process-file/analyze-energy-label, /process-file/process-hierarchy
 */

import { computeMeasurementKpis, MeasurementKpis, QuantityKind } from './measurementStats';

export interface MeasurementData {
  measurements?: any[];
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
}

export interface HierarchyNode {
  id: string;
  name: string;
  file?: string | null;
  sensorType?: string | null;
  averageConsumption?: number | null;
  energyLabel?: Record<string, any> | null;
  level: number;
  children?: HierarchyNode[];
}

export interface HierarchyData {
  timestamp: string;
  totalNodes: number;
  totalLevels: number;
  hierarchy: HierarchyNode[];
}

export interface EnergyLabelAnalysis {
  [key: string]: string | number;
}

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Upload et traite un fichier de mesure (CSV, XLSX, XLS)
 */
export async function uploadMeasurementFile(
  file: File,
  sensorType: string = "",
  sensorConfig?: object,
): Promise<MeasurementData> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sensor_type", sensorType || "CUSTOM");
  if (sensorConfig) {
    formData.append("sensor_config", JSON.stringify(sensorConfig));
  }

  const response = await fetch(`${API_URL}/processing/process-file/measures`, {
    method: "POST",
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

  const data: MeasurementData = await response.json();
  try {
    data.kpis = computeMeasurementKpis(data.measurements ?? [], {
      unit: data.unit ?? '',
      metricLabel: data.metric_label ?? 'Valeur',
      quantityKind: data.quantity_kind ?? 'energy',
    });
  } catch (e) {
    console.warn('Impossible de calculer les statistiques du fichier :', e);
  }
  return data;
}

/**
 * Analyse une image d'étiquette énergétique
 */
export async function analyzeEnergyLabel(file: File): Promise<EnergyLabelAnalysis> {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`${API_URL}/processing/process-file/analyze-energy-label`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Erreur lors de l'analyse de l'étiquette: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Traite une hiérarchie de schéma électrique
 */
export async function processHierarchy(
  hierarchyData: HierarchyData
): Promise<{ hierarchy: HierarchyData; [key: string]: any }> {
  const response = await fetch(`${API_URL}/processing/process-file/process-hierarchy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
export function generateHierarchyJSON(
  nodes: Array<{ id: string; data: { label: string; [key: string]: any } }>,
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
