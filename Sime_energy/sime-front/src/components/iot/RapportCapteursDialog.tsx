// ============================================================
// IOT — Rapport quand rien n'est de l'énergie : ambiance, météo, états,
// grandeurs d'un fichier. Avec de l'énergie, c'est la fenêtre de la Courbe de
// charge qui porte aussi les capteurs (ProfilChargeTab).
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { fetchCapteursHoraire, fetchEtatsAppareils, type EtatAppareil, type LigneCapteur, type PerimetreRapport } from '@/lib/iot-rapport-service';
import { construireCapteurs, lignesCapteursDepuisFichier } from '@/services/iotRapportCapteurs';
import { TRANCHES_DEFAUT } from '@/services/iotRapportAnalyses';
import { exporterRapportCapteursExcel } from '@/services/iotRapportExcel';
import { exporterRapportCapteursPdf } from '@/services/iotRapportPdf';
import { BarreAvancement, laisserAfficher, type Avancement } from './BarreAvancement';
import type { ShellyRow } from './shared';

export function RapportCapteursDialog({ ouvert, onFermer, perimetre, lignesFichier, nomFichier }: {
  ouvert: boolean;
  onFermer: () => void;
  perimetre: PerimetreRapport | null;
  /** Lignes d'un fichier importé, quand on n'a pas de périmètre en base. */
  lignesFichier: ShellyRow[] | null;
  nomFichier: string;
}) {
  const { user } = useAuth();
  const [lignes, setLignes] = useState<LigneCapteur[] | null>(null);
  const [etats, setEtats] = useState<EtatAppareil[] | null>(null);
  const [manque, setManque] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [aRetenir, setARetenir] = useState('');
  const [aVerifier, setAVerifier] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [avancement, setAvancement] = useState<Avancement | null>(null);
  const [essai, setEssai] = useState(0);
  const cle = perimetre ? JSON.stringify(perimetre) : '';

  useEffect(() => {
    if (!ouvert) return;
    if (!perimetre) {
      setLignes(lignesFichier ? lignesCapteursDepuisFichier(lignesFichier) : []);
      setEtats([]);
      setManque(null);
      return;
    }
    let annule = false;
    setChargement(true);
    setLignes(null);
    setManque(null);
    setAvancement({ libelle: 'Lecture des grandeurs…', pct: null });
    fetchCapteursHoraire(perimetre)
      .then(async l => {
        if (annule) return;
        setLignes(l);
        const ids = [...new Set(l.filter(x => x.famille === 'ETAT').map(x => x.deviceId))];
        let fait = 0;
        const annoncer = () => { if (!annule) setAvancement({ libelle: `Lecture des capteurs d'état : ${fait} sur ${ids.length}`, pct: ids.length ? (fait / ids.length) * 100 : 100 }); };
        annoncer();
        const res = await fetchEtatsAppareils(perimetre, ids, () => { fait++; annoncer(); });
        if (annule) return;
        setEtats(res.etats);
        if (res.echecs > 0) setManque(`états de ${res.echecs} capteur${res.echecs > 1 ? 's' : ''}`);
      })
      .catch(() => { if (!annule) { setLignes([]); setEtats(null); setManque('capteurs'); } })
      .finally(() => { if (!annule) { setChargement(false); setAvancement(null); } });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, cle, essai]);

  const capteurs = useMemo(() => (lignes ? construireCapteurs({
    lignes, etats, tranches: TRANCHES_DEFAUT,
    debut: perimetre?.dateDebut, fin: perimetre?.dateFin, heureDebut: perimetre?.heureDebut, heureFin: perimetre?.heureFin,
  }) : null), [lignes, etats, perimetre]);

  const exporter = async (format: 'excel' | 'pdf') => {
    if (!capteurs) return;
    setEnCours(true);
    setErreur(null);
    setAvancement({ libelle: format === 'excel' ? 'Construction du fichier Excel…' : 'Construction du fichier PDF…', pct: null });
    await laisserAfficher();
    try {
      const fr = (iso: string) => iso.split('-').reverse().join('/');
      const sites = perimetre?.sites ?? [];
      const nomSites = sites.length === 1 ? sites[0] : sites.length ? `${sites.length} sites` : nomFichier || 'fichier';
      const meta = user?.user_metadata ?? {};
      const auteur = (meta.first_name && meta.last_name ? `${meta.first_name} ${meta.last_name}` : (user?.email ?? 'utilisateur')).replace(/\s+/g, ' ').trim();
      const entete = {
        titre: `Capteurs — ${nomSites}`,
        sousTitre: perimetre ? `du ${fr(perimetre.dateDebut)} au ${fr(perimetre.dateFin)}` : nomFichier,
        perimetre: [
          ['Source', perimetre ? 'Base de données Shelly, moyennes horaires' : 'Fichier importé'],
          ...(sites.length ? [['Site(s)', sites.join(', ')] as [string, string]] : []),
          ['Rapport établi par', `${auteur} — ${new Date().toLocaleString('fr-FR')}`],
        ] as [string, string][],
        aRetenir: aRetenir.trim(), aVerifier: aVerifier.trim(),
      };
      const nom = ['Rapport_capteurs', nomSites, perimetre?.dateDebut, perimetre?.dateFin].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_-]+/gu, '_');
      if (format === 'excel') await exporterRapportCapteursExcel(capteurs, entete, `${nom}.xlsx`);
      else exporterRapportCapteursPdf(capteurs, entete, `${nom}.pdf`);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
      setAvancement(null);
    }
  };

  return (
    <Dialog open={ouvert} onOpenChange={o => { if (!o) onFermer(); }}>
      <DialogContent className="max-w-2xl bg-[#0f111a] border-white/10 text-slate-100">
        <DialogHeader><DialogTitle>Rapport — capteurs</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm max-h-[60vh] overflow-y-auto pr-1">
          {!chargement && lignes && !capteurs && <p className="text-xs text-amber-300">Aucune mesure de capteur sur ces données : rien à mettre dans un rapport.</p>}
          {!chargement && manque && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 min-w-48 text-xs text-amber-300">Non lu : {manque}. La lecture a été trop longue, souvent parce que plusieurs calculs tournent en même temps. Le reste du rapport est complet.</p>
              <Button size="sm" variant="outline" className="h-7 text-xs border-white/20 text-slate-200" onClick={() => setEssai(n => n + 1)}>Réessayer</Button>
            </div>
          )}
          {capteurs && (
            <>
              <p className="text-xs text-slate-300">Sur ce périmètre : {capteurs.resume}.</p>
              <div>
                <p className="text-xs font-medium text-slate-300 mb-1">Constats calculés</p>
                {capteurs.constats.length === 0 && <p className="text-xs text-slate-400">Données insuffisantes pour un constat sur cette période.</p>}
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">{capteurs.constats.map((p, i) => <li key={i}>{p}</li>)}</ul>
              </div>
              {capteurs.aVerifierAuto.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-300 mb-1">À vérifier, détecté automatiquement</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">{capteurs.aVerifierAuto.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              <div>
                <Label htmlFor="retenir-capteurs" className="text-xs text-slate-300">Ce qu'il faut retenir, selon vous (facultatif)</Label>
                <Textarea id="retenir-capteurs" value={aRetenir} onChange={e => setARetenir(e.target.value)} className="mt-1 min-h-16 bg-white/5 border-white/15 text-slate-100 text-xs" />
              </div>
              <div>
                <Label htmlFor="verifier-capteurs" className="text-xs text-slate-300">À vérifier sur site, selon vous (facultatif)</Label>
                <Textarea id="verifier-capteurs" value={aVerifier} onChange={e => setAVerifier(e.target.value)} className="mt-1 min-h-16 bg-white/5 border-white/15 text-slate-100 text-xs" />
              </div>
            </>
          )}
          {erreur && <p className="text-xs text-red-400">{erreur}</p>}
        </div>
        {avancement && <BarreAvancement avancement={avancement} />}
        <DialogFooter>
          <Button variant="ghost" className="text-slate-300" onClick={onFermer}>Annuler</Button>
          <Button variant="outline" onClick={() => exporter('pdf')} disabled={enCours || chargement || !capteurs} className="border-white/20 text-slate-200">
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button onClick={() => exporter('excel')} disabled={enCours || chargement || !capteurs} className="bg-blue-600 hover:bg-blue-500">
            <Download className="h-4 w-4 mr-1" /> {enCours ? 'Préparation…' : 'Excel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
