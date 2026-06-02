import { useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp, Settings2, Pencil, ClipboardList, MapPin, FileDown, ExternalLink, CalendarIcon, Clock } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { PVQuestionnaire, PVSectionData, PVTableRow, PVTableRowReading, PVCheckboxItem, WoyofalEntry } from '@/types/audit';

// ─── Schema types (internal, not stored) ─────────────────────────────────────

type PVSchemaFieldType = 'text' | 'textarea';

interface PVSchemaField {
  id: string;
  label: string;
  type: PVSchemaFieldType;
}

interface PVSchemaTableRowDef {
  id: string;
  label: string;
  subGroup?: string;
}

interface PVSchemaCheckboxItemDef {
  id: string;
  label: string;
}

interface PVSectionSchema {
  id: string;
  title: string;
  fields?: PVSchemaField[];
  tableRows?: PVSchemaTableRowDef[];
  tableMode?: 'senelec' | 'system';
  checkboxItems?: PVSchemaCheckboxItemDef[];
  checkboxLabel?: string;
  extraCheckboxItems?: PVSchemaCheckboxItemDef[];
  extraCheckboxLabel?: string;
  hasFreeText?: boolean;
  freeTextLabel?: string;
  hasWoyofal?: boolean;
}

// ─── Schema Definition ────────────────────────────────────────────────────────

const QUESTIONNAIRE_SCHEMA: PVSectionSchema[] = [
  {
    id: 's1',
    title: 'Informations Générales',
    fields: [
      { id: 'nomSite', label: 'Nom du site', type: 'text' },
      { id: 'activiteSite', label: 'Activité du site', type: 'text' },
      { id: 'localisation', label: 'Localisation (adresse précise)', type: 'text' },
      { id: 'dateVisite', label: 'Date et heure de la visite', type: 'text' },
      { id: 'responsableInspection', label: "Responsable de l'inspection (nom et fonction)", type: 'text' },
      { id: 'equipePresente', label: 'Équipe présente sur site', type: 'text' },
      { id: 'telephoneContact', label: 'Téléphone de contact sur site', type: 'text' },
      { id: 'objectifVisite', label: 'Objectif principal de la visite', type: 'text' },
      { id: 'conditionsMeteo', label: 'Conditions météorologiques détaillées', type: 'text' },
      { id: 'statutInitialPV', label: 'Statut initial du système photovoltaïque', type: 'text' },
      { id: 'observationsPreliminaires', label: 'Observations générales préliminaires', type: 'textarea' },
    ],
  },
  {
    id: 's2',
    title: 'Relevé Compteur SENELEC',
    tableMode: 'senelec',
    hasWoyofal: true,
    tableRows: [
      { id: 'indexDepart', label: 'Index départ' },
      { id: 'indexFin', label: 'Index fin' },
      { id: 'puissanceMaxMoisCourant', label: 'Puissance max demandée du mois en cours' },
      { id: 'puissanceMaxMoisN1', label: 'Puissance max demandée du mois antérieur (N-1)' },
      { id: 'puissanceMaxMoisN2', label: 'Puissance max demandée du mois antérieur (N-2)' },
      { id: 'puissanceSouscrite', label: 'Puissance souscrite' },
      { id: 'facteurPuissance', label: 'Facteur de puissance' },
      { id: 'frequence', label: 'Fréquence' },
      { id: 'modele', label: 'Modèle' },
      { id: 'referencesNumero', label: 'Références / numéro' },
    ],
    checkboxLabel: 'Défaut réseau constaté',
    checkboxItems: [
      { id: 'tensionTropHaute', label: 'Tension trop haute' },
      { id: 'tensionTropBasse', label: 'Tension trop basse' },
      { id: 'frequenceTropHaute', label: 'Fréquence trop haute' },
      { id: 'frequenceTropBasse', label: 'Fréquence trop basse' },
      { id: 'coupureIntempestive', label: 'Coupure intempestive' },
    ],
  },
  {
    id: 's3',
    title: 'Caractéristiques Techniques de la Centrale PV',
    fields: [
      { id: 'puissanceInstalleeKwc', label: 'Puissance installée (kWc)', type: 'text' },
      { id: 'architecture', label: 'Architecture (centralisée, décentralisée)', type: 'text' },
      { id: 'systemeFixation', label: 'Système de fixation/intégration', type: 'text' },
      { id: 'dateMiseEnService', label: 'Date de mise en service', type: 'text' },
      { id: 'installateur', label: 'Installateur', type: 'text' },
      { id: 'exploitant', label: 'Exploitant', type: 'text' },
    ],
  },
  {
    id: 's4',
    title: 'Modules Photovoltaïques (PV)',
    fields: [
      { id: 'fabricantModeleType', label: 'Fabricant, modèle, type', type: 'text' },
      { id: 'numeroSerie', label: 'Numéro de série', type: 'text' },
      { id: 'puissanceCrete', label: 'Puissance crête (Pmax en Wc)', type: 'text' },
      { id: 'tensionPuissanceMax', label: 'Tension à puissance max. (Vmp)', type: 'text' },
      { id: 'courantPuissanceMax', label: 'Courant à puissance max. (Imp)', type: 'text' },
      { id: 'tensionCircuitOuvert', label: 'Tension circuit ouvert (Voc)', type: 'text' },
      { id: 'courantCourtCircuit', label: 'Courant court-circuit (Isc)', type: 'text' },
      { id: 'calibreFusible', label: 'Calibre du fusible maximal (IRM)', type: 'text' },
      { id: 'rendement', label: 'Rendement (%) sous conditions standard (STC)', type: 'text' },
      { id: 'dimensionsPoids', label: 'Dimensions, poids, nombre de cellules', type: 'text' },
      { id: 'garantie', label: 'Garantie produit et performance', type: 'text' },
    ],
  },
  {
    id: 's5',
    title: 'Onduleur',
    fields: [
      { id: 'marqueModeleSerieAnnee', label: 'Marque, modèle, numéro de série, année fabrication', type: 'text' },
      { id: 'typeOnduleur', label: "Type d'onduleur", type: 'text' },
      { id: 'puissanceNominale', label: 'Puissance nominale (kW)', type: 'text' },
      { id: 'plageTensionFrequence', label: 'Plage tension entrée (DC), tension et fréquence sortie (AC)', type: 'text' },
      { id: 'efficaciteMaximale', label: 'Efficacité maximale (%)', type: 'text' },
      { id: 'refroidissementCompatibilite', label: 'Méthode de refroidissement, compatibilité structure PV', type: 'text' },
      { id: 'dispositifsProtection', label: 'Dispositifs de protection, conformité normes', type: 'text' },
      { id: 'communicationMonitoring', label: "Communication et intégration à un système de monitoring", type: 'text' },
      { id: 'etatPhysiqueHistorique', label: 'État physique, température de fonctionnement, historique maintenance', type: 'textarea' },
      { id: 'zoneImplantation', label: "Zone d'implantation de l'onduleur", type: 'text' },
    ],
  },
  {
    id: 's6',
    title: 'Batterie',
    fields: [
      { id: 'marqueModeleSerieAnnee', label: 'Marque, modèle, numéro de série, année fabrication', type: 'text' },
      { id: 'typeBatterie', label: 'Type de batterie (lithium-ion, plomb-acide, etc.)', type: 'text' },
      { id: 'capaciteNominale', label: 'Capacité nominale (Ah ou kWh)', type: 'text' },
      { id: 'energieUtilisable', label: 'Énergie utilisable (kWh, %)', type: 'text' },
      { id: 'tensionNominale', label: 'Tension nominale (V)', type: 'text' },
      { id: 'dureeVieEstimee', label: 'Durée de vie estimée (cycles ou années)', type: 'text' },
      { id: 'plagesTension', label: "Plage de tension d'entrée et de sortie", type: 'text' },
      { id: 'courantMaxChargeDecharge', label: 'Courant maximal de charge/décharge', type: 'text' },
      { id: 'rendement', label: 'Rendement (%)', type: 'text' },
      { id: 'profondeurDecharge', label: 'Profondeur de décharge (DoD, %) / Compatibilité avec l\'installation existante', type: 'text' },
      { id: 'temperatureFonctionnement', label: 'Température de fonctionnement (plage en °C)', type: 'text' },
      { id: 'systemeBMS', label: "Présence d'un système de gestion (BMS) et ses fonctions", type: 'text' },
      { id: 'indiceProtection', label: 'Indice de protection (IP)', type: 'text' },
      { id: 'zoneInstallation', label: 'Zone d\'installation des batteries', type: 'text' },
    ],
  },
  {
    id: 's7',
    title: 'Câble DC & AC',
    fields: [
      { id: 'type', label: 'Type (isolé, résistant UV, monophasé/triphasé)', type: 'text' },
      { id: 'tensionNominaleSupportee', label: 'Tension nominale supportée (DC et AC)', type: 'text' },
      { id: 'sectionCables', label: 'Section câbles (en mm²)', type: 'text' },
      { id: 'materiauxIsolation', label: 'Matériaux conducteur (cuivre/aluminium) et isolation (PVC/XLPE)', type: 'text' },
      { id: 'normesCertifications', label: 'Normes et certifications appliquées', type: 'text' },
    ],
  },
  {
    id: 's8',
    title: 'Système Solaire Photovoltaïque',
    tableMode: 'system',
    tableRows: [
      { id: 'nombreLignes', label: 'Nombre de lignes', subGroup: 'Générateur PV' },
      { id: 'caracteristiquesLignes', label: 'Caractéristiques des lignes', subGroup: 'Générateur PV' },
      { id: 'dispositifsProtectionDC', label: 'Dispositifs de protection DC', subGroup: 'Générateur PV' },
      { id: 'parafoudre', label: 'Parafoudre', subGroup: 'Générateur PV' },
      { id: 'miseATerre', label: 'Mise à la terre', subGroup: 'Générateur PV' },
      { id: 'fusibles', label: 'Fusibles', subGroup: 'Générateur PV' },
      { id: 'sectionneursDS', label: 'Sectionneurs DC', subGroup: 'Générateur PV' },
      { id: 'typeStructurePorteuse', label: 'Type de structure porteuse', subGroup: 'Structure porteuse' },
      { id: 'materiaux', label: 'Matériaux', subGroup: 'Structure porteuse' },
      { id: 'nombreOnduleurs', label: "Nombre d'onduleurs", subGroup: 'Onduleurs' },
      { id: 'couplages', label: 'Couplages', subGroup: 'Onduleurs' },
      { id: 'chainesParTracker', label: 'Nombre de chaînes par tracker (MPP trackers)', subGroup: 'Onduleurs' },
      { id: 'courantCharge', label: 'Courant de charge', subGroup: 'Système de stockage' },
      { id: 'batteriesEnSerie', label: 'Nombre de batteries en série', subGroup: 'Système de stockage' },
      { id: 'chainesParallele', label: 'Nombre de chaînes en parallèle', subGroup: 'Système de stockage' },
      { id: 'batteriesParChaine', label: 'Nombre de batteries par chaîne', subGroup: 'Système de stockage' },
    ],
  },
  {
    id: 's9',
    title: 'Suivi Production à Distance (Monitoring)',
    checkboxLabel: 'Type de connexion',
    checkboxItems: [
      { id: 'adsl', label: 'ADSL' },
      { id: 'fibreOptique', label: 'Fibre optique' },
      { id: 'gprsMobile', label: 'GPRS mobile' },
      { id: 'sigfox', label: 'SIGFOX (onde radio)' },
      { id: 'm2mMobile', label: 'M2M mobile' },
      { id: 'ethernetLocal', label: 'Ethernet / Local' },
      { id: 'autre', label: 'Autre (préciser)' },
    ],
    fields: [
      { id: 'logicielMonitoring', label: 'Logiciel/plateforme de monitoring utilisée', type: 'text' },
      { id: 'accesDistant', label: 'Accès distant disponible (oui/non)', type: 'text' },
      { id: 'donneesEnregistrees', label: 'Données enregistrées (types de mesures)', type: 'textarea' },
    ],
  },
  {
    id: 's10',
    title: 'Exploitation & Sécurité',
    fields: [
      { id: 'planMaintenance', label: 'Plan de maintenance', type: 'text' },
      { id: 'documentMaintenance', label: 'Document de maintenance', type: 'text' },
      { id: 'chargeMaintenance', label: 'Chargé de la maintenance', type: 'text' },
      { id: 'chargeExploitation', label: "Chargé de l'exploitation (si maintenance externalisée)", type: 'text' },
      { id: 'extincteur', label: "Existence d'extincteur d'incendie aux lieux adéquats", type: 'text' },
      { id: 'pictogrammes', label: 'Pictogrammes de sensibilisation', type: 'text' },
    ],
  },
  {
    id: 's11',
    title: 'Inspection Visuelle Détaillée — Identification Anomalies',
    checkboxLabel: 'Anomalies constatées',
    checkboxItems: [
      { id: 'etatGeneral', label: "État général panneaux (hotspots, traces d'escargots, corrosion, encrassement, délamination, bris de verre, fissures)" },
      { id: 'etatCables', label: 'État câbles (pincement, frottements, présence de rongeurs, dégradations visibles)' },
      { id: 'etatConnecteurs', label: 'État connecteurs (brûlés, corrodés ou dégradés)' },
      { id: 'ombrages', label: 'Ombrage éventuel (végétation, obstacles physiques, accumulation de saletés)' },
      { id: 'propreteFiltres', label: "Propreté filtres onduleurs, espace ventilation (filtres obstrués, circulation d'air réduite)" },
      { id: 'zonesCirculation', label: "Zones de circulation autour champ PV (chemins libres, obstacles dangereux, marquage non clair)" },
      { id: 'prisesDeTerre', label: 'Présence et état des prises de terre (connexions visibles et en bon état)' },
      { id: 'onduleursEmplacement', label: "Emplacement et accessibilité des onduleurs (poussière, local non ventilé, accès non sécurisé)" },
      { id: 'fixationsStructures', label: 'Fixations et structures (état des supports — vis, rails, structures rouillées ou instables)' },
      { id: 'boitiersElectriques', label: "Boîtiers électriques (état des boîtes de jonction, serrage des connexions, étanchéité)" },
      { id: 'protectionSurtensions', label: 'Système de protection contre les surtensions (parafoudre)' },
      { id: 'alignementModules', label: 'Alignement des modules (décalages ou mouvements structurels)' },
    ],
    extraCheckboxLabel: 'Usages extérieurs',
    extraCheckboxItems: [
      { id: 'pompageStockage', label: "Pompage et stockage d'eau" },
      { id: 'arrosageAutomatique', label: 'Arrosage automatique des espaces verts' },
      { id: 'parkingService', label: 'Parking service ou privé (Véhicule)' },
      { id: 'eclairageExterieur', label: 'Éclairage extérieur' },
      { id: 'cameraSecurite', label: 'Caméras et systèmes de sécurité' },
      { id: 'barrieresPortails', label: 'Barrières automatiques et portails électriques' },
      { id: 'posteGardinage', label: 'Poste ou local de gardinage' },
    ],
    hasFreeText: true,
    freeTextLabel: 'Remarques et recommandations complémentaires',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEmptySectionData(schema: PVSectionSchema): PVSectionData {
  return {
    id: schema.id,
    fields: {},
    tableRows: schema.tableRows?.map((r) => ({
      id: r.id,
      label: r.label,
      dateTime: '',
      value: '',
      subGroup: r.subGroup,
      readings: schema.tableMode === 'senelec'
        ? [{ id: crypto.randomUUID(), dateTime: '', value: '' }]
        : undefined,
    })),
    checkboxItems: schema.checkboxItems?.map((c) => ({ id: c.id, label: c.label, checked: false, comment: '' })),
    extraCheckboxItems: schema.extraCheckboxItems?.map((c) => ({ id: c.id, label: c.label, checked: false })),
    freeText: schema.hasFreeText ? '' : undefined,
    customFields: [],
    woyofalEntries: schema.hasWoyofal ? [] : undefined,
  };
}

function createEmptyQuestionnaire(name: string): PVQuestionnaire {
  return {
    id: crypto.randomUUID(),
    name,
    sections: QUESTIONNAIRE_SCHEMA.map(createEmptySectionData),
    customFields: [],
    createdAt: new Date().toISOString(),
  };
}

// ─── Map View (static image + external links) ────────────────────────────────

function MapViewDialog({ open, onOpenChange, lat, lng, label }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lat: number;
  lng: number;
  label?: string;
}) {
  const googleUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const osmUrl    = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
  const wazeUrl   = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Localisation enregistrée</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Coordinates card */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-400 shrink-0" />
              <span className="text-sm font-medium text-blue-300">Position GPS</span>
            </div>
            {label && (
              <p className="text-sm text-slate-300 leading-snug pl-7">{label}</p>
            )}
            <div className="pl-7 space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">Latitude</span>
                <span className="text-sm font-mono text-slate-200">{lat.toFixed(6)}°</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-20">Longitude</span>
                <span className="text-sm font-mono text-slate-200">{lng.toFixed(6)}°</span>
              </div>
            </div>
          </div>

          {/* Open in map app */}
          <div className="space-y-1.5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Ouvrir dans</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Google Maps', url: googleUrl },
                { label: 'OpenStreetMap', url: osmUrl },
                { label: 'Waze', url: wazeUrl },
              ].map(({ label: lbl, url }) => (
                <a key={lbl} href={url} target="_blank" rel="noreferrer" className="contents">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-1.5 border-slate-600 bg-slate-700/30 text-slate-300 hover:bg-slate-700 hover:text-white text-xs"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {lbl}
                  </Button>
                </a>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="bg-slate-700 hover:bg-slate-600 text-slate-100">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SenelecTableEditor (Section 2) — multi-readings per row ─────────────────

function resolveReadings(row: PVTableRow): PVTableRowReading[] {
  if (row.readings && row.readings.length > 0) return row.readings;
  // backward compat: old data had flat dateTime/value
  return [{ id: row.id + '_r0', dateTime: row.dateTime || '', value: row.value || '' }];
}

// value format: "dd/MM/yyyy" or "dd/MM/yyyy HH:mm"
function splitDateTime(value: string): [string, string] {
  const m = value.trim().match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{1,2}:\d{2}))?$/);
  if (m) return [m[1], m[2] ?? ''];
  return [value, ''];
}

function parseReadingDate(value: string): Date | undefined {
  const [datePart] = splitDateTime(value);
  if (!datePart) return undefined;
  const d = parse(datePart, 'dd/MM/yyyy', new Date());
  return isValid(d) ? d : undefined;
}

function ReadingDateTimePicker({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [, timePart] = splitDateTime(value);
  const date = parseReadingDate(value);

  const commit = (d: Date | undefined, t: string) => {
    if (!d) { onChange(''); return; }
    const ds = format(d, 'dd/MM/yyyy');
    onChange(t ? `${ds} ${t}` : ds);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-left focus:outline-none focus:ring-1 focus:ring-blue-500/60',
            value ? 'text-slate-100' : 'text-slate-600',
          )}
        >
          <CalendarIcon className="h-3 w-3 shrink-0 text-slate-500" />
          {value || 'jj/mm/aaaa hh:mm'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={fr}
          selected={date}
          onSelect={(d) => commit(d, timePart)}
          initialFocus
        />
        <div className="flex items-center gap-2 border-t border-slate-700/60 px-3 py-2">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          <input
            type="time"
            value={timePart}
            onChange={(e) => commit(date, e.target.value)}
            className="rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500/60 [color-scheme:dark]"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SenelecTableEditor({ rows, onChange }: {
  rows: PVTableRow[];
  onChange: (rows: PVTableRow[]) => void;
}) {
  const commitReadings = (rowId: string, readings: PVTableRowReading[]) => {
    onChange(rows.map((r) => r.id === rowId
      ? { ...r, readings, dateTime: readings[0]?.dateTime ?? '', value: readings[0]?.value ?? '' }
      : r,
    ));
  };

  const addReading = (row: PVTableRow) => {
    const cur = resolveReadings(row);
    commitReadings(row.id, [...cur, { id: crypto.randomUUID(), dateTime: '', value: '' }]);
  };

  const removeReading = (row: PVTableRow, readingId: string) => {
    const cur = resolveReadings(row);
    if (cur.length <= 1) return;
    commitReadings(row.id, cur.filter((rd) => rd.id !== readingId));
  };

  const updateReading = (row: PVTableRow, readingId: string, field: 'dateTime' | 'value', val: string) => {
    const cur = resolveReadings(row);
    commitReadings(row.id, cur.map((rd) => rd.id === readingId ? { ...rd, [field]: val } : rd));
  };

  return (
    <div className="rounded-lg border border-slate-700/60 overflow-hidden">
      {/* header */}
      <div className="grid grid-cols-[minmax(160px,35%)_1fr_1fr_28px] border-b border-slate-700/60 bg-slate-900/40 px-3 py-2 gap-1">
        <span className="text-xs font-medium text-slate-400">Relevés</span>
        <span className="text-xs font-medium text-slate-400">Date et heure</span>
        <span className="text-xs font-medium text-slate-400">Valeur</span>
        <span />
      </div>

      {rows.map((row, rowIdx) => {
        const readings = resolveReadings(row);
        return (
          <div key={row.id} className={cn('border-b border-slate-700/40 last:border-0', rowIdx % 2 === 1 && 'bg-slate-800/20')}>
            {readings.map((rd, rdIdx) => (
              <div key={rd.id} className="grid grid-cols-[minmax(160px,35%)_1fr_1fr_28px] gap-1 px-2 py-1 items-center">
                {/* label only on first reading */}
                <span className={cn('px-1 text-xs text-slate-300 leading-snug', rdIdx > 0 && 'invisible select-none')}>
                  {row.label}
                </span>

                <ReadingDateTimePicker
                  value={rd.dateTime}
                  onChange={(v) => updateReading(row, rd.id, 'dateTime', v)}
                />

                <input
                  type="text"
                  value={rd.value}
                  onChange={(e) => updateReading(row, rd.id, 'value', e.target.value)}
                  placeholder="—"
                  className="rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                />

                {/* last reading: show + ; others: show × */}
                {rdIdx === readings.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => addReading(row)}
                    title="Ajouter une valeur"
                    className="flex items-center justify-center text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => removeReading(row, rd.id)}
                    title="Supprimer cette valeur"
                    className="flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Codes courts Woyofal (SENELEC) ──────────────────────────────────────────

const WOYOFAL_CODE_GROUPS: { group: string; codes: { code: string; label: string }[] }[] = [
  {
    group: 'Général',
    codes: [
      { code: '802', label: 'Date actuelle du compteur' },
      { code: '803', label: 'Heure actuelle du compteur' },
    ],
  },
  {
    group: 'Compteur (paramètres techniques)',
    codes: [
      { code: '804', label: 'Numéro du compteur' },
      { code: '869', label: 'Puissance limite (kW) — puissance souscrite' },
      { code: '808', label: 'Puissance instantanée consommée (W/kW)' },
      { code: '812', label: "Annuler l'alarme" },
      { code: '810', label: "Valeur du découvert (crédit d'urgence accordé)" },
    ],
  },
  {
    group: 'Consommation',
    codes: [
      { code: '800', label: 'Consommation totale cumulée (kWh)' },
      { code: '801', label: 'Crédit restant (kWh disponibles)' },
      { code: '813', label: 'Consommation des dernières 24h (kWh)' },
      { code: '814', label: 'Consommation du mois en cours (kWh)' },
      { code: '820', label: 'Consommation du mois précédent (kWh)' },
      { code: '817', label: 'Montant de la dernière recharge (FCFA)' },
      { code: '811', label: "Emprunt crédit / crédit d'urgence activé" },
      { code: '815', label: 'Date de la dernière recharge' },
      { code: '816', label: 'Heure de la dernière recharge' },
      { code: '830', label: 'Code de la dernière recharge' },
    ],
  },
];

const WOYOFAL_CODE_LABELS: Record<string, string> = Object.fromEntries(
  WOYOFAL_CODE_GROUPS.flatMap((g) => g.codes.map((c) => [c.code, c.label])),
);

// Codes whose "valeur relevée" is itself a date/time value
const WOYOFAL_DATETIME_CODES = new Set(['802', '803', '815', '816']);

// ─── WoyofalEditor ────────────────────────────────────────────────────────────

function WoyofalEditor({ entries, onChange }: {
  entries: WoyofalEntry[];
  onChange: (entries: WoyofalEntry[]) => void;
}) {
  const add = () => onChange([...entries, { id: crypto.randomUUID(), code: '', valeur: '', dateTime: '' }]);
  const remove = (id: string) => onChange(entries.filter((e) => e.id !== id));
  const update = (id: string, field: 'code' | 'valeur' | 'dateTime', val: string) =>
    onChange(entries.map((e) => e.id === id ? { ...e, [field]: val } : e));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-400/90 uppercase tracking-wide">Compteurs Woyofal</p>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-400 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Ajouter un compteur
        </button>
      </div>

      {entries.length > 0 ? (
        <div className="rounded-lg border border-amber-500/25 overflow-hidden">
          <div className="grid grid-cols-[1.5fr_160px_1fr_28px] border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 gap-2">
            <span className="text-xs font-medium text-amber-400/80">Code Woyofal</span>
            <span className="text-xs font-medium text-amber-400/80">Date et heure</span>
            <span className="text-xs font-medium text-amber-400/80">Valeur relevée</span>
            <span />
          </div>
          {entries.map((entry, i) => (
            <div
              key={entry.id}
              className={cn('grid grid-cols-[1.5fr_160px_1fr_28px] gap-2 px-2 py-1 items-center border-b border-amber-500/10 last:border-0 group', i % 2 === 1 && 'bg-amber-500/5')}
            >
              <Select value={entry.code || undefined} onValueChange={(val) => update(entry.id, 'code', val)}>
                <SelectTrigger className="h-auto rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 focus:ring-1 focus:ring-amber-500/60">
                  <SelectValue placeholder="Sélectionner un code…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {WOYOFAL_CODE_GROUPS.map((g) => (
                    <SelectGroup key={g.group}>
                      <SelectLabel className="text-[10px] uppercase tracking-wide text-amber-400/70">
                        {g.group}
                      </SelectLabel>
                      {g.codes.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="text-xs">
                          <span className="font-mono font-medium">{c.code}</span> — {c.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <ReadingDateTimePicker
                value={entry.dateTime ?? ''}
                onChange={(v) => update(entry.id, 'dateTime', v)}
              />
              {WOYOFAL_DATETIME_CODES.has(entry.code) ? (
                <ReadingDateTimePicker
                  value={entry.valeur}
                  onChange={(v) => update(entry.id, 'valeur', v)}
                />
              ) : (
                <input
                  type="text"
                  value={entry.valeur}
                  onChange={(e) => update(entry.id, 'valeur', e.target.value)}
                  placeholder="—"
                  className="rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                />
              )}
              <button
                type="button"
                onClick={() => remove(entry.id)}
                className="flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-lg border border-dashed border-amber-500/20 bg-amber-500/5 px-4 py-3 text-center cursor-pointer hover:bg-amber-500/10 transition-colors"
          onClick={add}
        >
          <p className="text-xs text-slate-500">Aucun compteur Woyofal saisi — cliquez pour ajouter</p>
        </div>
      )}
    </div>
  );
}

// ─── SystemTableEditor (Section 8) ───────────────────────────────────────────

function SystemTableEditor({ rows, onChange }: {
  rows: PVTableRow[];
  onChange: (rows: PVTableRow[]) => void;
}) {
  const update = (id: string, val: string) => {
    onChange(rows.map((r) => (r.id === id ? { ...r, value: val } : r)));
  };

  const groups: string[] = [];
  rows.forEach((r) => { if (r.subGroup && !groups.includes(r.subGroup)) groups.push(r.subGroup); });

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/60 bg-slate-900/40">
            <th className="px-3 py-2 text-left text-slate-400 font-medium w-[35%]">Sous-système</th>
            <th className="px-3 py-2 text-left text-slate-400 font-medium w-[40%]">Paramètre</th>
            <th className="px-3 py-2 text-left text-slate-400 font-medium w-[25%]">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const groupRows = rows.filter((r) => r.subGroup === group);
            return groupRows.map((row, i) => (
              <tr key={row.id} className={cn('border-b border-slate-700/40 last:border-0', i % 2 === 1 && 'bg-slate-800/20')}>
                {i === 0 && (
                  <td
                    rowSpan={groupRows.length}
                    className="px-3 py-2 text-xs font-semibold text-blue-300/80 bg-blue-500/5 border-r border-slate-700/40 align-top pt-3"
                  >
                    {group}
                  </td>
                )}
                <td className="px-3 py-2 text-slate-300">{row.label}</td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => update(row.id, e.target.value)}
                    placeholder="—"
                    className="w-full rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                  />
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── CheckboxGroupEditor ──────────────────────────────────────────────────────

function CheckboxGroupEditor({ items, onChange, withComment = false }: {
  items: PVCheckboxItem[];
  onChange: (items: PVCheckboxItem[]) => void;
  withComment?: boolean;
}) {
  const toggle = (id: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, checked: !item.checked } : item));
  };
  const updateComment = (id: string, comment: string) => {
    onChange(items.map((item) => item.id === id ? { ...item, comment } : item));
  };

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="space-y-1.5">
          <div
            className={cn(
              'flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer',
              item.checked ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-slate-800/30 border border-transparent hover:bg-slate-800/50',
            )}
            onClick={() => toggle(item.id)}
          >
            <div className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors',
              item.checked ? 'bg-blue-500 border-blue-500' : 'border-slate-500 bg-slate-700/50',
            )}>
              {item.checked && (
                <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-sm text-slate-300 leading-relaxed select-none">{item.label}</span>
          </div>
          {withComment && item.checked && (
            <div className="ml-7">
              <textarea
                rows={2}
                value={item.comment || ''}
                onChange={(e) => updateComment(item.id, e.target.value)}
                placeholder="Commentaire / détails observés..."
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md border border-slate-600/50 bg-slate-800/40 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── CustomFieldsBuilder ──────────────────────────────────────────────────────

function CustomFieldsBuilder({ fields, onChange }: {
  fields: { id: string; key: string; value: string }[];
  onChange: (fields: { id: string; key: string; value: string }[]) => void;
}) {
  const addRow = () => onChange([...fields, { id: crypto.randomUUID(), key: '', value: '' }]);
  const removeRow = (id: string) => onChange(fields.filter((f) => f.id !== id));
  const updateRow = (id: string, field: 'key' | 'value', val: string) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [field]: val } : f)));

  return (
    <div className="rounded-lg border border-dashed border-slate-600/60 bg-slate-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-slate-300">Champs personnalisés</span>
        </div>
        <span className="text-xs text-slate-500">Ajoutez vos propres indicateurs</span>
      </div>
      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50 bg-slate-900/40">
                <th className="px-3 py-2 text-left text-slate-400 font-medium w-[45%]">Clé / Libellé</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium">Valeur</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.id} className={cn('border-b border-slate-700/40 last:border-0 group', i % 2 === 1 && 'bg-slate-800/20')}>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={f.key}
                      onChange={(e) => updateRow(f.id, 'key', e.target.value)}
                      placeholder="Ex: Irradiation annuelle"
                      className="w-full rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => updateRow(f.id, 'value', e.target.value)}
                      placeholder="—"
                      className="w-full rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(f.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-violet-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Ajouter une ligne
      </button>
    </div>
  );
}

// ─── SectionCustomFieldsBuilder (per-section) ────────────────────────────────

function SectionCustomFieldsBuilder({ fields, onChange }: {
  fields: { id: string; key: string; value: string }[];
  onChange: (fields: { id: string; key: string; value: string }[]) => void;
}) {
  const addRow = () => onChange([...fields, { id: crypto.randomUUID(), key: '', value: '' }]);
  const removeRow = (id: string) => onChange(fields.filter((f) => f.id !== id));
  const updateRow = (id: string, field: 'key' | 'value', val: string) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [field]: val } : f)));

  return (
    <div className="pt-3 border-t border-slate-700/30 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Champs additionnels</span>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-300 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Ajouter une ligne
        </button>
      </div>
      {fields.length > 0 && (
        <div className="space-y-1.5">
          {fields.map((f) => (
            <div key={f.id} className="flex gap-2 items-center group">
              <input
                type="text"
                value={f.key}
                onChange={(e) => updateRow(f.id, 'key', e.target.value)}
                placeholder="Clé / Libellé"
                className="flex-1 rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
              <input
                type="text"
                value={f.value}
                onChange={(e) => updateRow(f.id, 'value', e.target.value)}
                placeholder="Valeur"
                className="flex-1 rounded border border-slate-600/60 bg-slate-700/40 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
              <button
                type="button"
                onClick={() => removeRow(f.id)}
                className="text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

const SECTION_COLORS = [
  'text-blue-300', 'text-cyan-300', 'text-emerald-300', 'text-teal-300',
  'text-violet-300', 'text-indigo-300', 'text-sky-300', 'text-amber-300',
  'text-orange-300', 'text-rose-300', 'text-pink-300',
];

function SectionCard({ idx, schema, data, onChange }: {
  idx: number;
  schema: PVSectionSchema;
  data: PVSectionData;
  onChange: (data: PVSectionData) => void;
}) {
  const [open, setOpen] = useState(idx === 0);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapViewOpen, setMapViewOpen] = useState(false);
  const color = SECTION_COLORS[idx % SECTION_COLORS.length];

  const updateField = (id: string, val: string) =>
    onChange({ ...data, fields: { ...data.fields, [id]: val } });

  const hasLocalisationField = schema.fields?.some((f) => f.id === 'localisation');

  const handleGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Géolocalisation non supportée par ce navigateur.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let address = data.fields['localisation'] || '';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
          );
          if (res.ok) {
            const json = await res.json();
            address = json.display_name ?? address;
          }
        } catch {
          // keep existing address
        }
        onChange({
          ...data,
          fields: {
            ...data.fields,
            localisation: address,
            localisation_lat: String(lat),
            localisation_lng: String(lng),
          },
        });
        setGeoLoading(false);
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: "Accès à la position refusé. Autorisez la localisation dans les paramètres du navigateur.",
          2: "Position indisponible. Réessayez.",
          3: "Délai dépassé. Réessayez.",
        };
        setGeoError(msgs[err.code] ?? "Erreur de géolocalisation.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 bg-slate-800/60 hover:bg-slate-800/80 transition-colors text-left',
          open && 'border-b border-slate-700/50',
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center justify-center h-6 w-6 rounded-md text-xs font-bold bg-slate-700/80', color)}>
            {idx + 1}
          </span>
          <span className="text-sm font-medium text-slate-200">{schema.title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {hasLocalisationField && data.fields['localisation_lat'] && data.fields['localisation_lng'] && (
        <MapViewDialog
          open={mapViewOpen}
          onOpenChange={setMapViewOpen}
          lat={parseFloat(data.fields['localisation_lat'])}
          lng={parseFloat(data.fields['localisation_lng'])}
          label={data.fields['localisation']}
        />
      )}

      {open && (
        <div className="p-4 bg-slate-800/30 space-y-4">
          {/* Regular text/textarea fields */}
          {schema.fields && schema.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schema.fields.map((f) => {
                if (f.id === 'localisation') {
                  const lat = data.fields['localisation_lat'] ? parseFloat(data.fields['localisation_lat']) : undefined;
                  const lng = data.fields['localisation_lng'] ? parseFloat(data.fields['localisation_lng']) : undefined;
                  return (
                    <div key={f.id} className="sm:col-span-2 space-y-1.5">
                      <Label className="text-slate-400 text-xs">{f.label}</Label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={data.fields[f.id] || ''}
                          onChange={(e) => updateField(f.id, e.target.value)}
                          placeholder="Adresse ou description du site"
                          className="flex-1 rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={geoLoading}
                          onClick={handleGeolocation}
                          className="shrink-0 border-slate-600 bg-slate-700/40 text-slate-300 hover:bg-slate-700/80 hover:text-blue-300 transition-colors"
                        >
                          <MapPin className={cn('h-4 w-4 mr-1.5', geoLoading && 'animate-pulse')} />
                          {geoLoading ? 'Localisation…' : 'Ma position'}
                        </Button>
                        {lat && lng && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setMapViewOpen(true)}
                            className="shrink-0 border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors"
                          >
                            Voir
                          </Button>
                        )}
                      </div>
                      {geoError && (
                        <p className="text-xs text-red-400">{geoError}</p>
                      )}
                      {lat && lng && !geoError && (
                        <p className="text-xs text-blue-400/70">
                          GPS : {lat.toFixed(5)}, {lng.toFixed(5)}
                        </p>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={f.id} className={cn('space-y-1.5', f.type === 'textarea' && 'sm:col-span-2')}>
                    <Label className="text-slate-400 text-xs">{f.label}</Label>
                    {f.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={data.fields[f.id] || ''}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="w-full rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={data.fields[f.id] || ''}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        className="w-full rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Table (Section 2 — Senelec or Section 8 — System) */}
          {schema.tableRows && data.tableRows && (
            <>
              {schema.tableMode === 'senelec' && (
                <SenelecTableEditor
                  rows={data.tableRows}
                  onChange={(rows) => onChange({ ...data, tableRows: rows })}
                />
              )}
              {schema.tableMode === 'system' && (
                <SystemTableEditor
                  rows={data.tableRows}
                  onChange={(rows) => onChange({ ...data, tableRows: rows })}
                />
              )}
            </>
          )}

          {/* Woyofal sub-section (Section 2 only) */}
          {schema.hasWoyofal && (
            <WoyofalEditor
              entries={data.woyofalEntries ?? []}
              onChange={(entries) => onChange({ ...data, woyofalEntries: entries })}
            />
          )}

          {/* Checkbox group */}
          {schema.checkboxItems && data.checkboxItems && (
            <div className="space-y-2">
              {schema.checkboxLabel && (
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{schema.checkboxLabel}</p>
              )}
              <CheckboxGroupEditor
                items={data.checkboxItems}
                onChange={(items) => onChange({ ...data, checkboxItems: items })}
                withComment={schema.id === 's11'}
              />
            </div>
          )}

          {/* Extra checkbox group (Section 11 — Usages extérieurs) */}
          {schema.extraCheckboxItems && data.extraCheckboxItems && (
            <div className="space-y-2">
              {schema.extraCheckboxLabel && (
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{schema.extraCheckboxLabel}</p>
              )}
              <CheckboxGroupEditor
                items={data.extraCheckboxItems}
                onChange={(items) => onChange({ ...data, extraCheckboxItems: items })}
              />
            </div>
          )}

          {/* Free text (Section 11 — Remarques) */}
          {schema.hasFreeText && (
            <div className="space-y-1.5">
              {schema.freeTextLabel && (
                <Label className="text-slate-400 text-xs">{schema.freeTextLabel}</Label>
              )}
              <textarea
                rows={4}
                value={data.freeText || ''}
                onChange={(e) => onChange({ ...data, freeText: e.target.value })}
                placeholder="Saisissez vos remarques et recommandations..."
                className="w-full rounded-md border border-slate-600/60 bg-slate-700/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60 resize-none"
              />
            </div>
          )}

          {/* Per-section custom key-value fields */}
          <SectionCustomFieldsBuilder
            fields={data.customFields ?? []}
            onChange={(cf) => onChange({ ...data, customFields: cf })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Recap PDF ────────────────────────────────────────────────────────────────

function buildRecapHTML(questionnaire: PVQuestionnaire): string {
  let body = '';

  QUESTIONNAIRE_SCHEMA.forEach((schema, i) => {
    const sec = questionnaire.sections[i];
    if (!sec) return;

    const filledFields = schema.fields?.filter((f) => sec.fields[f.id] && f.id !== 'localisation_lat' && f.id !== 'localisation_lng') ?? [];
    const hasCoords = sec.fields['localisation_lat'] && sec.fields['localisation_lng'];
    const filledRows = sec.tableRows?.filter((r) => {
      if (r.readings && r.readings.length > 0) return r.readings.some((rd) => rd.value);
      return !!r.value;
    }) ?? [];
    const checkedItems = sec.checkboxItems?.filter((c) => c.checked) ?? [];
    const checkedExtra = sec.extraCheckboxItems?.filter((c) => c.checked) ?? [];
    const sectionCf = (sec.customFields ?? []).filter((f) => f.key || f.value);
    const filledWoyofal = (sec.woyofalEntries ?? []).filter((e) => e.code || e.valeur);

    if (!filledFields.length && !hasCoords && !filledRows.length && !checkedItems.length && !checkedExtra.length && !sec.freeText && !sectionCf.length && !filledWoyofal.length) return;

    body += `<h2>${i + 1}. ${schema.title}</h2>`;

    if (filledFields.length || hasCoords) {
      body += '<table><tbody>';
      filledFields.forEach((f) => {
        body += `<tr><td class="lbl">${f.label}</td><td>${(sec.fields[f.id] ?? '').replace(/\n/g, '<br>')}</td></tr>`;
      });
      if (hasCoords) {
        body += `<tr><td class="lbl">Coordonnées GPS</td><td>${parseFloat(sec.fields['localisation_lat']).toFixed(6)}, ${parseFloat(sec.fields['localisation_lng']).toFixed(6)}</td></tr>`;
      }
      body += '</tbody></table>';
    }

    if (filledRows.length) {
      body += '<table><thead><tr><th>Paramètre</th><th>Date / Heure</th><th>Valeur</th></tr></thead><tbody>';
      filledRows.forEach((r) => {
        const readings = r.readings?.filter((rd) => rd.value)
          ?? (r.value ? [{ id: '', dateTime: r.dateTime, value: r.value }] : []);
        readings.forEach((rd, rdIdx) => {
          body += `<tr><td>${rdIdx === 0 ? r.label : ''}</td><td>${rd.dateTime || '—'}</td><td>${rd.value}</td></tr>`;
        });
      });
      body += '</tbody></table>';
    }

    if (filledWoyofal.length) {
      body += '<p class="grp">Compteurs Woyofal</p>';
      body += '<table><thead><tr><th>Code Woyofal</th><th>Date et heure</th><th>Valeur relevée</th></tr></thead><tbody>';
      filledWoyofal.forEach((e) => {
        const woyofalLabel = WOYOFAL_CODE_LABELS[e.code] ? `${e.code} — ${WOYOFAL_CODE_LABELS[e.code]}` : e.code;
        body += `<tr><td>${woyofalLabel}</td><td>${e.dateTime || '—'}</td><td>${e.valeur}</td></tr>`;
      });
      body += '</tbody></table>';
    }

    if (checkedItems.length) {
      body += `<p class="grp">${schema.checkboxLabel ?? 'Éléments cochés'}</p><ul>`;
      checkedItems.forEach((c) => {
        body += `<li>${c.label}${c.comment ? ` — <em>${c.comment}</em>` : ''}</li>`;
      });
      body += '</ul>';
    }

    if (checkedExtra.length) {
      body += `<p class="grp">${schema.extraCheckboxLabel ?? 'Usages'}</p><ul>`;
      checkedExtra.forEach((c) => { body += `<li>${c.label}</li>`; });
      body += '</ul>';
    }

    if (sec.freeText) {
      body += `<p class="grp">${schema.freeTextLabel ?? 'Remarques'}</p><p>${sec.freeText.replace(/\n/g, '<br>')}</p>`;
    }

    if (sectionCf.length) {
      body += '<table><tbody>';
      sectionCf.forEach((f) => { body += `<tr><td class="lbl">${f.key}</td><td>${f.value}</td></tr>`; });
      body += '</tbody></table>';
    }
  });

  const globalCf = questionnaire.customFields.filter((f) => f.key || f.value);
  if (globalCf.length) {
    body += '<h2>Champs personnalisés</h2><table><tbody>';
    globalCf.forEach((f) => { body += `<tr><td class="lbl">${f.key}</td><td>${f.value}</td></tr>`; });
    body += '</tbody></table>';
  }

  const date = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Questionnaire — ${questionnaire.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:18mm 15mm;font-size:11px}
  .hdr{border-bottom:2px solid #1e3a5f;padding-bottom:10px;margin-bottom:18px}
  .hdr h1{color:#1e3a5f;font-size:17px;margin-bottom:3px}
  .hdr p{color:#888;font-size:10px}
  h2{color:#1e3a5f;font-size:12px;margin-top:18px;margin-bottom:7px;background:#eef2f7;padding:5px 9px;border-left:3px solid #1e3a5f;page-break-after:avoid}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:9px}
  th{background:#1e3a5f;color:#fff;text-align:left;padding:5px 7px;font-size:10px}
  td{border:1px solid #ddd;padding:4px 7px;vertical-align:top}
  tr:nth-child(even) td{background:#f8f8f8}
  .lbl{width:40%;color:#555;font-style:italic}
  p{margin:5px 0}
  p.grp{font-weight:bold;color:#1e3a5f;margin-top:8px}
  ul{list-style:none;padding:0 0 0 10px;margin-bottom:8px}
  ul li{padding:2px 0}
  ul li::before{content:"✓ ";color:#1e3a5f;font-weight:bold}
  @media print{body{padding:10mm}h2{page-break-inside:avoid}tr{page-break-inside:avoid}}
</style>
</head>
<body>
<div class="hdr">
  <h1>Questionnaire d'inspection — ${questionnaire.name}</h1>
  <p>Généré le ${date}</p>
</div>
${body}
</body>
</html>`;
}

function RecapContent({ questionnaire }: { questionnaire: PVQuestionnaire }) {
  return (
    <div className="space-y-3 text-sm">
      {QUESTIONNAIRE_SCHEMA.map((schema, i) => {
        const sec = questionnaire.sections[i];
        if (!sec) return null;

        const filledFields = schema.fields?.filter((f) => sec.fields[f.id] && f.id !== 'localisation_lat' && f.id !== 'localisation_lng') ?? [];
        const hasCoords = sec.fields['localisation_lat'] && sec.fields['localisation_lng'];
        const filledRows = sec.tableRows?.filter((r) => {
          if (r.readings && r.readings.length > 0) return r.readings.some((rd) => rd.value);
          return !!r.value;
        }) ?? [];
        const checkedItems = sec.checkboxItems?.filter((c) => c.checked) ?? [];
        const checkedExtra = sec.extraCheckboxItems?.filter((c) => c.checked) ?? [];
        const sectionCf = (sec.customFields ?? []).filter((f) => f.key || f.value);
        const filledWoyofal = (sec.woyofalEntries ?? []).filter((e) => e.code || e.valeur);

        if (!filledFields.length && !hasCoords && !filledRows.length && !checkedItems.length && !checkedExtra.length && !sec.freeText && !sectionCf.length && !filledWoyofal.length) return null;

        const color = SECTION_COLORS[i % SECTION_COLORS.length];

        return (
          <div key={schema.id} className="rounded-lg border border-slate-700/50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border-b border-slate-700/50">
              <span className={cn('flex items-center justify-center h-5 w-5 rounded text-xs font-bold bg-slate-700/80', color)}>{i + 1}</span>
              <span className="text-xs font-medium text-slate-300">{schema.title}</span>
            </div>
            <div className="p-3 bg-slate-800/20 space-y-2.5">
              {(filledFields.length > 0 || hasCoords) && (
                <div className="overflow-x-auto rounded border border-slate-700/40">
                  <table className="w-full text-xs">
                    <tbody>
                      {filledFields.map((f, fi) => (
                        <tr key={f.id} className={cn('border-b border-slate-700/30 last:border-0', fi % 2 === 1 && 'bg-slate-800/20')}>
                          <td className="px-3 py-1.5 text-slate-400 w-[42%]">{f.label}</td>
                          <td className="px-3 py-1.5 text-slate-200 whitespace-pre-wrap">{sec.fields[f.id]}</td>
                        </tr>
                      ))}
                      {hasCoords && (
                        <tr className="border-b border-slate-700/30 last:border-0">
                          <td className="px-3 py-1.5 text-slate-400">Coordonnées GPS</td>
                          <td className="px-3 py-1.5 text-blue-300">
                            {parseFloat(sec.fields['localisation_lat']).toFixed(5)}, {parseFloat(sec.fields['localisation_lng']).toFixed(5)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {filledRows.length > 0 && (
                <div className="overflow-x-auto rounded border border-slate-700/40">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700/50 bg-slate-900/30">
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Paramètre</th>
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Date / Heure</th>
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Valeur</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filledRows.flatMap((r) => {
                        const readings = r.readings?.filter((rd) => rd.value)
                          ?? (r.value ? [{ id: r.id + '_v', dateTime: r.dateTime, value: r.value }] : []);
                        return readings.map((rd, rdIdx) => (
                          <tr key={rd.id || r.id + rdIdx} className={cn('border-b border-slate-700/30 last:border-0', rdIdx % 2 === 1 && 'bg-slate-800/20')}>
                            <td className="px-3 py-1.5 text-slate-300">{rdIdx === 0 ? r.label : ''}</td>
                            <td className="px-3 py-1.5 text-slate-400">{rd.dateTime || '—'}</td>
                            <td className="px-3 py-1.5 text-slate-200">{rd.value}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filledWoyofal.length > 0 && (
                <div className="overflow-x-auto rounded border border-amber-500/25">
                  <div className="px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/20">
                    <span className="text-xs font-semibold text-amber-400/80 uppercase tracking-wide">Compteurs Woyofal</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-500/20 bg-amber-500/5">
                        <th className="px-3 py-1.5 text-left text-amber-400/70 font-medium">Code Woyofal</th>
                        <th className="px-3 py-1.5 text-left text-amber-400/70 font-medium">Date et heure</th>
                        <th className="px-3 py-1.5 text-left text-amber-400/70 font-medium">Valeur relevée</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filledWoyofal.map((e, ei) => (
                        <tr key={e.id} className={cn('border-b border-amber-500/10 last:border-0', ei % 2 === 1 && 'bg-amber-500/5')}>
                          <td className="px-3 py-1.5 text-slate-300">
                            <span className="font-mono">{e.code}</span>
                            {WOYOFAL_CODE_LABELS[e.code] && (
                              <span className="text-slate-400"> — {WOYOFAL_CODE_LABELS[e.code]}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-slate-400">{e.dateTime || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-200">{e.valeur}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {checkedItems.length > 0 && (
                <div className="space-y-1">
                  {schema.checkboxLabel && <p className="text-xs text-slate-500 uppercase tracking-wide">{schema.checkboxLabel}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {checkedItems.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20">
                        {c.label}{c.comment && <span className="text-blue-400/60"> — {c.comment}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {checkedExtra.length > 0 && (
                <div className="space-y-1">
                  {schema.extraCheckboxLabel && <p className="text-xs text-slate-500 uppercase tracking-wide">{schema.extraCheckboxLabel}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {checkedExtra.map((c) => (
                      <span key={c.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sec.freeText && (
                <div className="space-y-1">
                  {schema.freeTextLabel && <p className="text-xs text-slate-500">{schema.freeTextLabel}</p>}
                  <p className="text-xs text-slate-300 bg-slate-800/40 rounded px-3 py-2 whitespace-pre-wrap">{sec.freeText}</p>
                </div>
              )}

              {sectionCf.length > 0 && (
                <div className="overflow-x-auto rounded border border-violet-500/20">
                  <table className="w-full text-xs">
                    <tbody>
                      {sectionCf.map((f, fi) => (
                        <tr key={f.id} className={cn('border-b border-slate-700/30 last:border-0', fi % 2 === 1 && 'bg-slate-800/20')}>
                          <td className="px-3 py-1.5 text-violet-300/70 w-[42%]">{f.key}</td>
                          <td className="px-3 py-1.5 text-slate-200">{f.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {questionnaire.customFields.filter((f) => f.key || f.value).length > 0 && (
        <div className="rounded-lg border border-violet-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border-b border-violet-500/20">
            <Settings2 className="h-4 w-4 text-violet-400" />
            <span className="text-xs font-medium text-violet-300">Champs personnalisés globaux</span>
          </div>
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {questionnaire.customFields.filter((f) => f.key || f.value).map((f, fi) => (
                  <tr key={f.id} className={cn('border-b border-slate-700/30 last:border-0', fi % 2 === 1 && 'bg-slate-800/20')}>
                    <td className="px-3 py-1.5 text-violet-300/70 w-[42%]">{f.key}</td>
                    <td className="px-3 py-1.5 text-slate-200">{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RecapDialog({ open, onOpenChange, questionnaire }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  questionnaire: PVQuestionnaire;
}) {
  const handleExportPDF = () => {
    const html = buildRecapHTML(questionnaire);
    const win = window.open('', '_blank', 'width=900,height=720');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] bg-slate-900 border-slate-700 flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-slate-100">
              Tableau récapitulatif — {questionnaire.name}
            </DialogTitle>
            <Button size="sm" onClick={handleExportPDF} className="bg-blue-600 hover:bg-blue-500 text-white">
              <FileDown className="h-4 w-4 mr-1.5" />
              Télécharger PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-1">
          <RecapContent questionnaire={questionnaire} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── QuestionnaireTabBar ──────────────────────────────────────────────────────

function QuestionnaireTabBar({ questionnaires, activeId, onSelect, onAdd, onRemove, onRename }: {
  questionnaires: PVQuestionnaire[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (q: PVQuestionnaire, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(q.id);
    setEditValue(q.name);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center gap-1 px-1.5 py-1 bg-slate-900/60 rounded-xl border border-slate-700/50 flex-wrap">
        {questionnaires.map((q, i) => (
          <div
            key={q.id}
            onClick={() => onSelect(q.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-all select-none group',
              q.id === activeId
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
            )}
          >
            {editingId === q.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
                className="bg-transparent border-b border-blue-400 text-slate-100 text-sm outline-none w-28 min-w-0"
              />
            ) : (
              <>
                <span className="max-w-[140px] truncate">{q.name}</span>
                <button
                  type="button"
                  onClick={(e) => startEdit(q, e)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-all"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
            {i > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRemove(q.id); }}
                className="ml-0.5 text-slate-500 hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-600 text-slate-500 hover:border-blue-500/60 hover:text-blue-400 transition-all text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Dupliquer
        </button>
      </div>
    </div>
  );
}

// ─── PremiumToggle ────────────────────────────────────────────────────────────

function PremiumToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        'group cursor-pointer rounded-xl border transition-all duration-300 p-4',
        enabled
          ? 'border-blue-500/25 bg-blue-500/5'
          : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600/70 hover:bg-slate-800/60',
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex items-center justify-center h-9 w-9 rounded-lg transition-colors',
            enabled ? 'bg-blue-500/20' : 'bg-slate-700/60 group-hover:bg-slate-700/80',
          )}>
            <ClipboardList className={cn('h-5 w-5 transition-colors', enabled ? 'text-blue-300' : 'text-slate-500 group-hover:text-slate-400')} />
          </div>
          <div>
            <span className="text-sm font-medium text-slate-200">Questionnaire d'inspection</span>
            <p className="text-xs text-slate-500 mt-0.5">Optionnel — formulaire structuré en 11 sections</p>
          </div>
        </div>

        {/* Custom pill toggle */}
        <div className={cn(
          'relative flex-shrink-0 h-6 w-11 rounded-full border transition-all duration-300',
          enabled ? 'bg-blue-500/80 border-blue-400/60' : 'bg-slate-700 border-slate-600',
        )}>
          <div className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full shadow-md transition-all duration-300',
            enabled ? 'left-[22px] bg-white' : 'left-0.5 bg-slate-400',
          )} />
        </div>
      </div>
    </div>
  );
}

// ─── DuplicateDialog ──────────────────────────────────────────────────────────

function DuplicateDialog({ open, onOpenChange, count, onConfirm }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');

  const handleOpen = (v: boolean) => {
    if (v) setName(`Questionnaire ${count + 1}`);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Dupliquer le questionnaire</DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-1.5">
          <Label className="text-slate-400 text-sm">Nom du nouveau questionnaire</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onConfirm(name.trim()); onOpenChange(false); } }}
            placeholder="Ex: Building Communal — Visite 2"
            className="bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-blue-500"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200">
            Annuler
          </Button>
          <Button
            onClick={() => { if (name.trim()) { onConfirm(name.trim()); onOpenChange(false); } }}
            disabled={!name.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white"
          >
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AuditQuestionnaireProps {
  value: PVQuestionnaire[];
  onChange: (questionnaires: PVQuestionnaire[]) => void;
}

export default function AuditQuestionnaire({ value, onChange }: AuditQuestionnaireProps) {
  const enabled = value.length > 0;
  const [activeId, setActiveId] = useState<string>('');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);

  const activeQuestionnaire = value.find((q) => q.id === activeId) ?? value[0];

  const handleToggle = () => {
    if (enabled) {
      // Collapse UI, keep data
      onChange([]);
    } else {
      const q = createEmptyQuestionnaire('Questionnaire 1');
      onChange([q]);
      setActiveId(q.id);
    }
  };

  const handleAdd = (name: string) => {
    const q = createEmptyQuestionnaire(name);
    onChange([...value, q]);
    setActiveId(q.id);
  };

  const handleRemove = (id: string) => {
    const next = value.filter((q) => q.id !== id);
    onChange(next);
    if (activeId === id) setActiveId(next[0]?.id ?? '');
  };

  const handleRename = (id: string, name: string) => {
    onChange(value.map((q) => (q.id === id ? { ...q, name } : q)));
  };

  const updateQuestionnaire = (updated: PVQuestionnaire) => {
    onChange(value.map((q) => (q.id === updated.id ? updated : q)));
  };

  const updateSection = (sectionIdx: number, sectionData: PVSectionData) => {
    if (!activeQuestionnaire) return;
    const sections = activeQuestionnaire.sections.map((s, i) => (i === sectionIdx ? sectionData : s));
    updateQuestionnaire({ ...activeQuestionnaire, sections });
  };

  return (
    <div className="space-y-4">
      <PremiumToggle enabled={enabled} onToggle={handleToggle} />

      {enabled && activeQuestionnaire && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          {/* Tab bar */}
          <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 flex items-center justify-between gap-3">
            <QuestionnaireTabBar
              questionnaires={value}
              activeId={activeQuestionnaire.id}
              onSelect={setActiveId}
              onAdd={() => setDuplicateOpen(true)}
              onRemove={handleRemove}
              onRename={handleRename}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRecapOpen(true)}
              className="shrink-0 border-slate-600 bg-slate-700/40 text-slate-300 hover:bg-slate-700/80 hover:text-blue-300"
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Récap PDF
            </Button>
          </div>

          {/* Questionnaire content */}
          <div className="p-4 space-y-3">
            {QUESTIONNAIRE_SCHEMA.map((schema, i) => (
              <SectionCard
                key={schema.id}
                idx={i}
                schema={schema}
                data={activeQuestionnaire.sections[i] ?? createEmptySectionData(schema)}
                onChange={(d) => updateSection(i, d)}
              />
            ))}

            <CustomFieldsBuilder
              fields={activeQuestionnaire.customFields}
              onChange={(cf) => updateQuestionnaire({ ...activeQuestionnaire, customFields: cf })}
            />
          </div>
        </div>
      )}

      <DuplicateDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        count={value.length}
        onConfirm={handleAdd}
      />

      {activeQuestionnaire && (
        <RecapDialog
          open={recapOpen}
          onOpenChange={setRecapOpen}
          questionnaire={activeQuestionnaire}
        />
      )}
    </div>
  );
}
