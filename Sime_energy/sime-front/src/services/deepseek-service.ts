import { supabase } from '@/lib/db';
import { backendHeaders } from './backend-client';
import { getAudit, getAuditSites, getAuditBuildings } from '@/lib/audit-service';
import { getInventorySnapshot } from '@/lib/inventory-service';
import { mapOcrToInvoiceData } from '@/lib/invoice-mapper';
import { getFacturesSenelecForSelector, type FactureSenelecForSelector } from '@/lib/factures-senelec-service';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SynthesisResult {
  observations_generales: string;
  inventaire: string;
  mesures: string;
  facturation: string;
  recommandations: string;
  conclusions: string;
}

// ─── Collecte du contexte audit ────────────────────────────────────────────

// kWh et période de consommation lus dans l'OCR de la facture (même mapper que le reste de l'application).
// Un OCR mal formé ne doit pas faire échouer toute la synthèse : on renvoie alors des valeurs vides.
function extraireDonneesOcr(ocrData: unknown, montant: number | null) {
  try {
    return mapOcrToInvoiceData(ocrData, montant ?? undefined);
  } catch {
    return {};
  }
}

// Factures SENELEC importées (Excel) : totaux sur toutes les factures retenues
// (hors quarantaine) + détail des plus récentes, pour rester sous la taille de contexte.
const FACTURES_SENELEC_DETAILLEES = 60;

function resumerFacturesSenelec(lignes: FactureSenelecForSelector[]) {
  const retenues = lignes.filter((f) => !f.is_quarantined);
  const kwh = retenues.reduce((s, f) => s + (f.consommation_facturee ?? 0), 0);
  const ttc = retenues.reduce((s, f) => s + (f.montant_facture_ttc ?? 0), 0);
  const recentes = [...retenues]
    .sort((a, b) => (b.date_debut_periode ?? '').localeCompare(a.date_debut_periode ?? ''))
    .slice(0, FACTURES_SENELEC_DETAILLEES);
  return {
    nombre: lignes.length,
    en_quarantaine: lignes.length - retenues.length,
    consommation_totale_kWh: Math.round(kwh),
    montant_total_ttc_fcfa: Math.round(ttc),
    prix_moyen_fcfa_kwh: kwh > 0 ? Math.round((ttc / kwh) * 10) / 10 : null,
    contrats: [...new Set(retenues.map((f) => f.numero_compte_contrat))],
    detail_plus_recentes: recentes.map((f) => ({
      periode: `${f.date_debut_periode ?? '?'} → ${f.date_fin_periode ?? '?'}`,
      contrat: f.numero_compte_contrat,
      categorie: f.categorie_tarifaire ?? f.type_tarif_numero,
      kwh: f.consommation_facturee,
      montant_ttc: f.montant_facture_ttc,
      puissance_souscrite_kW: f.puissance_souscrite_kw,
      puissance_max_kW: f.puissance_max_kw,
      cos_phi: f.valeur_cosinus_phi,
      penalites_depassement: f.penalites_depassement,
    })),
  };
}

async function buildAuditContext(auditId: string): Promise<string> {
  // Parallel fetch — tout ce dont l'IA a besoin
  const [audit, sites, snapshot, { data: invoices }, { data: measurements }, facturesSenelec] = await Promise.all([
    getAudit(auditId),
    getAuditSites(auditId),
    getInventorySnapshot(auditId),
    supabase
      .from('audit_invoices')
      .select('supplier, invoice_date, amount, ocr_data')
      .eq('audit_id', auditId)
      .order('invoice_date', { ascending: false })
      .limit(20),
    supabase
      .from('audit_measurements')
      .select('sensor_name, sensor_type, measurement_value, unit, recorded_at')
      .eq('audit_id', auditId)
      .order('recorded_at', { ascending: false })
      .limit(50),
    getFacturesSenelecForSelector(auditId),
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
  const buildingData: Array<{ site: string; buildings: unknown[] }> = [];
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
    factures: (invoices ?? []).map((inv) => {
      const extrait = extraireDonneesOcr(inv.ocr_data, inv.amount);
      return {
        fournisseur: inv.supplier,
        date: inv.invoice_date,
        montant: inv.amount,
        kwh: extrait.conso_kwh_total ?? null,
        periode: `${extrait.periode_debut_iso ?? '?'} → ${extrait.periode_fin_iso ?? '?'}`,
      };
    }),
    factures_senelec_importees: resumerFacturesSenelec(facturesSenelec),
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
    headers: await backendHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erreur serveur ${response.status}: ${err}`);
  }

  return response.json() as Promise<SynthesisResult>;
}
