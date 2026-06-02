import { supabase } from '@/lib/supabase';
import { getAudit, getAuditSites, getAuditBuildings } from '@/lib/audit-service';
import { getInventorySnapshot } from '@/lib/inventory-service';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SynthesisResult {
  observations_generales: string;
  inventaire: string;
  mesures: string;
  facturation: string;
  recommandations: string;
  conclusions: string;
}

// ─── Collecte du contexte audit ────────────────────────────────────────────

async function buildAuditContext(auditId: string): Promise<string> {
  // Parallel fetch — tout ce dont l'IA a besoin
  const [audit, sites, snapshot, { data: invoices }, { data: measurements }] = await Promise.all([
    getAudit(auditId),
    getAuditSites(auditId),
    getInventorySnapshot(auditId),
    supabase
      .from('audit_invoices')
      .select('supplier_name, invoice_date, total_amount, total_kwh, period_start, period_end')
      .eq('audit_id', auditId)
      .order('invoice_date', { ascending: false })
      .limit(20),
    supabase
      .from('audit_measurements')
      .select('sensor_name, sensor_type, measurement_value, unit, recorded_at')
      .eq('audit_id', auditId)
      .order('recorded_at', { ascending: false })
      .limit(50),
  ]);

  // Calculs inventaire
  const activeEq = snapshot.filter((e) => e.status === 'EN service');
  const totalPowerKW = activeEq.reduce((s, e) => s + (e.totalPowerW ?? 0) / 1000, 0);
  const totalKWhYear = activeEq.reduce((s, e) => s + (e.kwhPerYear ?? 0), 0);

  // Répartition par catégorie
  const byCategory = snapshot.reduce<Record<string, { count: number; powerKW: number; kwhYear: number }>>(
    (acc, e) => {
      const cat = e.categoryName ?? 'Non catégorisé';
      if (!acc[cat]) acc[cat] = { count: 0, powerKW: 0, kwhYear: 0 };
      acc[cat].count += e.quantity;
      acc[cat].powerKW += (e.totalPowerW ?? 0) / 1000;
      acc[cat].kwhYear += e.kwhPerYear ?? 0;
      return acc;
    },
    {}
  );

  // Données bâtiments
  const buildingData: Array<{ site: string; buildings: any[] }> = [];
  for (const site of sites ?? []) {
    const buildings = await getAuditBuildings(site.id);
    buildingData.push({ site: site.name, buildings: buildings ?? [] });
  }

  const ctx = {
    projet: {
      nom: audit?.name,
      statut: audit?.status,
      responsable: audit?.responsable,
      date_debut: audit?.start_date,
      date_fin: audit?.end_date,
      completion: `${audit?.completion_percentage ?? 0}%`,
      client_type: audit?.general_info?.client_type,
      informations_generales: audit?.general_info,
      personnel: audit?.personnel,
    },
    sites: (sites ?? []).map((s) => ({
      nom: s.name,
      adresse: s.address,
      statut: s.status,
    })),
    batiments: buildingData,
    inventaire: {
      total_equipements: snapshot.length,
      equipements_en_service: activeEq.length,
      equipements_hors_service: snapshot.length - activeEq.length,
      puissance_totale_kW: Math.round(totalPowerKW * 10) / 10,
      consommation_estimee_kWh_an: Math.round(totalKWhYear),
      repartition_par_categorie: byCategory,
      sites_couverts: [...new Set(snapshot.map((e) => e.siteName))],
      batiments_couverts: [...new Set(snapshot.map((e) => e.buildingName))],
    },
    factures: (invoices ?? []).map((inv) => ({
      fournisseur: inv.supplier_name,
      date: inv.invoice_date,
      montant: inv.total_amount,
      kwh: inv.total_kwh,
      periode: `${inv.period_start ?? '?'} → ${inv.period_end ?? '?'}`,
    })),
    mesures: (measurements ?? []).map((m) => ({
      capteur: m.sensor_name,
      type: m.sensor_type,
      valeur: m.measurement_value,
      unite: m.unit,
      date: m.recorded_at,
    })),
  };

  return JSON.stringify(ctx, null, 2);
}

// ─── Appel DeepSeek via backend proxy ──────────────────────────────────────
// La clé API DeepSeek est stockée côté serveur (DEEPSEEK_API_KEY dans .env backend).
// Le frontend envoie uniquement le contexte JSON au backend, sans exposer la clé.

export async function analyzeAuditWithAI(
  auditId: string,
  onProgress?: (section: string) => void
): Promise<SynthesisResult> {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) {
    throw new Error('VITE_API_URL manquant dans .env');
  }

  onProgress?.('Collecte des données…');
  const context = await buildAuditContext(auditId);

  onProgress?.('Analyse en cours par DeepSeek…');

  const response = await fetch(`${apiUrl}/ai/synthesize-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erreur serveur ${response.status}: ${err}`);
  }

  return response.json() as Promise<SynthesisResult>;
}
