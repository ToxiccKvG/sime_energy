// ============================================================
// IOT — Nettoyage : contrôles du moteur de qualité + recettes
//
// Pour des données chargées depuis Supabase, le Nettoyage ne calcule plus
// rien lui-même : il demande à fn_qualite les signalements sur le même
// périmètre que les lignes, et l'utilisateur choisit, règle par règle, ce
// qui est EXCLU des calculs. Les lignes ne sont jamais réécrites ; ce qu'on
// enregistre est une recette (chargement + règles exclues), rejouable.
// ============================================================

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { ShieldCheck, Save, FolderOpen, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import type { ShellyRow, JourFerie } from './shared';
import { fetchRegles, fetchSignalements, versionRegles, type RegleQualite, type Signalement, type PerimetreQualite } from '@/lib/iot-qualite-service';
import { exporterDonneesSupabase, type SupabaseExportOptions } from '@/lib/iot-supabase-service';
import { profilMiToShellyRow, cleJour } from '@/lib/iot-profil-engine';
import { fetchRecettes, creerRecette, supprimerRecette, type Recette } from '@/lib/iot-recette-service';

const t = (v: unknown) => (v instanceof Date ? v : new Date(v as string)).getTime();

/** Périmètre du moteur déduit des lignes elles-mêmes : exactement ce qui est affiché. */
function perimetreDesLignes(rows: ShellyRow[]): PerimetreQualite | null {
  const avecId = rows.filter(r => r.deviceId);
  if (avecId.length === 0) return null;
  const dates = avecId.map(r => cleJour(r.date)).sort();
  return {
    dateDebut: dates[0],
    dateFin: dates[dates.length - 1],
    heureDebut: 0,
    heureFin: 23,
    sites: [...new Set(avecId.map(r => r.deviceLocation).filter((s): s is string => !!s))],
    deviceIds: [...new Set(avecId.map(r => r.deviceId as string))],
  };
}

export interface ExclusionsQualite {
  /** Lignes exclues des calculs → codes des règles en cause */
  parLigne: Map<ShellyRow, string[]>;
  kwh: number;
}

export function useQualiteMoteur(rows: ShellyRow[], actif: boolean, reglesInitiales: string[] | null) {
  const perimetre = useMemo(() => (actif ? perimetreDesLignes(rows) : null), [rows, actif]);
  const cle = perimetre ? JSON.stringify(perimetre) : '';
  const [signalements, setSignalements] = useState<Signalement[]>([]);
  const [regles, setRegles] = useState<RegleQualite[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exclues, setExclues] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!perimetre) { setSignalements([]); return; }
    let annule = false;
    setChargement(true);
    setErreur(null);
    Promise.all([fetchSignalements(perimetre), fetchRegles()])
      .then(([sg, rg]) => {
        if (annule) return;
        setSignalements(sg);
        setRegles(rg);
        // Par défaut : on exclut ce que la règle met en quarantaine (ou un
        // doublon) À L'HEURE — mesure hors affectation, figée, impossible. Une
        // règle évaluée à la journée (Journée incomplète) concerne les
        // statistiques journalières, pas les totaux : elle n'est pas exclue
        // d'office. Un simple signalement reste dans les calculs.
        const aLHeure = new Set(sg.filter(x => x.niveau === 'heure').map(x => x.regle));
        setExclues(new Set(reglesInitiales
          ?? rg.filter(r => (r.action === 'quarantaine' || r.action === 'doublon') && aLHeure.has(r.code)).map(r => r.code)));
      })
      .catch(e => { if (!annule) setErreur(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  // Lignes couvertes par une plage d'une règle exclue (appareil, ou site
  // pour une règle de site comme la coupure)
  const exclusions = useMemo<ExclusionsQualite>(() => {
    const parLigne = new Map<ShellyRow, string[]>();
    let kwh = 0;
    const actives = signalements.filter(sg => exclues.has(sg.regle) && sg.niveau !== 'appareil');
    if (actives.length === 0) return { parLigne, kwh };
    const parAppareil = new Map<string, Signalement[]>();
    const parSite = new Map<string, Signalement[]>();
    for (const sg of actives) {
      const m = sg.device_id ? parAppareil : parSite;
      const k = sg.device_id ?? sg.site;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(sg);
    }
    for (const r of rows) {
      const ts = t(r.date);
      const candidats = [
        ...(r.deviceId ? parAppareil.get(r.deviceId) ?? [] : []),
        ...(r.deviceLocation ? parSite.get(r.deviceLocation) ?? [] : []),
      ];
      const codes = candidats.filter(sg => ts >= t(sg.debut) && ts < t(sg.fin)).map(sg => sg.regle);
      if (codes.length) {
        parLigne.set(r, [...new Set(codes)]);
        kwh += r.kwhTotal || 0;
      }
    }
    return { parLigne, kwh };
  }, [rows, signalements, exclues]);

  const basculer = (code: string) =>
    setExclues(prev => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  return { perimetre, signalements, regles, chargement, erreur, exclues, basculer, exclusions, version: versionRegles(regles) };
}

const COULEUR: Record<string, string> = {
  quarantaine: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  signaler: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  doublon: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

export function QualiteMoteurPanel({ q, nbLignes }: {
  q: ReturnType<typeof useQualiteMoteur>;
  nbLignes: number;
}) {
  const ordre = new Map(q.regles.map(r => [r.code, r]));
  const groupes = useMemo(() => {
    const m = new Map<string, { plages: Signalement[]; heures: number; kwh: number; qui: Set<string> }>();
    for (const sg of q.signalements) {
      const g = m.get(sg.regle) ?? { plages: [], heures: 0, kwh: 0, qui: new Set<string>() };
      g.plages.push(sg); g.heures += sg.nb_heures ?? 0; g.kwh += sg.kwh ?? 0;
      g.qui.add(sg.nom ?? (sg.device_id ? sg.device_id : `site ${sg.site}`));
      m.set(sg.regle, g);
    }
    return [...m.entries()].sort(([a], [b]) => (ordre.get(a)?.ordre ?? 999) - (ordre.get(b)?.ordre ?? 999));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.signalements, q.regles]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="text-white text-sm font-medium">Contrôles qualité</span>
          <span className="text-slate-500 text-xs">
            {q.chargement ? 'analyse en cours…'
              : `${groupes.length} règle${groupes.length > 1 ? 's' : ''} déclenchée${groupes.length > 1 ? 's' : ''} · ${q.exclusions.parLigne.size.toLocaleString('fr-FR')} / ${nbLignes.toLocaleString('fr-FR')} lignes exclues des calculs (${q.exclusions.kwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh)`}
          </span>
        </div>
        {q.version && <span className="text-slate-500 text-xs">Règles en vigueur au {new Date(q.version).toLocaleDateString('fr-FR')}</span>}
      </div>
      <p className="px-4 pt-3 text-xs text-slate-500">
        Les mesures ne sont jamais modifiées ni supprimées : cocher une règle exclut ses plages des calculs, elles restent
        visibles (barrées) dans le tableau. Par défaut, seules les quarantaines à l'heure (mesure hors affectation, figée,
        impossible) sont exclues ; les signalements et les règles à la journée restent dans les calculs.
      </p>
      {q.erreur && <p className="px-4 pt-2 text-xs text-red-400">Moteur de qualité indisponible : {q.erreur}</p>}
      {!q.chargement && groupes.length === 0 && !q.erreur && (
        <p className="px-4 py-3 text-xs text-emerald-300">Aucune règle déclenchée sur ce périmètre.</p>
      )}
      <div className="p-3 space-y-2">
        {groupes.map(([code, g]) => {
          const rg = ordre.get(code);
          const qui = [...g.qui];
          return (
            <label key={code} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-amber-500" checked={q.exclues.has(code)} onChange={() => q.basculer(code)}
                disabled={g.plages.every(p => p.niveau === 'appareil')} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white font-medium">{rg?.libelle ?? code}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[0.625rem] ${COULEUR[rg?.action ?? 'signaler']}`}>{rg?.action ?? 'signaler'}</span>
                  <span className="text-slate-400">
                    {g.plages.length} plage{g.plages.length > 1 ? 's' : ''}{g.heures > 0 && ` · ${g.heures} h`}
                    {g.kwh > 0.005 && ` · ${g.kwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`}
                    {` · ${qui.slice(0, 4).join(', ')}${qui.length > 4 ? ` +${qui.length - 4}` : ''}`}
                  </span>
                </div>
                {rg?.explication && <p className="text-slate-500 mt-1">{rg.explication}</p>}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Recettes : enregistrer / rouvrir ──────────────────────────
/** Nom proposé pour un nettoyage : « Ma Maison · 12/10 → 19/10 ». */
export function nomChargement(ch: SupabaseExportOptions): string {
  const jm = (d?: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
  const periode = ch.dateDebut ? `${jm(ch.dateDebut)} → ${jm(ch.dateFin)}` : '';
  return [ch.site ?? 'Tous les sites', periode].filter(Boolean).join(' · ');
}

export interface RecettesPanelHandle { enregistrer: () => void }

export const RecettesPanel = forwardRef<RecettesPanelHandle, {
  organizationId: string | null;
  chargement: SupabaseExportOptions | null;
  reglesExclues: Set<string>;
  version: string | null;
  joursFerier: JourFerie[];
  onOuvrir: (rows: ShellyRow[], chargement: SupabaseExportOptions, reglesExclues: string[]) => void;
}>(function RecettesPanel({ organizationId, chargement, reglesExclues, version, joursFerier, onOuvrir }, ref) {
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [nom, setNom] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);

  // Nom pré-rempli à chaque nouveau chargement : un clic suffit pour stocker
  useEffect(() => { setNom(chargement ? nomChargement(chargement) : ''); }, [chargement]);

  const recharger = () => {
    if (!organizationId) return;
    fetchRecettes(organizationId).then(setRecettes).catch(() => setRecettes([]));
  };
  useEffect(recharger, [organizationId]);

  const enregistrer = async () => {
    if (!organizationId || !chargement || !nom.trim()) return;
    setOccupe('enregistrer');
    try {
      await creerRecette({ organizationId, nom: nom.trim(), chargement, reglesExclues: [...reglesExclues], reglesAu: version });
      recharger();
      toast({ title: 'Nettoyage enregistré', description: 'Visible par toute l\'organisation. Rouvert, il relit les mesures et réapplique les mêmes règles.' });
    } catch (e) {
      toast({ title: 'Enregistrement impossible', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setOccupe(null); }
  };

  useImperativeHandle(ref, () => ({ enregistrer }));

  const ouvrir = async (r: Recette) => {
    setOccupe(r.id);
    try {
      const res = await exporterDonneesSupabase(r.chargement);
      if (res.erreur) throw new Error(res.erreur);
      const rows = res.rows.map(x => profilMiToShellyRow(x, joursFerier)).filter((x): x is ShellyRow => x !== null);
      onOuvrir(rows, r.chargement, r.regles_exclues);
    } catch (e) {
      toast({ title: 'Ouverture impossible', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setOccupe(null); }
  };

  const supprimer = async (r: Recette) => {
    setOccupe(r.id);
    try { await supprimerRecette(r.id); recharger(); }
    catch (e) { toast({ title: 'Suppression impossible', description: e instanceof Error ? e.message : String(e), variant: 'destructive' }); }
    finally { setOccupe(null); }
  };

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm text-white font-medium"><FolderOpen className="h-4 w-4 text-violet-400" /> Nettoyages enregistrés</div>
      {chargement && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom du nettoyage (ex. Ma Maison — octobre, quarantaines exclues)"
            className="h-8 flex-1 min-w-[16rem] bg-white/5 border-white/20 text-white text-xs" />
          <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-500 text-white gap-1" disabled={!nom.trim() || occupe !== null} onClick={enregistrer}>
            <Save className="h-3.5 w-3.5" /> Enregistrer et stocker
          </Button>
        </div>
      )}
      {recettes.length === 0
        ? <p className="text-xs text-slate-500">Aucun nettoyage enregistré dans l'organisation.</p>
        : (
          <ul className="divide-y divide-white/5 text-xs">
            {recettes.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="text-slate-200 font-medium">{r.nom}</span>
                <span className="text-slate-500">
                  {[r.chargement.site ?? 'tous sites', r.chargement.dateDebut && `${r.chargement.dateDebut} → ${r.chargement.dateFin}`, r.chargement.granularite].filter(Boolean).join(' · ')}
                  {` · ${r.regles_exclues.length} règle${r.regles_exclues.length > 1 ? 's' : ''} exclue${r.regles_exclues.length > 1 ? 's' : ''} · ${new Date(r.cree_le).toLocaleDateString('fr-FR')}`}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-violet-300 hover:text-white gap-1" disabled={occupe !== null} onClick={() => ouvrir(r)}>
                    {occupe === r.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <FolderOpen className="h-3 w-3" />} Rouvrir
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500 hover:text-red-400" disabled={occupe !== null} onClick={() => supprimer(r)} title="Supprimer ce nettoyage enregistré (les mesures ne sont pas touchées)">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
});

// ── Analyse : une ligne de qualité (remplace le « Rapport qualité » de 900 px) ──
export function QualiteLigne({ q, onVoir }: {
  q: ReturnType<typeof useQualiteMoteur>;
  onVoir: () => void;
}) {
  const regles = new Set(q.signalements.map(s => s.regle));
  const libelles = [...regles].map(c => q.regles.find(r => r.code === c)?.libelle ?? c);
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white/5 rounded-xl border border-white/10 px-3 py-2 text-xs">
      <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
      <span className="text-white font-medium">Qualité</span>
      <span className="text-slate-400">
        {q.chargement ? 'contrôles en cours…'
          : q.erreur ? `moteur indisponible : ${q.erreur}`
            : regles.size === 0 ? 'aucune règle déclenchée sur ce périmètre'
              : `${regles.size} règle${regles.size > 1 ? 's' : ''} déclenchée${regles.size > 1 ? 's' : ''} (${libelles.slice(0, 4).join(', ')}${libelles.length > 4 ? '…' : ''}) · ${q.signalements.length} plage${q.signalements.length > 1 ? 's' : ''}`}
        {q.version && ` · règles du ${new Date(q.version).toLocaleDateString('fr-FR')}`}
      </span>
      <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs text-emerald-300 hover:text-white" onClick={onVoir}>
        Voir et régler dans Nettoyage →
      </Button>
    </div>
  );
}
