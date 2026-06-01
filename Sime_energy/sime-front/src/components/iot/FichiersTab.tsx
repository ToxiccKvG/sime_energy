// ============================================================
// IOT MODULE — Onglet Fichiers (fusion Upload + Stockage)
// Drop zone + configuration en haut, bibliothèque en bas.
// ============================================================

import { Upload, FolderOpen } from 'lucide-react';
import { UploadTab } from './UploadTab';
import { StockageTab } from './StockageTab';

export function FichiersTab() {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-4 w-4 text-blue-400" />
          <h2 className="text-white text-base font-semibold">Importer des fichiers</h2>
        </div>
        <UploadTab />
      </section>

      <div className="border-t border-white/10" />

      <section>
        <div className="flex items-center gap-2 mb-3">
          <FolderOpen className="h-4 w-4 text-green-400" />
          <h2 className="text-white text-base font-semibold">Bibliothèque de fichiers</h2>
        </div>
        <StockageTab />
      </section>
    </div>
  );
}
