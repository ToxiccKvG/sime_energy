// ============================================================
// IOT MODULE — Onglet Fichiers (fusion Upload + Stockage)
// Drop zone + configuration en haut, bibliothèque en bas, puis les nettoyages
// enregistrés : ce ne sont pas des fichiers (une recette relit les mesures en
// base), mais c'est ici qu'on cherche ce qu'on a stocké.
// ============================================================

import { Upload, FolderOpen } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { UploadTab } from './UploadTab';
import { StockageTab } from './StockageTab';
import { RecettesPanel } from './QualiteMoteurPanel';
import { useIOT } from './IOTContext';

export const ID_NETTOYAGES_ENREGISTRES = 'iot-nettoyages-enregistres';

export function FichiersTab() {
  const { state, setShellyRows, setSelectedFile, setActiveTab } = useIOT();
  const { organization } = useOrganization();

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

      <section id={ID_NETTOYAGES_ENREGISTRES} className="scroll-mt-4">
        <RecettesPanel
          organizationId={organization?.id ?? null}
          chargement={null}
          reglesExclues={new Set()}
          version={null}
          joursFerier={state.joursFerier}
          onOuvrir={(rows, chargement, regles) => {
            setSelectedFile(null); // sinon le Nettoyage rouvrirait ce fichier plutôt que la recette
            setShellyRows(rows, chargement, { reglesExclues: regles });
            setActiveTab('nettoyage');
          }}
        />
      </section>
    </div>
  );
}
