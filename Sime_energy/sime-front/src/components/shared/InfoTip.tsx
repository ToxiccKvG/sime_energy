/**
 * Bulles d'explication au survol, alimentées par le dictionnaire `glossary.ts` :
 *  - <KpiTooltip> : toute la carte KPI est survolable ; la bulle dit ce qu'est
 *    l'indicateur, comment il est calculé et ce que veut dire la valeur affichée ;
 *  - <Term> : terme technique souligné en pointillé dans un texte, sa définition
 *    apparaît au survol.
 * Au toucher (mobile), un appui ouvre la bulle ; elle se referme en touchant ailleurs.
 */
import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GLOSSARY, type GlossaryKey } from './glossary';

function useTapToOpen() {
  const [open, setOpen] = useState(false);
  return { open, onOpenChange: setOpen, openNow: () => setOpen(true) };
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p><span className="text-muted-foreground">{label} : </span>{children}</p>
  );
}

/** Icône discrète signalant qu'une carte a une explication au survol. */
export function KpiInfoIcon() {
  return <Info className="h-3 w-3 shrink-0 text-slate-500 group-hover:text-slate-300" aria-hidden />;
}

/**
 * Rend la carte entière survolable. `term` : clé du dictionnaire ;
 * `hint` : lecture de la valeur affichée (ligne « Ici »).
 */
export function KpiTooltip({ term, hint, children }: { term?: GlossaryKey; hint?: string; children: ReactNode }) {
  const { open, onOpenChange, openNow } = useTapToOpen();
  const entry = term ? GLOSSARY[term] : undefined;
  if (!entry && !hint) return <>{children}</>;
  return (
    <Tooltip open={open} onOpenChange={onOpenChange} delayDuration={250}>
      <TooltipTrigger asChild>
        <div role="button" tabIndex={0} onClick={openNow} className="group cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 rounded-xl">
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm space-y-1 text-xs leading-snug">
        {entry && <p className="font-semibold">{entry.term}</p>}
        {entry && <Line label="Ce que c'est">{entry.definition}</Line>}
        {entry && 'calcul' in entry && <Line label="Calcul">{entry.calcul}</Line>}
        {hint && <Line label="Ici">{hint}</Line>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Terme technique souligné en pointillé ; affiche sa définition au survol. */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const { open, onOpenChange, openNow } = useTapToOpen();
  const entry = GLOSSARY[k];
  return (
    <Tooltip open={open} onOpenChange={onOpenChange} delayDuration={200}>
      <TooltipTrigger asChild>
        <span tabIndex={0} onClick={openNow} className="cursor-help underline decoration-dotted decoration-slate-500 underline-offset-2 focus:outline-none">
          {children ?? entry.term}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1 text-xs leading-snug">
        <p className="font-semibold">{entry.term}</p>
        <p>{entry.definition}</p>
        {'calcul' in entry && <Line label="Calcul">{entry.calcul}</Line>}
      </TooltipContent>
    </Tooltip>
  );
}
