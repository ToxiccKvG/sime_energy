/**
 * project-context-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Assemble le contexte complet d'un projet (infos générales, personnel,
 * calendrier, réglages météo/BTU, sites/bâti, facturation) en un JSON unique
 * et le persiste dans audits.project_context.
 *
 * Ce JSON est destiné aux autres modules / plateformes : ils le lisent par
 * `select project_context from audits` sans reconstituer les tables.
 * Doc : sime-front/docs/project-context-json.md
 */

import {
  getProjectContextRawData, saveProjectContext, listOrganizationAuditIds,
  type ProjectContextRawData,
} from '@/lib/project-context-service';
import { getSenegalHolidays } from '@/constants/senegal-holidays';
import { getTariffGrid } from '@/constants/senelec-tariffs';
import {
  QUESTIONNAIRE_SCHEMA, WOYOFAL_CODE_GROUPS, WOYOFAL_NUMBER_CODES, OBIS_BY_KEY,
} from '@/constants/pv-questionnaire-schema';
import { mapOcrToInvoiceData } from '@/lib/invoice-mapper';
import { DEFAULT_METEO_SETTINGS, type MeteoSettings } from '@/services/meteo-service';
import {
  PROJECT_CONTEXT_SCHEMA_VERSION,
  type AgregatFactures, type BatimentContext, type BilanCalendrierAnnuel, type HoraireJour, type JourSemaine,
  type Personne, type ProjectContextV1, type QuestionnaireInspection, type ReleveIndex, type ReleveWoyofal,
  type SectionInspection, type SessionReleveCompteur, type SiteContext, type ValeurReleve,
} from '@/types/project-context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JOURS: JourSemaine[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
// Date.getDay() : 0 = dimanche
const JOUR_BY_DAY_INDEX: JourSemaine[] = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Doit rester aligné sur DEFAULT_HORAIRES de AuditForm
const DEFAULT_HORAIRES: Record<JourSemaine, { enabled: boolean; start: string; end: string }> = {
  lundi:    { enabled: true,  start: '08:00', end: '17:00' },
  mardi:    { enabled: true,  start: '08:00', end: '17:00' },
  mercredi: { enabled: true,  start: '08:00', end: '17:00' },
  jeudi:    { enabled: true,  start: '08:00', end: '17:00' },
  vendredi: { enabled: true,  start: '08:00', end: '17:00' },
  samedi:   { enabled: false, start: '08:00', end: '12:00' },
  dimanche: { enabled: false, start: '08:00', end: '12:00' },
};

const MAX_CALENDAR_YEARS = 5;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  // Conversion stricte : « 9+863 » ou « 12abc » ne sont pas des nombres
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(x => !Number.isFinite(x))) return 0;
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60; // poste de nuit qui passe minuit
  return round(minutes / 60);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Une ligne de tableau dynamique est vide si toutes ses valeurs (hors clés techniques) sont vides */
function isEmptyRow(row: Record<string, any>, ignore: string[] = []): boolean {
  return Object.entries(row).every(([k, v]) => ignore.includes(k) || toStr(v) === null);
}

function cleanRows<T extends Record<string, any>>(rows: unknown, ignore: string[] = []): T[] {
  return Array.isArray(rows) ? (rows as T[]).filter(r => r && typeof r === 'object' && !isEmptyRow(r, ignore)) : [];
}

function toPersonne(p: Record<string, any>): Personne {
  return {
    nom: toStr(p.nom),
    position: toStr(p.position),
    telephone: toStr(p.telephone ?? p.tel),
    email: toStr(p.email),
  };
}

// ─── Calendrier ───────────────────────────────────────────────────────────────

function buildHoraires(rawHoraires: unknown) {
  let source: ProjectContextV1['calendrier']['source_horaires'] = 'defaut';
  let texteLibre: string | null = null;
  let schedule = DEFAULT_HORAIRES;

  if (rawHoraires && typeof rawHoraires === 'object' && !Array.isArray(rawHoraires) && 'lundi' in rawHoraires) {
    source = 'projet';
    schedule = { ...DEFAULT_HORAIRES, ...(rawHoraires as typeof DEFAULT_HORAIRES) };
  } else if (toStr(rawHoraires)) {
    // Ancien format : texte libre — on garde le texte et on calcule sur l'horaire par défaut
    source = 'texte_libre';
    texteLibre = toStr(rawHoraires);
  }

  const hebdo = {} as Record<JourSemaine, HoraireJour>;
  for (const jour of JOURS) {
    const d = schedule[jour];
    const travaille = !!d?.enabled;
    hebdo[jour] = {
      travaille,
      debut: travaille ? d.start : null,
      fin: travaille ? d.end : null,
      heures: travaille ? hoursBetween(d.start, d.end) : 0,
    };
  }
  return { source, texteLibre, hebdo };
}

function projectYears(startDate: string | null, endDate: string | null): number[] {
  const current = new Date().getFullYear();
  const start = startDate ? new Date(startDate).getFullYear() : current;
  const end = endDate ? new Date(endDate).getFullYear() : start;
  const from = Number.isFinite(start) ? start : current;
  const to = Number.isFinite(end) && end >= from ? Math.min(end, from + MAX_CALENDAR_YEARS - 1) : from;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function buildBilanAnnuel(
  annee: number,
  hebdo: Record<JourSemaine, HoraireJour>,
  feries: Set<string>,
): BilanCalendrierAnnuel {
  let joursCalendaires = 0;
  let nonTravailles = 0;
  let feriesOuvres = 0;
  let ouvres = 0;
  let heures = 0;

  for (let d = new Date(annee, 0, 1); d.getFullYear() === annee; d.setDate(d.getDate() + 1)) {
    joursCalendaires++;
    const jour = hebdo[JOUR_BY_DAY_INDEX[d.getDay()]];
    if (!jour.travaille) { nonTravailles++; continue; }
    if (feries.has(isoDate(d))) { feriesOuvres++; continue; }
    ouvres++;
    heures += jour.heures;
  }

  return {
    annee,
    jours_calendaires: joursCalendaires,
    jours_non_travailles_hebdo: nonTravailles,
    jours_feries_ouvres: feriesOuvres,
    jours_ouvres_effectifs: ouvres,
    heures_ouvrees_estimees: round(heures, 1),
  };
}

function buildCalendrier(raw: ProjectContextRawData): ProjectContextV1['calendrier'] {
  const po = (raw.audit.personnel?.programmeOperations ?? {}) as Record<string, any>;
  const { source, texteLibre, hebdo } = buildHoraires(po.horaires);
  const years = projectYears(raw.audit.start_date, raw.audit.end_date);
  const joursFeries = years.flatMap(y => getSenegalHolidays(y))
    .map(h => ({ date: h.date, titre: h.title, type: h.type }));
  const feriesSet = new Set(joursFeries.map(h => h.date));

  const firstDay = `${years[0]}-01-01`;
  const lastDay = `${years[years.length - 1]}-12-31`;
  const evenements = raw.calendarEvents
    .filter(e => e.event_date <= lastDay && (e.end_date ?? e.event_date) >= firstDay)
    .map(e => ({
      id: e.id,
      titre: e.title,
      description: e.description,
      date_debut: e.event_date,
      date_fin: e.end_date,
      journee_entiere: e.all_day,
    }));

  const joursTravailles = JOURS.filter(j => hebdo[j].travaille);

  return {
    source_horaires: source,
    horaires_texte_libre: texteLibre,
    horaires_hebdo: hebdo,
    heures_semaine: round(joursTravailles.reduce((s, j) => s + hebdo[j].heures, 0), 1),
    jours_ouvres_semaine: joursTravailles.length,
    quarts: { par_jour: toNum(po.quartsJour), heures_par_quart: toNum(po.heuresQuart) },
    activite_saisonniere: !!po.activiteSaisonniere,
    saisons_activite: toStr(po.saisonsActivites),
    maintenance: {
      active: !!po.maintenance,
      frequence: toStr(po.frequenceMaintenance),
      duree: toStr(po.dureeMaintenance),
    },
    source_jours_feries: 'liste_senegal',
    jours_feries: joursFeries,
    evenements_organisation: evenements,
    bilan_annuel: years.map(y => buildBilanAnnuel(y, hebdo, feriesSet)),
    heures_supplementaires: [],
  };
}

// ─── Réglages ─────────────────────────────────────────────────────────────────

function buildReglages(raw: ProjectContextRawData): ProjectContextV1['reglages'] {
  const orgMeteo = raw.organization?.settings?.meteo as (MeteoSettings & { comfort_threshold?: number }) | undefined;
  const m = { ...DEFAULT_METEO_SETTINGS, ...(orgMeteo ?? {}) } as MeteoSettings & { comfort_threshold?: number };
  return {
    origine: orgMeteo ? 'organisation' : 'defaut',
    maj_le: raw.organization?.settings?.updated_at ?? null,
    meteo: {
      localisation: m.location,
      temperatures_mensuelles_c: m.monthly_temps,
      t_ref_chauffage_c: m.t_ref_chauffage,
      t_ref_climatisation_c: m.t_ref_climatisation,
      seuil_confort_c: toNum(m.comfort_threshold),
      donnees_recuperees_le: m.fetched_at ?? null,
    },
    btu: { coef_c: m.coef_c, coef_g: m.coef_g },
  };
}

// ─── Informations générales & personnel ──────────────────────────────────────

function buildInformationsGenerales(gi: Record<string, any>): ProjectContextV1['informations_generales'] {
  const consommations = cleanRows<Record<string, any>>(gi.consommationsEnergie)
    .filter(c => toStr(c.type))
    .map(c => ({
      type: String(c.type).trim(),
      unite: toStr(c.unite),
      annees: [1, 2, 3].map(a => ({
        annee: a,
        quantite: toNum(c[`a${a}Qte`]),
        cout_fcfa: toNum(c[`a${a}Cout`]),
      })),
    }));

  const problemes = cleanRows<Record<string, any>>(gi.problemesEff)
    .filter(p => toStr(p.designation))
    .map(p => ({ designation: String(p.designation).trim(), frequence: toStr(p.frequence), duree: toStr(p.duree) }));

  const spec = (gi.specifique ?? {}) as Record<string, any>;
  const specifique: Record<string, any> = {
    ...spec,
    productions: cleanRows(spec.productions),
    procedesEqs: cleanRows(spec.procedesEqs),
    dechets: cleanRows(spec.dechets),
  };

  return {
    identification: {
      ref_za: toStr(gi.refZa),
      nom_etablissement: toStr(gi.nomEtablissement),
      siege: gi.siege === '__autre__' ? toStr(gi.siegeLibre) : toStr(gi.siege),
      province: gi.province === '__autre__' ? toStr(gi.provinceLibre) : toStr(gi.province),
      adresse: toStr(gi.adresse),
      telephone: toStr(gi.telephone),
      email: toStr(gi.email),
      forme_juridique: toStr(gi.formeJuridique),
      ninea: toStr(gi.ninea),
      secteur: toStr(gi.secteur),
      macs: toStr(gi.macs),
      date_creation: toStr(gi.dateCreation),
      annee_creation: toNum(gi.anneeCreation),
      mise_en_service: toStr(gi.miseService),
      exportatrice: !!gi.exportatrice,
      marches: toStr(gi.marches),
    },
    finances: {
      capital_fcfa: toNum(gi.capital),
      chiffre_affaires_fcfa: toNum(gi.ca),
      montant_m1_fcfa: toNum(gi.montantM1),
      montant_m2_fcfa: toNum(gi.montantM2),
      montant_m3_fcfa: toNum(gi.montantM3),
      programmes_epargne: toStr(gi.programmesEpargne),
    },
    energie: {
      contrats_fournisseurs: toStr(gi.contratsEnergie),
      consommations,
      problemes_efficacite: problemes,
      diagnostic_precedent: gi.diagnosticPrecedent ?? null,
      programme_extension: gi.programmeExtension ?? null,
    },
    specifique,
    synthese_ia: gi.synthesis ?? null,
  };
}

function buildPersonnel(gi: Record<string, any>, p: Record<string, any>): ProjectContextV1['personnel'] {
  const employes = cleanRows<Record<string, any>>(p.employes, ['categorie', 'type']).map(e => {
    const hommes = toNum(e.hommes ?? e.hommesNombre) ?? 0;
    const femmes = toNum(e.femmes ?? e.femmesNombre) ?? 0;
    return {
      categorie: toStr(e.categorie ?? e.type) ?? 'Non précisé',
      hommes,
      femmes,
      cadres: toNum(e.cadres) ?? (toNum(e.cadresHommes) ?? 0) + (toNum(e.cadresFemmes) ?? 0),
      total: hommes + femmes,
    };
  });

  return {
    directeur_general: toStr(p.dg),
    responsable_technique: toStr(p.dt),
    responsable_energie: toStr(gi.respEnergie),
    responsable_achat: toStr(gi.respAchat),
    responsables_energie: cleanRows<Record<string, any>>(p.responsableEnergie).map(toPersonne),
    points_focaux: cleanRows<Record<string, any>>(p.pointFocal).map(toPersonne),
    employes,
    effectif_total_declare: toNum(gi.effectifs),
    effectif_total_calcule: employes.reduce((s, e) => s + e.total, 0),
    systeme_management_energie: p.sme ?? null,
  };
}

// ─── Sites & bâti ─────────────────────────────────────────────────────────────

function groupBy<T extends Record<string, any>>(rows: T[], key: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = r[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return map;
}

function stripKeys(row: Record<string, any>, keys: string[]) {
  const out = { ...row };
  for (const k of keys) delete out[k];
  return out;
}

function resolveTariff(params: Record<string, any>): Record<string, any> | null {
  const year = toNum(params.grille_annee);
  if (year === null) return null;
  const grid = getTariffGrid(year) as Record<string, any> | undefined;
  const values = grid?.[params.domaine_tension]?.[params.categorie_tarifaire];
  return values ? { annee: year, domaine_tension: params.domaine_tension, categorie: params.categorie_tarifaire, valeurs: values } : null;
}

function buildSites(raw: ProjectContextRawData): SiteContext[] {
  const zonesBySite = groupBy(raw.zones, 'site_id');
  const buildingsBySite = groupBy(raw.buildings, 'site_id');
  const levelsByBuilding = groupBy(raw.levels, 'building_id');
  const roomsByLevel = groupBy(raw.rooms, 'level_id');
  const paramsByBuilding = groupBy(raw.buildingParams, 'building_id');
  const billingBySite = new Map(raw.billingParams.map(b => [b.site_id as string, b]));

  const toBatiment = (b: Record<string, any>): BatimentContext => ({
    id: b.id,
    nom: b.building_name,
    type: toStr(b.building_type),
    zone_id: b.zone_id ?? null,
    surfaces_m2: {
      terrain: toNum(b.surface_terrain),
      batie: toNum(b.surface_batie),
      toiture: toNum(b.surface_toiture),
    },
    parametres_usage: (paramsByBuilding.get(b.id) ?? []).map(p =>
      stripKeys(p, ['building_id', 'audit_id', 'created_at'])),
    niveaux: (levelsByBuilding.get(b.id) ?? []).map(l => ({
      id: l.id,
      nom: l.name,
      ordre: toNum(l.order_index),
      pieces: (roomsByLevel.get(l.id) ?? []).map(r => ({
        id: r.id,
        code: r.code,
        service: toStr(r.service),
        type_fonctionnel: toStr(r.type_fonctionnel),
        surface_m2: toNum(r.surface_m2),
      })),
    })),
  });

  return raw.sites.map(site => {
    const batiments = (buildingsBySite.get(site.id) ?? []).map(toBatiment);
    const zones = (zonesBySite.get(site.id) ?? []).map(z => ({
      id: z.id,
      nom: z.name,
      description: toStr(z.description),
      ordre: toNum(z.order_index),
      batiments: batiments.filter(b => b.zone_id === z.id),
    }));
    const zoneIds = new Set(zones.map(z => z.id));
    const billing = billingBySite.get(site.id);

    return {
      id: site.id,
      nom: site.name,
      adresse: toStr(site.address),
      coordonnees: { lat: toNum(site.latitude), lng: toNum(site.longitude) },
      statut: toStr(site.status),
      structure_bati: site.structure_bati ?? null,
      enveloppe: site.enveloppe ?? null,
      amenagement: site.amenagement ?? null,
      facturation: billing
        ? { ...stripKeys(billing, ['audit_id', 'site_id', 'organization_id']), grille_tarifaire_resolue: resolveTariff(billing) }
        : null,
      zones,
      batiments_sans_zone: batiments.filter(b => !b.zone_id || !zoneIds.has(b.zone_id)),
    };
  });
}

// ─── Questionnaire d'inspection ───────────────────────────────────────────────
// Normalisation pilotée par QUESTIONNAIRE_SCHEMA : libellés, groupes de cases,
// codes OBIS / Woyofal. Les clés inconnues du schéma sont conservées (libellé = clé).

const GPS_FIELDS = new Set(['localisation_lat', 'localisation_lng']);
const SCHEMA_BY_ID = new Map(QUESTIONNAIRE_SCHEMA.map(sec => [sec.id, sec]));
const WOYOFAL_META = new Map(
  WOYOFAL_CODE_GROUPS.flatMap(g => g.codes.map(c => [c.code, { libelle: c.label, groupe: g.group }] as const)),
);
// Sections « compteur » (relevés Woyofal / index) : leurs cases cochées sont des défauts réseau
const METER_SECTION_IDS = new Set(QUESTIONNAIRE_SCHEMA.filter(sec => sec.hasWoyofal).map(sec => sec.id));

function toValeurReleve(raw: unknown, numeric = true): ValeurReleve {
  const valeur_brute = toStr(raw) ?? '';
  const valeur = numeric ? toNum(valeur_brute) : null;
  return numeric && valeur === null && valeur_brute !== ''
    ? { valeur_brute, valeur, valeur_invalide: true }
    : { valeur_brute, valeur };
}

function toCustomFields(rows: unknown): { cle: string; valeur: string }[] {
  return cleanRows<Record<string, any>>(rows, ['id'])
    .map(f => ({ cle: toStr(f.key) ?? '', valeur: toStr(f.value) ?? '' }));
}

function buildSessions(sec: Record<string, any>, questionnaire: { id: string; nom: string }): SessionReleveCompteur[] {
  const sessions: SessionReleveCompteur[] = [];

  for (const session of Array.isArray(sec.mesureSessions) ? sec.mesureSessions : []) {
    const readings = Array.isArray(session.readings) ? session.readings : [];
    const releves: (ReleveIndex | ReleveWoyofal)[] = [];

    for (const r of readings) {
      if (r?.kind === 'woyofal') {
        if (!toStr(r.code) && !toStr(r.valeur)) continue;
        const code = toStr(r.code) ?? '';
        const meta = WOYOFAL_META.get(code);
        releves.push({
          code,
          libelle: meta?.libelle ?? null,
          groupe: meta?.groupe ?? null,
          ...toValeurReleve(r.valeur, WOYOFAL_NUMBER_CODES.has(code)),
        });
      } else if (r?.kind === 'index') {
        const sousValeurs = (Array.isArray(r.subValues) ? r.subValues : [])
          .filter((sv: Record<string, any>) => toStr(sv?.valeur))
          .map((sv: Record<string, any>) => {
            const obis = OBIS_BY_KEY[sv.code];
            return {
              code_obis: obis?.code || String(sv.code ?? ''),
              signification: obis?.signification ?? null,
              libelle: toStr(obis?.libelle),
              ...toValeurReleve(sv.valeur, obis ? !['DATE', 'HEURE', '0.9.1', '0.9.2'].includes(obis.code) : true),
            };
          });
        if (!toStr(r.valeur) && sousValeurs.length === 0) continue;
        releves.push({
          parametre: toStr(r.key) ?? '',
          date: toStr(r.date),
          ...(toStr(r.valeur) ? toValeurReleve(r.valeur) : {}),
          sous_valeurs: sousValeurs,
        });
      }
    }

    if (releves.length === 0) continue;
    sessions.push({
      questionnaire_id: questionnaire.id,
      questionnaire: questionnaire.nom,
      session_id: String(session.id ?? ''),
      session: toStr(session.label) ?? '',
      type: session.type === 'WOYOFAL' ? 'WOYOFAL' : 'INDEX',
      date: toStr(session.dateTime),
      releves,
    });
  }

  // Ancien format : relevés Woyofal à plat (avant les sessions datées)
  const legacy = cleanRows<Record<string, any>>(sec.woyofalEntries, ['id']);
  if (legacy.length > 0) {
    sessions.push({
      questionnaire_id: questionnaire.id,
      questionnaire: questionnaire.nom,
      session_id: 'woyofal-ancien-format',
      session: 'Relevés Woyofal (ancien format)',
      type: 'WOYOFAL',
      date: null,
      releves: legacy.map(e => {
        const code = toStr(e.code) ?? '';
        const meta = WOYOFAL_META.get(code);
        return {
          code,
          libelle: meta?.libelle ?? null,
          groupe: meta?.groupe ?? null,
          ...toValeurReleve(e.valeur, WOYOFAL_NUMBER_CODES.has(code)),
        };
      }),
    });
  }

  return sessions;
}

function buildSection(sec: Record<string, any>, questionnaire: { id: string; nom: string }): SectionInspection | null {
  const schema = SCHEMA_BY_ID.get(sec.id);
  const fields = (sec.fields ?? {}) as Record<string, unknown>;

  // Champs : ordre du schéma d'abord, puis les clés inconnues
  const schemaFieldIds = (schema?.fields ?? []).map(f => f.id);
  const orderedKeys = [...schemaFieldIds, ...Object.keys(fields).filter(k => !schemaFieldIds.includes(k))];
  const champs = orderedKeys
    .filter(k => !GPS_FIELDS.has(k) && toStr(fields[k]))
    .map(k => ({
      cle: k,
      libelle: schema?.fields?.find(f => f.id === k)?.label ?? k,
      valeur: String(fields[k]).trim(),
    }));

  const lat = toNum(fields.localisation_lat);
  const lng = toNum(fields.localisation_lng);

  const tableau = (Array.isArray(sec.tableRows) ? sec.tableRows : [])
    .map((r: Record<string, any>) => {
      const readings = Array.isArray(r.readings) && r.readings.length > 0
        ? r.readings.filter((rd: Record<string, any>) => toStr(rd.value))
            .map((rd: Record<string, any>) => ({ date: toStr(rd.dateTime), valeur: String(rd.value).trim() }))
        : toStr(r.value) ? [{ date: toStr(r.dateTime), valeur: String(r.value).trim() }] : [];
      return { cle: String(r.id ?? ''), libelle: toStr(r.label) ?? String(r.id ?? ''), sous_groupe: toStr(r.subGroup), releves: readings };
    })
    .filter((r: { releves: unknown[] }) => r.releves.length > 0);

  const checked = (items: unknown, groupe: string) =>
    (Array.isArray(items) ? items : [])
      .filter((c: Record<string, any>) => c?.checked)
      .map((c: Record<string, any>) => ({ groupe, cle: String(c.id ?? ''), libelle: toStr(c.label) ?? String(c.id ?? ''), commentaire: toStr(c.comment) }));
  const cases_cochees = [
    ...checked(sec.checkboxItems, schema?.checkboxLabel ?? 'Éléments cochés'),
    ...checked(sec.extraCheckboxItems, schema?.extraCheckboxLabel ?? 'Usages'),
  ];

  const texte = toStr(sec.freeText);
  const section: SectionInspection = {
    id: String(sec.id ?? ''),
    titre: schema?.title ?? String(sec.id ?? ''),
    champs,
    coordonnees_gps: lat !== null && lng !== null ? { lat, lng } : null,
    tableau,
    cases_cochees,
    texte_libre: texte ? { libelle: schema?.freeTextLabel ?? 'Remarques', valeur: texte } : null,
    champs_personnalises: toCustomFields(sec.customFields),
    sessions_releves: buildSessions(sec, questionnaire),
  };

  const isEmpty = !champs.length && !section.coordonnees_gps && !tableau.length && !cases_cochees.length
    && !section.texte_libre && !section.champs_personnalises.length && !section.sessions_releves.length;
  return isEmpty ? null : section;
}

function buildInspection(gi: Record<string, any>): ProjectContextV1['inspection'] {
  const raw = Array.isArray(gi.pvQuestionnaires) ? gi.pvQuestionnaires : [];

  const questionnaires: QuestionnaireInspection[] = raw.map((q: Record<string, any>) => {
    const ref = { id: String(q.id ?? ''), nom: toStr(q.name) ?? 'Questionnaire' };
    return {
      id: ref.id,
      nom: ref.nom,
      cree_le: toStr(q.createdAt),
      champs_personnalises: toCustomFields(q.customFields),
      sections: (Array.isArray(q.sections) ? q.sections : [])
        .map((sec: Record<string, any>) => buildSection(sec, ref))
        .filter((sec: SectionInspection | null): sec is SectionInspection => sec !== null),
    };
  });

  return {
    questionnaires,
    releves_compteur_senelec: questionnaires.flatMap(q => q.sections.flatMap(sec => sec.sessions_releves)),
    defauts_reseau_constates: questionnaires.flatMap(q => q.sections
      .filter(sec => METER_SECTION_IDS.has(sec.id))
      .flatMap(sec => sec.cases_cochees.map(c => ({ questionnaire: q.nom, cle: c.cle, libelle: c.libelle, commentaire: c.commentaire })))),
  };
}

// ─── Facturation ──────────────────────────────────────────────────────────────

const MOIS_FR: Record<string, string> = {
  janv: '01', 'févr': '02', fevr: '02', mars: '03', avr: '04', mai: '05', juin: '06',
  juil: '07', 'août': '08', aout: '08', sept: '09', oct: '10', nov: '11', 'déc': '12', dec: '12',
};

function factureMonth(f: Record<string, any>): string | null {
  if (f.date_debut_periode) return String(f.date_debut_periode).slice(0, 7);
  // « févr », « février », « déc. »… : on teste les préfixes de 5, 4 puis 3 lettres
  const texte = String(f.mois_facturation ?? '').toLowerCase().replace('.', '').trim();
  const mois = [5, 4, 3].map(n => MOIS_FR[texte.slice(0, n)]).find(Boolean);
  return f.annee_facturation && mois ? `${f.annee_facturation}-${mois}` : null;
}

function aggregateFactures(rows: Record<string, any>[]): AgregatFactures {
  let conso = 0, k1 = 0, k2 = 0, ttc = 0, pmax: number | null = null, cosSum = 0, cosN = 0, quarantaine = 0;
  for (const f of rows) {
    conso += toNum(f.consommation_facturee) ?? toNum(f.cons_t) ?? 0;
    k1 += toNum(f.cons_k1) ?? 0;
    k2 += toNum(f.cons_k2) ?? 0;
    ttc += toNum(f.montant_facture_ttc) ?? 0;
    const p = toNum(f.puissance_max_kw);
    if (p !== null) pmax = pmax === null ? p : Math.max(pmax, p);
    const cos = toNum(f.valeur_cosinus_phi);
    if (cos !== null && cos > 0) { cosSum += cos; cosN++; }
    if (f.is_quarantined) quarantaine++;
  }
  return {
    nb_factures: rows.length,
    nb_en_quarantaine: quarantaine,
    conso_kwh: round(conso),
    conso_k1_kwh: round(k1),
    conso_k2_kwh: round(k2),
    montant_ttc_fcfa: round(ttc),
    puissance_max_kw: pmax,
    cos_phi_moyen: cosN > 0 ? round(cosSum / cosN, 3) : null,
  };
}

function periodOf(rows: Record<string, any>[]) {
  const debuts = rows.map(f => toStr(f.date_debut_periode)).filter((d): d is string => !!d).sort();
  const fins = rows.map(f => toStr(f.date_fin_periode)).filter((d): d is string => !!d).sort();
  return { debut: debuts[0] ?? null, fin: fins[fins.length - 1] ?? null };
}

function buildFacturation(raw: ProjectContextRawData): ProjectContextV1['facturation'] {
  const factures = raw.facturesSenelec;
  const siteNames = new Map(raw.sites.map(s => [s.id as string, s.name as string]));

  const byContract = new Map<string, Record<string, any>[]>();
  const byMonth = new Map<string, Record<string, any>[]>();
  for (const f of factures) {
    const contrat = toStr(f.numero_compte_contrat) ?? 'inconnu';
    if (!byContract.has(contrat)) byContract.set(contrat, []);
    byContract.get(contrat)!.push(f);
    const mois = factureMonth(f);
    if (mois) {
      if (!byMonth.has(mois)) byMonth.set(mois, []);
      byMonth.get(mois)!.push(f);
    }
  }

  const firstOf = (rows: Record<string, any>[], key: string) => rows.map(f => f[key]).find(v => toStr(v) !== null) ?? null;

  const factures_ocr = raw.ocrInvoices.map(inv => {
    let donnees: Record<string, any> = {};
    try {
      donnees = mapOcrToInvoiceData(inv.ocr_data, toNum(inv.amount) ?? undefined) as Record<string, any>;
    } catch {
      donnees = { erreur_extraction: true };
    }
    return {
      id: inv.id,
      fichier: toStr(inv.file_name),
      date_facture: toStr(inv.invoice_date),
      fournisseur: toStr(inv.supplier),
      statut: toStr(inv.status),
      en_quarantaine: !!inv.is_quarantined,
      motif_quarantaine: toStr(inv.quarantine_reason),
      site_id: inv.classeur_site_id ?? null,
      montant_ttc_fcfa: toNum(inv.amount),
      donnees,
    };
  });

  return {
    sources: { senelec_export: factures.length, ocr: raw.ocrInvoices.length },
    senelec: {
      periode: periodOf(factures),
      total: aggregateFactures(factures),
      par_contrat: [...byContract.entries()].map(([contrat, rows]) => {
        const siteId = firstOf(rows, 'classeur_site_id');
        return {
          numero_compte_contrat: contrat,
          numero_compteur: toStr(firstOf(rows, 'numero_compteur')),
          categorie_tarifaire: toStr(firstOf(rows, 'categorie_tarifaire')),
          puissance_souscrite_kw: toNum(firstOf(rows, 'puissance_souscrite_kw')),
          site_id: siteId,
          site_nom: siteId ? siteNames.get(siteId) ?? null : null,
          periode: periodOf(rows),
          ...aggregateFactures(rows),
        };
      }),
      serie_mensuelle: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mois, rows]) => ({ mois, ...aggregateFactures(rows) })),
      detail: { vue: 'v_factures_senelec_projet', filtre: `audit_id = '${raw.audit.id}'` },
    },
    factures_ocr,
  };
}

// ─── API publique ─────────────────────────────────────────────────────────────

function assembleProjectContext(raw: ProjectContextRawData, generatedBy: string | null): ProjectContextV1 {
  const a = raw.audit;
  const gi = (a.general_info ?? {}) as Record<string, any>;
  const personnel = (a.personnel ?? {}) as Record<string, any>;

  return {
    schema_version: PROJECT_CONTEXT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
    projet: {
      id: a.id,
      nom: a.name,
      couleur: toStr(a.color),
      statut: toStr(a.status),
      date_debut: toStr(a.start_date),
      date_fin: toStr(a.end_date),
      avancement_pct: toNum(a.completion_percentage),
      responsable: toStr(a.responsable),
      type_client: a.client_type ?? null,
      type_client_autre: toStr(gi.clientTypeAutre),
      sous_type: toStr(gi.specifique?.sousType),
      organisation: { id: a.organization_id, nom: raw.organization?.name ?? null },
      cree_par: a.created_by ?? null,
      cree_le: toStr(a.created_at),
      maj_le: toStr(a.updated_at),
    },
    informations_generales: buildInformationsGenerales(gi),
    personnel: buildPersonnel(gi, personnel),
    calendrier: buildCalendrier(raw),
    reglages: buildReglages(raw),
    sites: buildSites(raw),
    inspection: buildInspection(gi),
    facturation: buildFacturation(raw),
    brut: { general_info: gi, personnel },
  };
}

async function buildProjectContext(auditId: string, generatedBy: string | null = null): Promise<ProjectContextV1> {
  const raw = await getProjectContextRawData(auditId);
  return assembleProjectContext(raw, generatedBy);
}

/** Régénère et persiste le JSON d'un projet. */
export async function refreshProjectContext(auditId: string, generatedBy: string | null = null): Promise<ProjectContextV1> {
  const context = await buildProjectContext(auditId, generatedBy);
  await saveProjectContext(auditId, context);
  return context;
}

/** Régénère le JSON de tous les projets d'une organisation (après un changement de réglages). */
export async function refreshOrganizationProjectContexts(
  organizationId: string,
  generatedBy: string | null = null,
): Promise<{ total: number; failed: number }> {
  const ids = await listOrganizationAuditIds(organizationId);
  const results = await Promise.allSettled(ids.map(id => refreshProjectContext(id, generatedBy)));
  return { total: ids.length, failed: results.filter(r => r.status === 'rejected').length };
}
