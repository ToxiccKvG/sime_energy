// ============================================================
// IOT MODULE — Onglet 5 : Calendrier
// Jours ouvrés, horaires de travail, jours fériés
// + Synchronisation Google Calendar
// ============================================================

import { useState } from 'react';
import {
  Plus, Trash2, Calendar, Clock, Check, RefreshCw,
  Settings2, Edit2, X, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Label }   from '@/components/ui/label';
import { Badge }   from '@/components/ui/badge';
import { Switch }  from '@/components/ui/switch';
import { useIOT }  from './IOTContext';
import type { PlageHoraire, JourFerie } from './shared';
import { JOURS_FERIES_FIXES }           from './shared';
import {
  fetchHolidaysGoogleCalendar,
  GOOGLE_CALENDAR_ID_SENEGAL,
} from '@/lib/iot-google-calendar';

const LS_CAL_ID = 'iot_gcal_calendar_id';

const JOURS_SEMAINE = [
  { idx: 1, court: 'Lun', long: 'Lundi' },
  { idx: 2, court: 'Mar', long: 'Mardi' },
  { idx: 3, court: 'Mer', long: 'Mercredi' },
  { idx: 4, court: 'Jeu', long: 'Jeudi' },
  { idx: 5, court: 'Ven', long: 'Vendredi' },
  { idx: 6, court: 'Sam', long: 'Samedi' },
  { idx: 0, court: 'Dim', long: 'Dimanche' },
];

// ---- Grille hebdomadaire (aperçu visuel) ----
function GrilleHebdo({ semaine }: { semaine: Record<number, { actif: boolean; plages: PlageHoraire[] }> }) {
  const heures = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="grid grid-cols-8 gap-px mb-1">
          <div className="text-slate-600 text-xs text-center">h</div>
          {JOURS_SEMAINE.map(j => (
            <div key={j.idx} className={`text-xs text-center font-medium ${semaine[j.idx]?.actif ? 'text-white' : 'text-slate-600'}`}>
              {j.court}
            </div>
          ))}
        </div>
        {heures.map(h => (
          <div key={h} className="grid grid-cols-8 gap-px mb-px">
            <div className="text-slate-600 text-xs text-right pr-1">{h < 10 ? `0${h}` : h}</div>
            {JOURS_SEMAINE.map(j => {
              const cfg = semaine[j.idx];
              const isActif = cfg?.actif && cfg.plages.some(p => {
                const dh = parseInt(p.debut.split(':')[0]);
                const fh = parseInt(p.fin.split(':')[0]);
                return h >= dh && h < fh;
              });
              return (
                <div
                  key={j.idx}
                  className={`h-3 rounded-sm transition-colors ${
                    isActif ? 'bg-blue-500/60' : !cfg?.actif ? 'bg-white/5' : 'bg-white/10'
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Section A : Jours ouvrés ----
function SectionJoursOuvres() {
  const { state, updateCalendrier } = useIOT();
  const cal = state.calendriers[0];

  const toggleJour = (idx: number) => {
    const cur = cal.semaine[idx];
    updateCalendrier(cal.id, {
      semaine: {
        ...cal.semaine,
        [idx]: {
          ...cur,
          actif: !cur.actif,
          plages: !cur.actif && cur.plages.length === 0
            ? [{ debut: '08:00', fin: '18:00' }]
            : cur.plages,
        },
      },
    });
  };

  const updatePlage = (jourIdx: number, plageI: number, field: 'debut' | 'fin', val: string) => {
    const plages = [...cal.semaine[jourIdx].plages];
    plages[plageI] = { ...plages[plageI], [field]: val };
    updateCalendrier(cal.id, {
      semaine: { ...cal.semaine, [jourIdx]: { ...cal.semaine[jourIdx], plages } },
    });
  };

  const addPlage = (jourIdx: number) => {
    const plages = [...cal.semaine[jourIdx].plages, { debut: '12:00', fin: '14:00' }];
    updateCalendrier(cal.id, {
      semaine: { ...cal.semaine, [jourIdx]: { ...cal.semaine[jourIdx], plages } },
    });
  };

  const removePlage = (jourIdx: number, plageI: number) => {
    const plages = cal.semaine[jourIdx].plages.filter((_, i) => i !== plageI);
    updateCalendrier(cal.id, {
      semaine: { ...cal.semaine, [jourIdx]: { ...cal.semaine[jourIdx], plages } },
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4 text-blue-400" /> Jours ouvrés et horaires
      </h3>

      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
        <p className="text-slate-400 text-xs mb-3">Aperçu hebdomadaire des heures actives</p>
        <GrilleHebdo semaine={cal.semaine} />
      </div>

      <div className="space-y-2">
        {JOURS_SEMAINE.map(({ idx, long }) => {
          const cfg = cal.semaine[idx];
          return (
            <div
              key={idx}
              className={`rounded-xl border p-3 transition-all ${
                cfg.actif ? 'border-white/20 bg-white/5' : 'border-white/10 bg-transparent opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={cfg.actif}
                  onCheckedChange={() => toggleJour(idx)}
                  className="data-[state=checked]:bg-blue-500"
                />
                <span className={`w-24 font-medium text-sm ${cfg.actif ? 'text-white' : 'text-slate-500'}`}>
                  {long}
                </span>
                {cfg.actif && (
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    {cfg.plages.map((p, pi) => (
                      <div key={pi} className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                        <input
                          type="time"
                          value={p.debut}
                          onChange={(e) => updatePlage(idx, pi, 'debut', e.target.value)}
                          className="bg-transparent text-white text-xs w-16 outline-none"
                        />
                        <span className="text-slate-500 text-xs">–</span>
                        <input
                          type="time"
                          value={p.fin}
                          onChange={(e) => updatePlage(idx, pi, 'fin', e.target.value)}
                          className="bg-transparent text-white text-xs w-16 outline-none"
                        />
                        {cfg.plages.length > 1 && (
                          <button onClick={() => removePlage(idx, pi)} className="text-slate-500 hover:text-red-400 ml-1">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addPlage(idx)}
                      className="text-slate-500 hover:text-blue-400 text-xs flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> pause
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Types internes pour l'édition ----
type SyncStatus = 'idle' | 'loading' | 'success' | 'error';

interface EditForm {
  nom: string;
  date: string; // 'YYYY-MM-DD'
  type: JourFerie['type'];
}

const typeColors: Record<JourFerie['type'], string> = {
  'férie':     'bg-red-500/20 text-red-300',
  'fête':      'bg-purple-500/20 text-purple-300',
  'événement': 'bg-yellow-500/20 text-yellow-300',
};

// ---- Panel configuration Google Calendar ----
function GoogleCalendarPanel({
  calId,
  onCalId, onSync, status, message,
}: {
  calId: string;
  onCalId:  (v: string) => void;
  onSync:   (mode: 'merge' | 'replace') => void;
  status:  SyncStatus;
  message: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(v => !v)}
      >
        <Settings2 className="h-4 w-4 text-slate-400" />
        <span className="text-white text-sm font-medium">Google Calendar API</span>
        <span className="ml-auto text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">ID Calendrier (optionnel)</Label>
            <Input
              value={calId}
              onChange={e => onCalId(e.target.value)}
              placeholder={GOOGLE_CALENDAR_ID_SENEGAL}
              className="bg-white/5 border-white/20 text-white h-8 text-sm font-mono"
            />
            <p className="text-slate-600 text-xs mt-1">
              Laissez vide pour utiliser le calendrier Sénégal par défaut.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-500 text-white"
              disabled={status === 'loading'}
              onClick={() => onSync('merge')}
            >
              {status === 'loading'
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> Sync…</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1" /> Synchroniser (fusionner)</>
              }
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-white/20 text-slate-300 hover:bg-white/10"
              disabled={status === 'loading'}
              onClick={() => onSync('replace')}
            >
              Remplacer tout
            </Button>
          </div>

          {status === 'success' && (
            <div className="flex items-center gap-2 text-green-400 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> {message}
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="h-3.5 w-3.5" /> {message}
            </div>
          )}

          <p className="text-slate-600 text-xs">
            La clé API est configurée dans <span className="text-slate-400">.env</span> →
            <span className="font-mono"> VITE_GOOGLE_CALENDAR_API_KEY</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Section B : Jours fériés ----
function SectionJoursFeries() {
  const { state, addJourFerie, toggleJourFerie, updateJourFerie, removeJourFerie, setJoursFerier } = useIOT();

  // Google Calendar state
  const [calId, setCalId] = useState<string>(() => localStorage.getItem(LS_CAL_ID) ?? GOOGLE_CALENDAR_ID_SENEGAL);
  const [syncStatus,  setSyncStatus]  = useState<SyncStatus>('idle');
  const [syncMessage, setSyncMessage] = useState('');

  // Ajout
  const [showAjout, setShowAjout] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newNom,  setNewNom]  = useState('');
  const [newType, setNewType] = useState<JourFerie['type']>('férie');

  // Édition inline
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ nom: '', date: '', type: 'férie' });

  const annee = new Date().getFullYear();

  const handleCalId = (v: string) => {
    setCalId(v);
    localStorage.setItem(LS_CAL_ID, v);
  };

  const handleSync = async (mode: 'merge' | 'replace') => {
    setSyncStatus('loading');
    setSyncMessage('');
    try {
      const fetched = await fetchHolidaysGoogleCalendar(annee, calId || GOOGLE_CALENDAR_ID_SENEGAL);
      if (mode === 'replace') {
        setJoursFerier(fetched);
        setSyncMessage(`${fetched.length} jours fériés importés (liste remplacée).`);
      } else {
        // Fusionner : garder les existants, ajouter les nouveaux (par date+nom)
        const existing = state.joursFerier;
        const toAdd = fetched.filter(f =>
          !existing.some(e =>
            e.date.toDateString() === f.date.toDateString() && e.nom === f.nom
          )
        );
        toAdd.forEach(j => addJourFerie(j));
        setSyncMessage(`${toAdd.length} nouveau(x) jour(s) ajouté(s), ${fetched.length - toAdd.length} déjà présent(s).`);
      }
      setSyncStatus('success');
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage(String(err instanceof Error ? err.message : err));
    }
  };

  const handleAjouter = () => {
    if (!newDate || !newNom) return;
    addJourFerie({ date: new Date(newDate + 'T00:00:00'), nom: newNom, type: newType, actif: true });
    setNewDate(''); setNewNom(''); setShowAjout(false);
  };

  const startEdit = (i: number, jf: JourFerie) => {
    setEditingIdx(i);
    setEditForm({
      nom:  jf.nom,
      date: jf.date.toISOString().split('T')[0],
      type: jf.type,
    });
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    updateJourFerie(editingIdx, {
      nom:  editForm.nom,
      date: new Date(editForm.date + 'T00:00:00'),
      type: editForm.type,
    });
    setEditingIdx(null);
  };

  const handleDelete = (i: number) => {
    if (window.confirm('Supprimer ce jour ?')) removeJourFerie(i);
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-purple-400" /> Jours fériés &amp; fêtes — {annee}
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="border-white/20 text-slate-300 hover:bg-white/10"
          onClick={() => setShowAjout(v => !v)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
        </Button>
      </div>

      {/* Google Calendar sync panel */}
      <GoogleCalendarPanel
        calId={calId}
        onCalId={handleCalId}
        onSync={handleSync} status={syncStatus} message={syncMessage}
      />

      {/* Formulaire ajout */}
      {showAjout && (
        <div className="bg-white/5 rounded-xl border border-white/20 p-4 grid grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Date</Label>
            <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              className="bg-white/5 border-white/20 text-white h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-slate-400 text-xs mb-1 block">Nom</Label>
            <Input value={newNom} onChange={e => setNewNom(e.target.value)}
              placeholder="ex : Korité 2026"
              className="bg-white/5 border-white/20 text-white h-8 text-sm" />
          </div>
          <div>
            <Label className="text-slate-400 text-xs mb-1 block">Type</Label>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value as JourFerie['type'])}
              className="w-full h-8 rounded-md bg-white/5 border border-white/20 text-white text-sm px-2"
            >
              <option value="férie">Férié</option>
              <option value="fête">Fête</option>
              <option value="événement">Événement</option>
            </select>
          </div>
          <div className="col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="text-slate-400" onClick={() => setShowAjout(false)}>
              Annuler
            </Button>
            <Button size="sm" className="bg-blue-600 text-white" onClick={handleAjouter}>
              <Check className="h-3.5 w-3.5 mr-1" /> Ajouter
            </Button>
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-x-auto bg-white/5 rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              {['Date', 'Nom', 'Type', 'Actif', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-slate-300 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.joursFerier.map((jf, i) =>
              editingIdx === i ? (
                /* ---- Ligne en édition ---- */
                <tr key={i} className="border-t border-white/10 bg-blue-500/5">
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                      className="bg-white/10 border border-white/20 rounded text-white text-xs h-7 px-2 w-32"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={editForm.nom}
                      onChange={e => setEditForm(f => ({ ...f, nom: e.target.value }))}
                      className="bg-white/10 border border-white/20 rounded text-white text-xs h-7 px-2 w-full min-w-[160px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={editForm.type}
                      onChange={e => setEditForm(f => ({ ...f, type: e.target.value as JourFerie['type'] }))}
                      className="bg-white/10 border border-white/20 rounded text-white text-xs h-7 px-2"
                    >
                      <option value="férie">Férié</option>
                      <option value="fête">Fête</option>
                      <option value="événement">Événement</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">—</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={saveEdit} className="text-green-400 hover:text-green-300 p-1">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingIdx(null)} className="text-slate-500 hover:text-white p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                /* ---- Ligne normale ---- */
                <tr key={i} className={`border-t border-white/10 hover:bg-white/5 group ${!jf.actif ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">
                    {jf.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                  </td>
                  <td className="px-4 py-2.5 text-white">{jf.nom}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={`border-0 text-xs ${typeColors[jf.type] ?? ''}`}>
                      {jf.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Switch
                      checked={jf.actif}
                      onCheckedChange={() => toggleJourFerie(i)}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(i, jf)}
                        className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/10"
                        title="Modifier"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(i)}
                        className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-red-500/10"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {state.joursFerier.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  Aucun jour férié — synchronisez depuis Google Calendar ou ajoutez manuellement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 text-xs text-blue-300">
        Les fêtes islamiques (Korité, Tabaski, Tamkharit, Maouloud) ont des dates variables —
        utilisez la synchronisation Google Calendar ou ajoutez-les manuellement chaque année.
        Désactivez un jour si votre site travaille quand même ce jour-là.
      </div>
    </div>
  );
}

// ---- Onglet principal ----
export function CalendrierTab() {
  const [section, setSection] = useState<'ouvrés' | 'fériés'>('ouvrés');

  // Supprimer les imports non utilisés au runtime
  void JOURS_FERIES_FIXES;

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {(['ouvrés', 'fériés'] as const).map(s => (
          <button
            key={s}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              section === s ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setSection(s)}
          >
            {s === 'ouvrés' ? 'Jours ouvrés & horaires' : 'Jours fériés & fêtes'}
          </button>
        ))}
      </div>

      {section === 'ouvrés' ? <SectionJoursOuvres /> : <SectionJoursFeries />}
    </div>
  );
}
