// ============================================================
// IOT — Assistant de lecture d'un fichier hors formats Shelly
// Date (et heure séparée), ordre jour/mois, rôle et unité de chaque
// colonne, avec l'aperçu de ce que l'Analyse en tirera. Tout est
// proposé automatiquement (lib/iot-lecture-fichier.ts) et modifiable.
// ============================================================

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { JourFerie, LectureColonne, LectureFichier, RoleColonne } from './shared';
import { appliquerLecture } from '@/lib/iot-lecture-fichier';

const ROLES: { value: RoleColonne; label: string }[] = [
  { value: 'grandeur',  label: 'Grandeur mesurée' },
  { value: 'energie',   label: 'Énergie consommée' },
  { value: 'retour',    label: 'Énergie injectée' },
  { value: 'puissance', label: 'Puissance' },
  { value: 'ignorer',   label: 'Ne pas importer' },
];

const SELECT = 'h-8 rounded-md bg-white/5 border border-white/20 text-white text-xs px-2';

function fmtPas(sec: number | null): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h`;
  return `${Math.round(sec / 86400)} j`;
}
const fmtDate = (d?: Date) => d ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtNb = (n: number, dec = 1) => n.toLocaleString('fr-FR', { maximumFractionDigits: dec });

export function LectureFichierPanel({ columns, rows, lecture, onChange, joursFerier }: {
  columns: string[];
  rows: Record<string, unknown>[];
  lecture: LectureFichier;
  onChange: (l: LectureFichier) => void;
  joursFerier: JourFerie[];
}) {
  const [voirEcartees, setVoirEcartees] = useState(false);
  const resultat = useMemo(() => appliquerLecture(rows, lecture, joursFerier), [rows, lecture, joursFerier]);

  const majColonne = (col: string, patch: Partial<LectureColonne>) =>
    onChange({ ...lecture, colonnes: lecture.colonnes.map(c => c.col === col ? { ...c, ...patch, motif: patch.role && patch.role !== 'ignorer' ? undefined : c.motif } : c) });

  // Changer la colonne date : l'ancienne redevient une colonne ordinaire (écartée)
  const choisirDate = (champ: 'colDate' | 'colHeure', col: string) => {
    const pris = new Set([champ === 'colDate' ? col : lecture.colDate, champ === 'colHeure' ? col : lecture.colHeure].filter(Boolean));
    const connues = new Set(lecture.colonnes.map(c => c.col));
    const colonnes = [
      ...lecture.colonnes.filter(c => !pris.has(c.col)),
      ...columns.filter(c => !pris.has(c) && !connues.has(c))
        .map(c => ({ col: c, libelle: c, unite: '', role: 'ignorer' as RoleColonne, motif: 'date' })),
    ];
    onChange({ ...lecture, [champ]: col, colonnes });
  };

  const actives = lecture.colonnes.filter(c => c.role !== 'ignorer');
  const ecartees = lecture.colonnes.filter(c => c.role === 'ignorer');
  const premiers = rows.filter(r => r[lecture.colDate] !== null && r[lecture.colDate] !== undefined).slice(0, 3);
  const exemple = (c: string) => premiers.map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '')
    .map(v => v instanceof Date ? v.toLocaleString('fr-FR') : String(v)).join(' · ');

  const production = lecture.sens === 'production';
  const kwh = resultat.rows.reduce((s, r) => s + (production ? r.kwhRetourTotal : r.kwhTotal), 0);
  const kwhRetour = production ? 0 : resultat.rows.reduce((s, r) => s + r.kwhRetourTotal, 0);
  const parPhase = (['A', 'B', 'C'] as const).map(p => ({ p, kwh: resultat.rows.reduce((s, r) => s + (p === 'A' ? r.kwhA : p === 'B' ? r.kwhB : r.kwhC), 0) }));
  const aPhases = parPhase.some(x => x.kwh > 0);
  const aEnergie = lecture.colonnes.some(c => c.role === 'energie' || c.role === 'retour') || resultat.energieDeduite;
  const nbGrandeurs = lecture.colonnes.filter(c => c.role === 'grandeur').length;
  const ok = resultat.rows.length > 0;

  const ligneColonne = (c: LectureColonne) => (
    <tr key={c.col} className={`border-t border-white/5 ${c.role === 'ignorer' ? 'opacity-50' : ''}`}>
      <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap max-w-[12rem] truncate" title={c.col}>{c.col}</td>
      <td className="px-2 py-1.5">
        <select className={SELECT} value={c.role} onChange={e => majColonne(c.col, { role: e.target.value as RoleColonne })}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <Input value={c.libelle} disabled={c.role === 'ignorer'} onChange={e => majColonne(c.col, { libelle: e.target.value })}
          className="h-8 w-44 bg-white/5 border-white/20 text-white text-xs" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={c.unite} disabled={c.role === 'ignorer'} onChange={e => majColonne(c.col, { unite: e.target.value })}
          placeholder={c.role === 'energie' || c.role === 'retour' ? 'Wh, kWh' : c.role === 'puissance' ? 'W, kW' : ''}
          className="h-8 w-20 bg-white/5 border-white/20 text-white text-xs" />
      </td>
      <td className="px-2 py-1.5 text-xs text-slate-400 whitespace-nowrap">
        {(c.role === 'energie' || c.role === 'retour') ? (
          <span className="flex items-center gap-2">
            {/* Appartenance : une colonne d'énergie va au total ou à une phase, jamais aux deux */}
            <select className={SELECT} value={c.phase ?? ''} title="Phase à laquelle appartient cette colonne"
              onChange={e => majColonne(c.col, { phase: (e.target.value || undefined) as LectureColonne['phase'] })}>
              <option value="">Total</option>
              <option value="A">Phase A</option>
              <option value="B">Phase B</option>
              <option value="C">Phase C</option>
            </select>
            <label className="flex items-center gap-1.5 cursor-pointer" title="Index de compteur : l'énergie d'un relevé est la différence avec le précédent">
              <input type="checkbox" checked={!!c.cumul} onChange={e => majColonne(c.col, { cumul: e.target.checked })} /> index cumulé
            </label>
          </span>
        ) : c.role === 'ignorer' && c.motif ? <span className="italic">{c.motif}</span> : null}
      </td>
      <td className="px-2 py-1.5 text-slate-500 text-xs whitespace-nowrap max-w-[14rem] truncate">{exemple(c.col)}</td>
    </tr>
  );

  return (
    <div className="space-y-3 p-4">
      {/* Date et heure */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">Date{lecture.colHeure ? '' : ' et heure'}</span>
          <select className={SELECT} value={lecture.colDate} onChange={e => choisirDate('colDate', e.target.value)}>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">Heure (colonne séparée)</span>
          <select className={SELECT} value={lecture.colHeure} onChange={e => choisirDate('colHeure', e.target.value)}>
            <option value="">— aucune —</option>
            {columns.filter(c => c !== lecture.colDate).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">Ordre des dates</span>
          <select className={SELECT} value={lecture.ordreDates} onChange={e => onChange({ ...lecture, ordreDates: e.target.value as LectureFichier['ordreDates'] })}>
            <option value="jma">jour / mois / année</option>
            <option value="mja">mois / jour / année (US)</option>
            <option value="iso">année-mois-jour</option>
          </select>
        </label>
        <label className="text-xs text-slate-400 space-y-1">
          <span className="block">Ce fichier mesure</span>
          <select className={SELECT} value={lecture.sens ?? 'consommation'} onChange={e => onChange({ ...lecture, sens: e.target.value as LectureFichier['sens'] })}>
            <option value="consommation">une consommation</option>
            <option value="production">une production (PV…)</option>
          </select>
        </label>
        <p className="text-xs text-slate-300 pb-2">
          {ok
            ? <>Du <strong>{fmtDate(resultat.rows[0]?.date)}</strong> au <strong>{fmtDate(resultat.rows.at(-1)?.date)}</strong> · un relevé toutes les {fmtPas(resultat.pasSecondes)}</>
            : <span className="text-red-400">Aucune date lisible avec ces réglages</span>}
        </p>
      </div>

      {/* Colonnes */}
      <div className="overflow-x-auto rounded-lg border border-white/10 max-h-96">
        <table className="min-w-full text-xs">
          <thead className="bg-white/5 sticky top-0 text-slate-400">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Colonne du fichier</th>
              <th className="px-2 py-2 text-left font-medium">Rôle</th>
              <th className="px-2 py-2 text-left font-medium">Libellé</th>
              <th className="px-2 py-2 text-left font-medium">Unité</th>
              <th className="px-2 py-2 text-left font-medium"></th>
              <th className="px-2 py-2 text-left font-medium">Premières valeurs</th>
            </tr>
          </thead>
          <tbody>
            {actives.map(ligneColonne)}
            {ecartees.length > 0 && (
              <tr className="border-t border-white/10">
                <td colSpan={6} className="px-2 py-1.5">
                  <button className="flex items-center gap-1 text-slate-400 hover:text-white" onClick={() => setVoirEcartees(v => !v)}>
                    {voirEcartees ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {ecartees.length} colonne{ecartees.length > 1 ? 's' : ''} non importée{ecartees.length > 1 ? 's' : ''}
                    {' '}({[...new Set(ecartees.map(c => c.motif ?? 'choix'))].join(', ')})
                  </button>
                </td>
              </tr>
            )}
            {voirEcartees && ecartees.map(ligneColonne)}
          </tbody>
        </table>
      </div>

      {/* Ce que l'Analyse en tirera */}
      <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${ok ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-300'}`}>
        {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        <div className="space-y-0.5">
          <p>
            {fmtNb(resultat.rows.length, 0)} relevés · {nbGrandeurs} grandeur{nbGrandeurs > 1 ? 's' : ''}
            {aEnergie ? <> · {production ? 'production' : 'énergie'} {fmtNb(kwh, 2)} kWh{kwhRetour > 0 ? <>, injection {fmtNb(kwhRetour, 2)} kWh</> : null}</> : ' · pas d\'énergie'}
          </p>
          {aPhases && <p>par phase : {parPhase.map(x => `${x.p} ${fmtNb(x.kwh, 2)}`).join(' · ')} kWh</p>}
          {resultat.energieDeduite && <p className="text-amber-300">Énergie calculée à partir de la puissance × {fmtPas(resultat.pasSecondes)} (aucune colonne d'énergie).</p>}
          {resultat.dateIllisibles > 0 && <p className="text-amber-300">{fmtNb(resultat.dateIllisibles, 0)} ligne{resultat.dateIllisibles > 1 ? 's' : ''} sans date lisible, ignorée{resultat.dateIllisibles > 1 ? 's' : ''}.</p>}
        </div>
      </div>
    </div>
  );
}
