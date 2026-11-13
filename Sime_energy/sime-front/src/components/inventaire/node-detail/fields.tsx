import { AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-slate-800/60 border-slate-600 text-slate-100">
        <SelectValue placeholder={placeholder ?? 'Sélectionner…'} />
      </SelectTrigger>
      <SelectContent className="bg-[#1a1d2e] border-slate-700">
        {options.map(o => (
          <SelectItem key={o} value={o} className="text-slate-100 focus:bg-slate-700/50">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Shared form field helpers ─────────────────────────────────────────────

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-slate-300 text-sm">{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
      {!error && hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-slate-800/60 border-slate-600 text-slate-100 placeholder:text-slate-500"
    />
  );
}

export function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-slate-800/60 border-slate-600 text-slate-100 placeholder:text-slate-500"
    />
  );
}

export function ComputedField({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-emerald-400">
        {value} {unit}
      </span>
    </div>
  );
}
