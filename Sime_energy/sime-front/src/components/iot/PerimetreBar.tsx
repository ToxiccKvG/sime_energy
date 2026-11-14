// ============================================================
// IOT — Analyse : barre de périmètre (un seul chargement pour toutes les vues)
//
// Remplace le panneau « Charger depuis Supabase » (674 px, 69 réglages) ET
// le chargeur propre à la Courbe de charge : deux périodes différentes
// pouvaient s'afficher en même temps. Ici : site, appareils, période, plage
// horaire, puis « Analyser ». La granularité et les colonnes sont choisies
// automatiquement (réglages dans « Avancé »).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { BarChart2, ChevronDown, Search, Settings2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIOT } from './IOTContext';
import { fetchDisponibles, exporterDonneesSupabase, type SupabaseExportOptions } from '@/lib/iot-supabase-service';

/** Ce que l'utilisateur a choisi d'analyser, partagé par toutes les vues. */
export interface PerimetreAnalyse {
  site: string;              // le site s'il n'y en a qu'un ; '' = plusieurs, ou tous
  sites: string[];           // sites cochés ; vide = tous les sites
  deviceIds: string[];       // vide = tous les appareils du site
  dateDebut: string;         // 'YYYY-MM-DD'
  dateFin: string;
  heureDebut: number;        // plage appliquée CHAQUE jour
  heureFin: number;
  version: number;           // incrémenté à chaque « Analyser »
}

type Appareil = { name: string; device_id: string; device_family: string; site: string; room?: string | null };

const LIBELLE_FAMILLE: Record<string, string> = {
  ENERGIE_3PH: 'Compteurs triphasés', ENERGIE_2PH: 'Compteurs biphasés', ENERGIE_1PH: 'Prises et modules',
  LUMIERE: 'Éclairage', CAPTEUR_ENV: 'Capteurs d\'ambiance', ETAT: 'Capteurs d\'état',
};
const ENERGIE = new Set(['ENERGIE_3PH', 'ENERGIE_2PH', 'ENERGIE_1PH', 'LUMIERE']);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ilYa = (jours: number) => iso(new Date(Date.now() - jours * 86_400_000));
const PERIODES: { cle: string; libelle: string; debut: () => string; fin: () => string }[] = [
  { cle: '7j', libelle: '7 j', debut: () => ilYa(7), fin: () => ilYa(0) },
  { cle: '30j', libelle: '30 j', debut: () => ilYa(30), fin: () => ilYa(0) },
  { cle: 'mois', libelle: 'Ce mois', debut: () => { const d = new Date(); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); }, fin: () => ilYa(0) },
  { cle: 'moisPrec', libelle: 'Mois dernier', debut: () => { const d = new Date(); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))); }, fin: () => { const d = new Date(); return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0))); } },
];

const libelleResume = (nb: number, granularite: 'horaire' | 'minute') =>
  `${nb.toLocaleString('fr-FR')} relevés ${granularite === 'horaire' ? 'horaires' : 'à la minute'}`;

/**
 * Périmètre d'un chargement enregistré (recette rouverte), qui ne garde pas la
 * plage horaire : la journée entière. null si le chargement n'a pas de période.
 */
export function perimetreDepuisChargement(ch: SupabaseExportOptions): PerimetreAnalyse | null {
  if (!ch.dateDebut || !ch.dateFin) return null;
  const sites = ch.sites?.length ? ch.sites : ch.site ? [ch.site] : [];
  return { site: sites.length === 1 ? sites[0] : '', sites, deviceIds: ch.deviceIds ?? [], dateDebut: ch.dateDebut, dateFin: ch.dateFin, heureDebut: 0, heureFin: 23, version: 1 };
}

/** « Ma Maison », « Ma Maison, Donsin », « 4 sites », « Tous les sites ». */
export function libelleSites(sites: string[]): string {
  if (sites.length === 0) return 'Tous les sites';
  return sites.length <= 2 ? sites.join(', ') : `${sites.length} sites`;
}

/** Colonnes recommandées selon les familles chargées (fournies par l'onglet Analyse). */
type ColonnesRecommandees = (familles: Set<string>) => string[];

export function PerimetreBar({ colonnesRecommandees, onCharge, repris }: {
  colonnesRecommandees: ColonnesRecommandees;
  /** Chargement retrouvé au retour sur l'onglet : la barre affiche ce qui est à l'écran. */
  repris?: { perimetre: PerimetreAnalyse; chargement: SupabaseExportOptions; nbLignes: number };
  onCharge: (rows: Record<string, unknown>[], colonnes: string[], options: SupabaseExportOptions, perimetre: PerimetreAnalyse) => void;
}) {
  const [catalogue, setCatalogue] = useState<{ sites: string[]; devices: Appareil[] }>({ sites: [], devices: [] });
  const [sites, setSites] = useState<string[]>(repris?.perimetre.sites ?? []);
  const [deviceIds, setDeviceIds] = useState<string[]>(repris?.perimetre.deviceIds ?? []);
  const [recherche, setRecherche] = useState('');
  const [periode, setPeriode] = useState(repris ? 'perso' : '7j');
  const [dateDebut, setDateDebut] = useState(repris?.perimetre.dateDebut ?? ilYa(7));
  const [dateFin, setDateFin] = useState(repris?.perimetre.dateFin ?? ilYa(0));
  const [heureDebut, setHeureDebut] = useState(repris?.perimetre.heureDebut ?? 0);
  const [heureFin, setHeureFin] = useState(repris?.perimetre.heureFin ?? 23);
  const [granularite, setGranularite] = useState<'auto' | 'horaire' | 'minute'>(repris?.chargement.granularite ?? 'auto');
  const [limit, setLimit] = useState<number | undefined>(repris?.chargement.limit);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resume, setResume] = useState<string | null>(repris ? libelleResume(repris.nbLignes, repris.chargement.granularite ?? 'horaire') : null);
  const [version, setVersion] = useState(repris?.perimetre.version ?? 0);

  useEffect(() => { fetchDisponibles().then(d => setCatalogue({ sites: d.sites, devices: d.devices as Appareil[] })); }, []);

  // Raccourci venu de l'onglet Sources (« Analyser ») : site et appareils pré-cochés
  const { state: { analysePreset }, setAnalysePreset } = useIOT();
  useEffect(() => {
    if (!analysePreset || catalogue.devices.length === 0) return;
    setSites(analysePreset.site ? [analysePreset.site] : []);
    setDeviceIds(analysePreset.deviceIds);
    setAnalysePreset(null);
  }, [analysePreset, catalogue.devices.length, setAnalysePreset]);

  const appareilsSite = useMemo(
    () => catalogue.devices.filter(d => sites.length === 0 || sites.includes(d.site)).sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue.devices, sites],
  );
  const cibles = deviceIds.length > 0 ? appareilsSite.filter(d => deviceIds.includes(d.device_id)) : appareilsSite;
  const familles = useMemo(() => new Set(cibles.map(d => d.device_family).filter(Boolean)), [cibles]);

  // Granularité automatique : horaire (énergie et capteurs croisables), la
  // minute seulement pour une sélection composée uniquement de capteurs
  const granulariteEffective: 'horaire' | 'minute' = granularite !== 'auto' ? granularite
    : ([...familles].some(f => ENERGIE.has(f)) || familles.size === 0 ? 'horaire' : 'minute');

  const choisirPeriode = (cle: string) => {
    setPeriode(cle);
    const p = PERIODES.find(x => x.cle === cle);
    if (p) { setDateDebut(p.debut()); setDateFin(p.fin()); }
  };

  const analyser = async () => {
    if (dateFin < dateDebut) { setErreur('La date de fin précède la date de début.'); return; }
    setChargement(true); setErreur(null);
    const colonnes = colonnesRecommandees(familles);
    const options: SupabaseExportOptions = {
      colonnes,
      granularite: granulariteEffective,
      // Un seul site reste dans `site` : même requête et même recette qu'avant
      site: sites.length === 1 ? sites[0] : undefined,
      sites: sites.length > 1 ? sites : undefined,
      deviceIds: deviceIds.length > 0 ? deviceIds : undefined,
      dateDebut, dateFin, limit,
    };
    const res = await exporterDonneesSupabase(options);
    setChargement(false);
    if (res.erreur) { setErreur(res.erreur); return; }
    const v = version + 1;
    setVersion(v);
    setResume(libelleResume(res.total, granulariteEffective));
    onCharge(res.rows, colonnes, options, { site: sites.length === 1 ? sites[0] : '', sites, deviceIds, dateDebut, dateFin, heureDebut, heureFin, version: v });
  };

  // Deux sites ou plus à l'écran, y compris « Tous les sites »
  const plusieursSites = sites.length !== 1 && new Set(appareilsSite.map(d => d.site)).size > 1;
  const basculerSite = (s: string) => {
    setSites(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s]));
    setDeviceIds([]);
  };

  const parFamille = useMemo(() => {
    const m = new Map<string, Appareil[]>();
    for (const d of appareilsSite.filter(d => !recherche || d.name.toLowerCase().includes(recherche.toLowerCase()))) {
      // Plusieurs sites cochés : regroupés par site, puis par famille
      const k = `${plusieursSites ? d.site : ''}|${d.device_family || 'AUTRE'}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [appareilsSite, recherche, plusieursSites]);
  const basculer = (id: string) => setDeviceIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const basculerFamille = (ids: string[], tous: boolean) =>
    setDeviceIds(p => tous ? [...new Set([...p, ...ids])] : p.filter(x => !ids.includes(x)));

  const champ = 'h-8 bg-white/5 border border-white/20 text-white text-sm rounded-md px-2';
  const heures = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        {/* Site */}
        <div className="space-y-1">
          <span className="block text-xs text-slate-400">Sites</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className={`${champ} w-44 flex items-center justify-between`} aria-label="Choisir les sites">
                <span className="truncate">{libelleSites(sites)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2 bg-[#1a1d2e] border-white/20 max-h-96 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer py-1">
                <input type="checkbox" className="accent-violet-500" checked={sites.length === 0} onChange={() => { setSites([]); setDeviceIds([]); }} />
                Tous les sites
              </label>
              <div className="border-t border-white/10 my-1" />
              {catalogue.sites.map(s => (
                <label key={s} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer py-1">
                  <input type="checkbox" className="accent-violet-500" checked={sites.includes(s)} onChange={() => basculerSite(s)} />
                  <span className="truncate">{s}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        {/* Appareils */}
        <div className="space-y-1">
          <span className="block text-xs text-slate-400">Appareils</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className={`${champ} w-56 flex items-center justify-between`}>
                <span className="truncate">{deviceIds.length === 0 ? `Tous (${appareilsSite.length})` : `${deviceIds.length} sélectionné${deviceIds.length > 1 ? 's' : ''}`}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2 bg-[#1a1d2e] border-white/20 max-h-96 overflow-y-auto">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
                <Input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un appareil"
                  className="h-8 pl-7 bg-white/5 border-white/20 text-white text-xs" />
              </div>
              <button className="text-xs text-violet-300 hover:text-white mb-1" onClick={() => setDeviceIds([])}>Tous les appareils</button>
              {parFamille.map(([cle, liste], i) => {
                const [siteGroupe, fam] = cle.split('|');
                const nouveauSite = siteGroupe && siteGroupe !== parFamille[i - 1]?.[0].split('|')[0];
                const ids = liste.map(d => d.device_id);
                const tous = ids.every(id => deviceIds.includes(id));
                return (
                  <div key={cle} className="mb-2">
                    {nouveauSite && <p className="text-xs font-semibold text-violet-300 mt-2 mb-1">{siteGroupe}</p>}
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                      <input type="checkbox" className="accent-violet-500" checked={tous} onChange={() => basculerFamille(ids, !tous)} />
                      {LIBELLE_FAMILLE[fam] ?? fam} ({liste.length})
                    </label>
                    {liste.map(d => (
                      <label key={d.device_id} className="flex items-center gap-2 pl-5 text-xs text-slate-400 cursor-pointer">
                        <input type="checkbox" className="accent-violet-500" checked={deviceIds.includes(d.device_id)} onChange={() => basculer(d.device_id)} />
                        <span className="truncate">{d.name}</span>
                        {d.room && <span className="ml-auto text-slate-600 truncate">{d.room}</span>}
                      </label>
                    ))}
                  </div>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>

        {/* Période */}
        <div className="space-y-1">
          <span className="block text-xs text-slate-400">Période</span>
          <div className="flex items-center gap-1">
            {PERIODES.map(p => (
              <button key={p.cle} onClick={() => choisirPeriode(p.cle)}
                className={`h-8 px-2 rounded-md text-xs border ${periode === p.cle ? 'bg-violet-600/40 border-violet-500/50 text-white' : 'bg-white/5 border-white/20 text-slate-300 hover:text-white'}`}>
                {p.libelle}
              </button>
            ))}
            <input type="date" value={dateDebut} onChange={e => { setDateDebut(e.target.value); setPeriode('perso'); }} className={`${champ} w-36`} />
            <span className="text-slate-500 text-xs">→</span>
            <input type="date" value={dateFin} onChange={e => { setDateFin(e.target.value); setPeriode('perso'); }} className={`${champ} w-36`} />
          </div>
        </div>

        {/* Plage horaire */}
        <div className="space-y-1">
          <span className="block text-xs text-slate-400">Heures (chaque jour)</span>
          <div className="flex items-center gap-1">
            <select value={heureDebut} onChange={e => setHeureDebut(Number(e.target.value))} className={`${champ} w-20`}>
              {heures.map(h => <option key={h} value={h} className="bg-[#1a1d2e]">{String(h).padStart(2, '0')}h</option>)}
            </select>
            <span className="text-slate-500 text-xs">→</span>
            <select value={heureFin} onChange={e => setHeureFin(Number(e.target.value))} className={`${champ} w-20`}>
              {heures.map(h => <option key={h} value={h} className="bg-[#1a1d2e]">{String(h).padStart(2, '0')}h</option>)}
            </select>
          </div>
        </div>

        <Button onClick={analyser} disabled={chargement} className="h-8 bg-violet-600 hover:bg-violet-500 text-white gap-1">
          {chargement ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart2 className="h-3.5 w-3.5" />} Analyser
        </Button>

        {/* Avancé */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-8 px-2 text-xs text-slate-400 hover:text-white flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> Avancé</button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 bg-[#1a1d2e] border-white/20 space-y-3 text-xs text-slate-300">
            <label className="block space-y-1">
              <span className="text-slate-400">Granularité</span>
              <select value={granularite} onChange={e => setGranularite(e.target.value as typeof granularite)} className={`${champ} w-full`}>
                <option value="auto" className="bg-[#1a1d2e]">Automatique ({granulariteEffective})</option>
                <option value="horaire" className="bg-[#1a1d2e]">Horaire</option>
                <option value="minute" className="bg-[#1a1d2e]">Minute (relevés bruts)</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-slate-400">Limite de relevés</span>
              <select value={limit ?? ''} onChange={e => setLimit(e.target.value ? Number(e.target.value) : undefined)} className={`${champ} w-full`}>
                <option value="" className="bg-[#1a1d2e]">Aucune (toute la période)</option>
                {[10_000, 50_000, 100_000].map(n => <option key={n} value={n} className="bg-[#1a1d2e]">{n.toLocaleString('fr-FR')}</option>)}
              </select>
            </label>
            <p className="text-slate-500">Les colonnes chargées s'adaptent automatiquement aux appareils (énergie, ambiance, état).</p>
          </PopoverContent>
        </Popover>

        {resume && !chargement && <span className="text-xs text-slate-400 self-center">{resume}</span>}
        {erreur && <span className="text-xs text-red-400 self-center">{erreur}</span>}
      </div>

    </div>
  );
}
