import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

// ---- HELPERS ----

export function SiteSection({ title, color, children }: { title: string; color: 'orange' | 'blue' | 'emerald'; children: React.ReactNode }) {
  const colors = { orange: 'text-orange-400 border-orange-500/30 bg-orange-500/5', blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5', emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  return (
    <div className={`rounded-lg border p-3 space-y-3 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase">{title}</p>
      {children}
    </div>
  );
}

export function StrField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-400 text-xs">{label}</Label>
      <Input value={value || ''} onChange={e => onChange(e.target.value)} className="bg-slate-700/50 border-slate-600 h-8 text-sm" />
    </div>
  );
}

export function NumField({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-slate-400 text-xs">{label}</Label>
      <Input type="number" value={value ?? ''} onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : undefined)} className="bg-slate-700/50 border-slate-600 h-8 text-sm" />
    </div>
  );
}
