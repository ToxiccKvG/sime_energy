// ============================================================
// Bandeau de quarantaine — module Mesures
//
// Montre ce qui est écarté des calculs et permet de l'activer, de choisir
// les familles, et de voir le détail. Rien n'est écarté en silence : le
// bandeau reste visible tant que la quarantaine est active.
// ============================================================

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import {
  REASON_LABELS, setQuarantineEnabled, setQuarantineReason,
  type QuarantineReason, type QuarantineResult, type QuarantineSettings,
} from '@/services/measurementQuarantine';

const fmtDate = (t: number) =>
  new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function QuarantineBar({ result, settings }: { result: QuarantineResult; settings: QuarantineSettings }) {
  const [open, setOpen] = useState(false);
  const reasons = Object.keys(REASON_LABELS) as QuarantineReason[];

  return (
    <div className={`rounded-lg border text-xs ${settings.enabled ? 'border-amber-500/30 bg-amber-500/10' : 'border-border bg-muted/40'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            id="quarantine-enabled"
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setQuarantineEnabled(e.target.checked)}
            className="w-3.5 h-3.5 accent-amber-500"
          />
          <span className="flex items-center gap-1.5 font-medium">
            {settings.enabled
              ? <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
              : <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />}
            Écarter les mesures aberrantes des calculs
          </span>
        </label>

        {settings.enabled && (
          <div className="flex flex-wrap items-center gap-3">
            {reasons.map(r => (
              <label key={r} className="flex items-center gap-1.5 cursor-pointer" title={REASON_LABELS[r].hint}>
                <input
                  id={`quarantine-${r}`}
                  type="checkbox"
                  checked={settings.reasons[r]}
                  onChange={(e) => setQuarantineReason(r, e.target.checked)}
                  className="w-3 h-3 accent-amber-500"
                />
                <span className="text-muted-foreground">{REASON_LABELS[r].label}</span>
              </label>
            ))}
          </div>
        )}

        <span className="ml-auto flex items-center gap-2">
          {settings.enabled ? (
            result.total > 0 ? (
              <>
                <span className="text-amber-600 dark:text-amber-300 font-medium">{result.summary}</span>
                <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Détail
                </button>
              </>
            ) : (
              <span className="text-muted-foreground">Aucune mesure écartée sur ce relevé.</span>
            )
          ) : (
            <span className="text-muted-foreground">
              Les capteurs bloqués et les points aberrants comptent dans les statistiques.
            </span>
          )}
        </span>
      </div>

      {open && result.episodes.length > 0 && (
        <div className="border-t border-border/60 px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
          <p className="text-muted-foreground">
            Les relevés restent intacts : seules les statistiques et les graphiques ignorent ces périodes.
            Survolez le nom d'une famille pour savoir quand l'activer.
          </p>
          {result.episodes.map((e, i) => (
            <p key={i} className="text-muted-foreground">
              <span className="text-foreground">{fmtDate(e.start)} → {fmtDate(e.end)}</span> · {e.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
