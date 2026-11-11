import { RefreshCw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export interface Avancement {
  libelle: string;
  /** 0 à 100. null : on ne sait pas chiffrer cette étape, seul le texte et la roue s'affichent. */
  pct: number | null;
}

/** Montre que le travail avance : pendant le calcul du rapport et la création du fichier. */
export function BarreAvancement({ avancement }: { avancement: Avancement }) {
  const { libelle, pct } = avancement;
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-2 text-xs text-slate-300">
        <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0 text-blue-400" aria-hidden="true" />
        <span className="flex-1 min-w-0">{libelle}</span>
        {pct != null && <span className="font-medium text-white tabular-nums">{Math.round(pct)} %</span>}
      </div>
      {pct != null && <Progress value={pct} className="h-1.5 bg-white/10 [&>div]:bg-blue-500" aria-label={libelle} />}
    </div>
  );
}

/** Laisse le navigateur afficher le dernier message avant un travail lourd. */
export const laisserAfficher = () => new Promise<void>(r => setTimeout(r, 50));
