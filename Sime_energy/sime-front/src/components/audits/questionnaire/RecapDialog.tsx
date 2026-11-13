import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PVQuestionnaire } from '@/types/audit';
import { RecapContent } from './RecapContent';
import { buildRecapHTML } from './recap-html';

export function RecapDialog({ open, onOpenChange, questionnaire }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  questionnaire: PVQuestionnaire;
}) {
  const handleExportPDF = () => {
    const html = buildRecapHTML(questionnaire);
    const win = window.open('', '_blank', 'width=900,height=720');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] bg-slate-900 border-slate-700 flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-slate-100">
              Tableau récapitulatif — {questionnaire.name}
            </DialogTitle>
            <Button size="sm" onClick={handleExportPDF} className="bg-blue-600 hover:bg-blue-500 text-white">
              <FileDown className="h-4 w-4 mr-1.5" />
              Télécharger PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 pr-1">
          <RecapContent questionnaire={questionnaire} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
