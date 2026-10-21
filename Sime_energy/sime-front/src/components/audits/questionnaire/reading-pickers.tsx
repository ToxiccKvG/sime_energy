import { CalendarIcon, Clock } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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

export function ReadingDateTimePicker({ value, onChange }: {
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

export function ReadingTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1">
      <Clock className="h-3 w-3 shrink-0 text-slate-500" />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-xs text-slate-100 focus:outline-none [color-scheme:dark]"
      />
    </div>
  );
}

export function ReadingDateOnlyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const date = parseReadingDate(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded border border-amber-600/30 bg-slate-700/40 px-2 py-1 text-xs text-left focus:outline-none focus:ring-1 focus:ring-amber-500/60 w-full',
            value ? 'text-slate-100' : 'text-slate-600',
          )}
        >
          <CalendarIcon className="h-3 w-3 shrink-0 text-slate-500" />
          {value || 'jj/mm/aaaa'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={fr}
          selected={date}
          onSelect={(d) => onChange(d ? format(d, 'dd/MM/yyyy') : '')}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
