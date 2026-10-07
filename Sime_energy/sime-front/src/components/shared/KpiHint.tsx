/**
 * Petite icône « i » à côté du libellé d'une carte KPI : le commentaire
 * explicatif s'affiche au survol (ou au toucher sur mobile) au lieu d'occuper
 * une ligne grisée sous la valeur. Se referme en quittant l'icône ou en touchant ailleurs.
 */
import { useState } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function KpiHint({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={150}>
      <TooltipTrigger asChild>
        <button type="button" aria-label={text} onClick={() => setOpen(true)}
          className="inline-flex shrink-0 text-slate-500 hover:text-slate-300 focus:outline-none focus-visible:text-slate-300">
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}
