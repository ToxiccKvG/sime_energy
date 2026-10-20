import { useState } from 'react';
import { Braces, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useProjectContext, useRefreshProjectContext } from '@/hooks/useProjectContext';

interface ProjectContextDialogProps {
  auditId: string;
  auditName: string;
}

export function ProjectContextDialog({ auditId, auditName }: ProjectContextDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useProjectContext(auditId, open);
  const refresh = useRefreshProjectContext(auditId, user?.id);

  const json = data?.context ? JSON.stringify(data.context, null, 2) : '';
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const handleRefresh = async () => {
    try {
      await refresh.mutateAsync();
      toast.success('Contexte JSON régénéré');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Régénération impossible');
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    toast.success('JSON copié');
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contexte-projet-${auditName.trim().replace(/\s+/g, '-').toLowerCase() || auditId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-slate-400 hover:text-slate-200">
          <Braces className="h-3.5 w-3.5" />
          Contexte JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl bg-[#0f111a] border-slate-700/60 text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Contexte JSON du projet</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Stocké dans <span className="font-mono text-slate-400">audits.project_context</span> et lisible par les autres modules.
            {generatedAt ? ` Généré le ${generatedAt}.` : ' Pas encore généré.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-800 bg-[#0a0c14]">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          ) : json ? (
            <pre className="p-4 text-[11px] leading-relaxed font-mono text-slate-300 whitespace-pre">{json}</pre>
          ) : (
            <p className="py-16 text-center text-xs text-slate-500">
              Aucun JSON pour ce projet. Cliquez sur « Régénérer » pour le créer.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={!json}
            className="h-8 text-xs border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800">
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copier
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={!json}
            className="h-8 text-xs border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Télécharger
          </Button>
          <Button size="sm" onClick={handleRefresh} disabled={refresh.isPending}
            className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white">
            {refresh.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Régénérer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
