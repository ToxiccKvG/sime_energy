import React, { useState, useEffect, useCallback } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, parseISO,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Plus, Trash2,
  CalendarDays, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import {
  listCalendarEvents, createCalendarEvent, deleteCalendarEvent,
  type OrgCalendarEvent,
} from '@/lib/calendar-service';
import { getSenegalHolidays, type HolidayEntry } from '@/constants/senegal-holidays';

// ─── Google Calendar (API Key — no OAuth) ─────────────────────────────────────

const SENEGAL_CALENDAR_IDS = [
  'fr.sn#holiday@group.v.calendar.google.com',
  'en.sn#holiday@group.v.calendar.google.com',
];

async function fetchHolidaysWithApiKey(apiKey: string, year: number): Promise<HolidayEntry[] | null> {
  const params = new URLSearchParams({
    key: apiKey,
    timeMin: `${year}-01-01T00:00:00Z`,
    timeMax: `${year + 1}-01-01T00:00:00Z`,
    maxResults: '50',
    singleEvents: 'true',
  });

  for (const calId of SENEGAL_CALENDAR_IDS) {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${params}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      const items = (json.items || []) as { id: string; summary: string; start: { date?: string } }[];
      if (items.length === 0) continue;
      return items
        .map(ev => ({ date: ev.start.date ?? '', title: ev.summary, type: 'fixed' as const }))
        .filter(e => e.date);
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Color options ────────────────────────────────────────────────────────────

const EVENT_COLORS = [
  { value: '#6366f1', label: 'Violet' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#10b981', label: 'Vert' },
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#ec4899', label: 'Rose' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function CalendrierTab() {
  const { user } = useAuth();
  const { organization } = useOrganization();

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [holidaySource, setHolidaySource] = useState<'google' | 'local'>('local');

  const [customEvents, setCustomEvents] = useState<OrgCalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addColor, setAddColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);

  const year = currentMonth.getFullYear();

  // ── Load holidays ──
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
    // Only attempt if API key is set and looks like a real key (starts with AIza)
    if (apiKey && apiKey.startsWith('AIza')) {
      fetchHolidaysWithApiKey(apiKey, year).then(result => {
        if (result && result.length > 0) {
          setHolidays(result);
          setHolidaySource('google');
        } else {
          setHolidays(getSenegalHolidays(year));
          setHolidaySource('local');
        }
      });
    } else {
      setHolidays(getSenegalHolidays(year));
      setHolidaySource('local');
    }
  }, [year]);

  // ── Load custom events ──
  const loadEvents = useCallback(async () => {
    if (!organization) return;
    setLoadingEvents(true);
    try {
      const data = await listCalendarEvents(organization.id, year);
      setCustomEvents(data);
    } catch {
      toast.error('Impossible de charger les événements');
    } finally {
      setLoadingEvents(false);
    }
  }, [organization, year]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Calendar grid ──
  const gridStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const gridEnd   = endOfWeek(endOfMonth(currentMonth),   { weekStartsOn: 1 });
  const days      = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function getHolidaysForDay(date: Date): HolidayEntry[] {
    const key = format(date, 'yyyy-MM-dd');
    return holidays.filter(h => h.date === key);
  }

  function getEventsForDay(date: Date): OrgCalendarEvent[] {
    const key = format(date, 'yyyy-MM-dd');
    return customEvents.filter(e => e.event_date === key);
  }

  // ── Add event ──
  function openAdd(date: Date) {
    setSelectedDate(date);
    setAddTitle('');
    setAddDesc('');
    setAddColor('#6366f1');
    setShowAdd(true);
  }

  async function handleSaveEvent() {
    if (!addTitle.trim()) { toast.error('Le titre est requis'); return; }
    if (!organization || !user || !selectedDate) return;
    setSaving(true);
    try {
      const created = await createCalendarEvent({
        organization_id: organization.id,
        title: addTitle.trim(),
        description: addDesc.trim() || null,
        event_date: format(selectedDate, 'yyyy-MM-dd'),
        end_date: null,
        all_day: true,
        color: addColor,
        created_by: user.id,
      });
      setCustomEvents(prev => [...prev, created]);
      toast.success('Événement ajouté');
      setShowAdd(false);
    } catch {
      toast.error("Impossible d'ajouter l'événement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCalendarEvent(id);
      setCustomEvents(prev => prev.filter(e => e.id !== id));
      toast.success('Événement supprimé');
    } catch {
      toast.error('Impossible de supprimer');
    }
  }

  const prevMonth = () => setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1)));
  const nextMonth = () => setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1)));
  const goToday   = () => setCurrentMonth(startOfMonth(new Date()));

  return (
    <div className="space-y-4">

      {/* ── Calendar card ── */}
      <Card className="bg-[#1a1d2e] border-slate-800">
        <CardContent className="p-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={prevMonth}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-semibold text-slate-100 w-44 text-center capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: fr })}
              </h2>
              <Button size="sm" variant="ghost" onClick={nextMonth}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={goToday}
                className="h-7 px-2 text-[10px] text-slate-500 hover:text-slate-300">
                Aujourd'hui
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => openAdd(new Date())}
              className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Ajouter un événement
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-600 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-px bg-slate-800/40 rounded-xl overflow-hidden border border-slate-800/60">
            {days.map(day => {
              const dayHolidays = getHolidaysForDay(day);
              const dayEvents   = getEventsForDay(day);
              const inMonth     = isSameMonth(day, currentMonth);
              const today       = isToday(day);
              const isWeekend   = [0, 6].includes(day.getDay());

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => openAdd(day)}
                  className={cn(
                    'relative min-h-[72px] p-1.5 cursor-pointer transition-colors group',
                    inMonth ? 'bg-[#14172a]' : 'bg-[#0f111a]',
                    isWeekend && inMonth && 'bg-[#12142a]',
                    'hover:bg-slate-800/60',
                  )}
                >
                  {/* Day number */}
                  <div className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium mb-1',
                    today ? 'bg-violet-600 text-white font-bold' : '',
                    !today && inMonth ? 'text-slate-300' : '',
                    !today && !inMonth ? 'text-slate-700' : '',
                  )}>
                    {format(day, 'd')}
                  </div>

                  {/* Holidays */}
                  {dayHolidays.map((h, i) => (
                    <div key={i} title={h.title}
                      className="mb-0.5 truncate rounded px-1 py-0.5 bg-amber-500/15 border border-amber-500/25">
                      <span className="text-[9px] text-amber-300 font-medium leading-none truncate block">
                        {h.title}
                      </span>
                    </div>
                  ))}

                  {/* Custom events */}
                  {dayEvents.map(ev => (
                    <div key={ev.id} title={ev.title}
                      className="mb-0.5 truncate rounded px-1 py-0.5 flex items-center gap-1 group/ev"
                      style={{ backgroundColor: `${ev.color}22`, border: `1px solid ${ev.color}44` }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span className="text-[9px] font-medium leading-none truncate flex-1"
                        style={{ color: ev.color }}>
                        {ev.title}
                      </span>
                      {ev.created_by === user?.id && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(ev.id); }}
                          className="opacity-0 group-hover/ev:opacity-100 transition-opacity shrink-0"
                        >
                          <Trash2 className="h-2.5 w-2.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-amber-500/30 border border-amber-500/40" />
              <span className="text-[10px] text-slate-500">
                Jour férié {holidaySource === 'google' ? '(Google Calendar)' : '(liste Sénégal)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm bg-violet-500/30 border border-violet-500/40" />
              <span className="text-[10px] text-slate-500">Événement organisation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-violet-600" />
              <span className="text-[10px] text-slate-500">Aujourd'hui</span>
            </div>
            <p className="text-[10px] text-slate-700 ml-auto">
              Cliquez sur un jour pour ajouter un événement
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Upcoming events ── */}
      <UpcomingEvents
        holidays={holidays.filter(h => h.date >= format(new Date(), 'yyyy-MM-dd')).slice(0, 5)}
        events={customEvents.filter(e => e.event_date >= format(new Date(), 'yyyy-MM-dd')).slice(0, 5)}
        onDelete={handleDelete}
        userId={user?.id}
        loading={loadingEvents}
      />

      {/* ── Add event dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-[#1a1d2e] border-slate-700 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-violet-400" />
              Ajouter un événement
              {selectedDate && (
                <span className="text-slate-400 font-normal capitalize ml-1">
                  — {format(selectedDate, 'dd MMMM yyyy', { locale: fr })}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Titre *</Label>
              <Input
                value={addTitle}
                onChange={e => setAddTitle(e.target.value)}
                placeholder="Ex : Réunion bilan, Fermeture exceptionnelle…"
                className="bg-slate-800/50 border-slate-700 text-slate-100 h-9 text-sm"
                onKeyDown={e => e.key === 'Enter' && handleSaveEvent()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Description (optionnel)</Label>
              <Input
                value={addDesc}
                onChange={e => setAddDesc(e.target.value)}
                placeholder="Notes…"
                className="bg-slate-800/50 border-slate-700 text-slate-100 h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Date</Label>
              <Input
                type="date"
                value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                onChange={e => setSelectedDate(e.target.value ? parseISO(e.target.value) : null)}
                className="bg-slate-800/50 border-slate-700 text-slate-100 h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Couleur</Label>
              <div className="flex gap-2">
                {EVENT_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setAddColor(c.value)}
                    title={c.label}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-all',
                      addColor === c.value ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-90',
                    )}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} className="text-slate-400">
                Annuler
              </Button>
              <Button size="sm" onClick={handleSaveEvent} disabled={saving}
                className="bg-violet-600 hover:bg-violet-700 text-white">
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Upcoming events ──────────────────────────────────────────────────────────

function UpcomingEvents({
  holidays, events, onDelete, userId, loading,
}: {
  holidays: HolidayEntry[];
  events: OrgCalendarEvent[];
  onDelete: (id: string) => void;
  userId?: string;
  loading: boolean;
}) {
  if (loading) return null;
  if (holidays.length === 0 && events.length === 0) return null;

  return (
    <Card className="bg-[#1a1d2e] border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-3.5 w-3.5 text-slate-500" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Prochains événements</p>
        </div>
        <div className="space-y-1.5">
          {holidays.map((h, i) => (
            <div key={`h-${i}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-200 truncate">{h.title}</p>
                <p className="text-[10px] text-slate-500 capitalize">
                  {format(parseISO(h.date), 'EEEE dd MMMM yyyy', { locale: fr })}
                </p>
              </div>
              <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded font-medium shrink-0">
                Férié
              </span>
            </div>
          ))}
          {events.map(ev => (
            <div key={ev.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border"
              style={{ backgroundColor: `${ev.color}0d`, borderColor: `${ev.color}30` }}
            >
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: ev.color }}>{ev.title}</p>
                {ev.description && (
                  <p className="text-[10px] text-slate-500 truncate">{ev.description}</p>
                )}
                <p className="text-[10px] text-slate-500 capitalize">
                  {format(parseISO(ev.event_date), 'EEEE dd MMMM yyyy', { locale: fr })}
                </p>
              </div>
              {ev.created_by === userId && (
                <button onClick={() => onDelete(ev.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
