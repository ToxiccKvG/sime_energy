import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { IotTabProps } from './shared';
import type { SourceCode } from '@/lib/iot-sources-service';
import {
  apercuFichier, normaliserFichier, validerLignes, stockerDonnees,
  getMappingCapteur, type CapteurConnu, type AperçuFichier, type RapportValidation,
} from '@/services/iotImportService';

const CAPTEURS: { id: CapteurConnu; label: string }[] = [
  { id: 'Shelly_3EM',    label: 'Shelly 3EM' },
  { id: 'SMA_Sunny',     label: 'SMA Sunny Portal' },
  { id: 'Voltcraft',     label: 'Voltcraft' },
  { id: 'Fluke',         label: 'Fluke' },
  { id: 'DENT_Elite_Pro',label: 'DENT Elite Pro' },
  { id: 'Sentinel_8',    label: 'Sentinel 8' },
  { id: 'Libre',         label: 'Fichier libre (mapping manuel)' },
];

const SOURCE_CODES: SourceCode[] = ['M1', 'M2', 'M3', 'M4', 'M5'];

type Step = 1 | 2 | 3 | 4 | 5;

export function UploadTab({ organizationId, userId, siteId }: IotTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [step, setStep]         = useState<Step>(1);
  const [loading, setLoading]   = useState(false);

  // Étape 1 — Aperçu
  const [apercu, setApercu]     = useState<AperçuFichier | null>(null);
  const [capteur, setCapteur]   = useState<CapteurConnu>('Shelly_3EM');

  // Étape 2 — Mapping
  const [colTimestamp, setColTimestamp]   = useState('');
  const [colPuissance, setColPuissance]   = useState('');
  const [colPuissanceA, setColPuissanceA] = useState('');
  const [colPuissanceB, setColPuissanceB] = useState('');
  const [colPuissanceC, setColPuissanceC] = useState('');
  const [colEnergie, setColEnergie]       = useState('');
  const [unitePuissance, setUnitePuissance] = useState<'W' | 'kW'>('W');
  const [uniteEnergie, setUniteEnergie]     = useState<'Wh' | 'kWh'>('Wh');
  const [facteur, setFacteur]               = useState('1');

  // Étape 3 — Qualification
  const [sourceCode, setSourceCode] = useState<SourceCode>('M1');
  const [deviceId, setDeviceId]     = useState('import_csv');

  // Étape 4 — Validation
  const [rapport, setRapport]   = useState<RapportValidation | null>(null);
  const [lignes, setLignes]     = useState<Awaited<ReturnType<typeof normaliserFichier>>>([]);

  // Étape 5 — Résultat
  const [resultat, setResultat] = useState<{ inserted: number; skipped: number } | null>(null);

  function reset() {
    setFile(null); setStep(1); setApercu(null); setRapport(null); setLignes([]); setResultat(null);
  }

  async function handleFileDrop(f: File) {
    setFile(f); setLoading(true);
    try {
      const ap = await apercuFichier(f);
      setApercu(ap);
      if (ap.capteur_detecte) {
        setCapteur(ap.capteur_detecte);
        const m = getMappingCapteur(ap.capteur_detecte);
        setColTimestamp(m.timestamp ?? '');
        setColPuissance(m.puissance ?? '');
        setColPuissanceA(m.puissance_a ?? '');
        setColPuissanceB(m.puissance_b ?? '');
        setColPuissanceC(m.puissance_c ?? '');
        setColEnergie(m.energie ?? '');
        setUnitePuissance((m.unite_puissance as 'W' | 'kW') ?? 'W');
        setUniteEnergie((m.unite_energie as 'Wh' | 'kWh') ?? 'Wh');
      }
      setStep(2);
    } catch { toast.error('Erreur lecture fichier'); }
    finally { setLoading(false); }
  }

  async function handleMapping() {
    if (!file || !colTimestamp) return;
    setLoading(true);
    try {
      const norm = await normaliserFichier(file, {
        timestamp: colTimestamp, puissance: colPuissance || undefined,
        puissance_a: colPuissanceA || undefined, puissance_b: colPuissanceB || undefined, puissance_c: colPuissanceC || undefined,
        energie: colEnergie || undefined,
        unite_puissance: unitePuissance, unite_energie: uniteEnergie,
        facteur_multiplicateur: parseFloat(facteur) || 1,
      });
      setLignes(norm);
      setStep(3);
    } catch { toast.error('Erreur normalisation'); }
    finally { setLoading(false); }
  }

  async function handleQualification() {
    if (!siteId) { toast.error('Aucun site sélectionné'); return; }
    const r = validerLignes(lignes);
    setRapport(r);
    setStep(4);
  }

  async function handleStockage() {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await stockerDonnees(lignes, { organization_id: organizationId, iot_site_id: siteId, source_code: sourceCode, device_id: deviceId });
      setResultat(res);
      setStep(5);
      toast.success(`${res.inserted} lignes importées`);
    } catch (e: any) { toast.error(e.message ?? 'Erreur stockage'); }
    finally { setLoading(false); }
  }

  const STEPS = ['Aperçu', 'Mapping', 'Qualification', 'Validation', 'Stockage'];

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => {
          const num = (i + 1) as Step;
          const done = step > num;
          const active = step === num;
          return (
            <div key={s} className="flex items-center gap-1">
              <div className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                done ? 'bg-green-900/40 text-green-300' : active ? 'bg-blue-900/40 text-blue-300 ring-1 ring-blue-500' : 'bg-white/5 text-slate-500'}`}>
                {done ? <CheckCircle2 size={12}/> : <span>{num}</span>}
                {s}
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={12} className="text-slate-600"/>}
            </div>
          );
        })}
      </div>

      {/* Étape 1 — Drop zone */}
      {step === 1 && (
        <div
          className="rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-10 text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-950/20 transition-all"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
        >
          <input ref={inputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls,.ods,.json,.tsv,.txt"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }}/>
          {loading ? <Loader2 size={32} className="animate-spin mx-auto text-blue-400"/> : <Upload size={32} className="mx-auto text-slate-500"/>}
          <div className="mt-3 text-sm text-slate-300">Glissez un fichier ou cliquez pour sélectionner</div>
          <div className="mt-1 text-xs text-slate-500">CSV · XLSX · ODS · JSON · TSV · TXT — max 50 Mo</div>
        </div>
      )}

      {/* Étape 2 — Mapping */}
      {step === 2 && apercu && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-slate-400"/>
              <span className="text-sm text-slate-300">{file?.name}</span>
              {apercu.capteur_detecte && (
                <span className="rounded-full bg-green-900/40 text-green-300 text-[10px] px-2 py-0.5">
                  Capteur détecté : {apercu.capteur_detecte}
                </span>
              )}
            </div>
            <button onClick={reset} className="text-slate-500 hover:text-slate-300"><X size={16}/></button>
          </div>

          {/* Preview 5 premières lignes */}
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr>{apercu.colonnes.slice(0, 8).map(c => <th key={c} className="px-3 py-2 text-left text-slate-400 bg-white/5 font-medium whitespace-nowrap">{c}</th>)}</tr>
              </thead>
              <tbody>
                {apercu.lignes_preview.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-t border-white/5">
                    {apercu.colonnes.slice(0, 8).map(c => <td key={c} className="px-3 py-1.5 text-slate-300 whitespace-nowrap">{row[c]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: 'Colonne Timestamp *', val: colTimestamp, set: setColTimestamp },
              { label: 'Colonne Puissance totale', val: colPuissance, set: setColPuissance },
              { label: 'Colonne Phase A', val: colPuissanceA, set: setColPuissanceA },
              { label: 'Colonne Phase B', val: colPuissanceB, set: setColPuissanceB },
              { label: 'Colonne Phase C', val: colPuissanceC, set: setColPuissanceC },
              { label: 'Colonne Énergie', val: colEnergie, set: setColEnergie },
            ].map(({ label, val, set }) => (
              <div key={label}>
                <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                <Select value={val} onValueChange={set}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-slate-200 text-xs h-8"><SelectValue placeholder="—"/></SelectTrigger>
                  <SelectContent>{['', ...apercu.colonnes].map(c => <SelectItem key={c} value={c}>{c || '—'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Unité puissance</label>
              <Select value={unitePuissance} onValueChange={v => setUnitePuissance(v as 'W' | 'kW')}>
                <SelectTrigger className="bg-white/5 border-white/10 text-slate-200 text-xs h-8"><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="W">W</SelectItem><SelectItem value="kW">kW</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Unité énergie</label>
              <Select value={uniteEnergie} onValueChange={v => setUniteEnergie(v as 'Wh' | 'kWh')}>
                <SelectTrigger className="bg-white/5 border-white/10 text-slate-200 text-xs h-8"><SelectValue/></SelectTrigger>
                <SelectContent><SelectItem value="Wh">Wh</SelectItem><SelectItem value="kWh">kWh</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Facteur multiplicateur</label>
              <input type="number" step="0.001" value={facteur} onChange={e => setFacteur(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 h-8"/>
            </div>
          </div>
          <Button onClick={handleMapping} disabled={!colTimestamp || loading} className="bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? <Loader2 size={14} className="animate-spin mr-2"/> : null} Normaliser → Étape 3
          </Button>
        </div>
      )}

      {/* Étape 3 — Qualification */}
      {step === 3 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="text-sm font-medium text-slate-200">{lignes.length.toLocaleString()} lignes normalisées</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Point de mesure</label>
              <Select value={sourceCode} onValueChange={v => setSourceCode(v as SourceCode)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-slate-200"><SelectValue/></SelectTrigger>
                <SelectContent>{SOURCE_CODES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Identifiant appareil</label>
              <input value={deviceId} onChange={e => setDeviceId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 font-mono"/>
            </div>
          </div>
          <Button onClick={handleQualification} className="bg-blue-600 hover:bg-blue-700 text-white">
            Valider → Étape 4
          </Button>
        </div>
      )}

      {/* Étape 4 — Validation */}
      {step === 4 && rapport && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
          <div className="text-sm font-medium text-slate-200">Rapport de validation</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Lignes', val: rapport.nb_lignes.toLocaleString(), color: 'text-slate-200' },
              { label: 'Aberrants', val: rapport.nb_aberrants, color: rapport.nb_aberrants > 0 ? 'text-red-400' : 'text-green-400' },
              { label: 'Doublons', val: rapport.nb_doublons, color: rapport.nb_doublons > 0 ? 'text-amber-400' : 'text-green-400' },
              { label: 'Trous', val: rapport.nb_trous, color: 'text-slate-300' },
            ].map(({ label, val, color }) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
                <div className={`text-xl font-bold ${color}`}>{val}</div>
                <div className="text-xs text-slate-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          {rapport.plage_dates && (
            <div className="text-xs text-slate-400">
              Période : <span className="text-slate-300">{rapport.plage_dates.debut.slice(0,10)}</span> → <span className="text-slate-300">{rapport.plage_dates.fin.slice(0,10)}</span>
            </div>
          )}
          {rapport.alertes.map(a => (
            <div key={a} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-300">
              <AlertTriangle size={14}/> {a}
            </div>
          ))}
          <Button onClick={handleStockage} disabled={loading} className="bg-green-700 hover:bg-green-600 text-white">
            {loading ? <Loader2 size={14} className="animate-spin mr-2"/> : null} Importer dans Supabase → Étape 5
          </Button>
        </div>
      )}

      {/* Étape 5 — Résultat */}
      {step === 5 && resultat && (
        <div className="rounded-xl border border-green-500/30 bg-green-950/20 p-6 text-center space-y-3">
          <CheckCircle2 size={40} className="text-green-400 mx-auto"/>
          <div className="text-lg font-semibold text-green-300">{resultat.inserted.toLocaleString()} lignes importées</div>
          {resultat.skipped > 0 && <div className="text-sm text-slate-400">{resultat.skipped} ligne(s) ignorée(s) (doublons ou aberrants)</div>}
          <div className="text-xs text-slate-400">Les données sont disponibles dans tous les onglets d'analyse.</div>
          <Button onClick={reset} variant="outline" className="border-white/10 text-slate-300 hover:bg-white/10 mt-2">
            Importer un autre fichier
          </Button>
        </div>
      )}
    </div>
  );
}
