/**
 * Composant pour la conception du schéma électrique avec hiérarchie
 */

import { useState, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateHierarchyJSON, processHierarchy, HierarchyData } from "@/services/measurementService";

interface SchemaComponent {
  id: string;
  name: string;
  level: number;
  parent: string | null;
  children: string[];
  measureFile?: string;
}

interface SchemaDesignerStepProps {
  measureFiles: File[];
  onHierarchyGenerated: (hierarchy: HierarchyData) => void;
  onProcessingComplete?: (result: any) => void;
  isLoading?: boolean;
}

export function SchemaDesignerStep({
  measureFiles,
  onHierarchyGenerated,
  onProcessingComplete,
  isLoading = false,
}: SchemaDesignerStepProps) {
  const [components, setComponents] = useState<SchemaComponent[]>([
    {
      id: "1:1",
      name: "TGBT (Tableau General Basse Tension)",
      level: 1,
      parent: null,
      children: [],
      measureFile: undefined,
    },
  ]);
  const [processing, setProcessing] = useState(false);
  const [generatedHierarchy, setGeneratedHierarchy] = useState<HierarchyData | null>(null);
  const { toast } = useToast();

  const addComponent = useCallback((parentId?: string) => {
    const newId = `${Date.now()}`;
    const newComponent: SchemaComponent = {
      id: newId,
      name: `Nouveau composant`,
      level: parentId ? (components.find((c) => c.id === parentId)?.level ?? 1) + 1 : 1,
      parent: parentId ?? null,
      children: [],
      measureFile: undefined,
    };

    setComponents((prev) => {
      const updated = [...prev, newComponent];
      if (parentId) {
        return updated.map((c) =>
          c.id === parentId ? { ...c, children: [...c.children, newId] } : c
        );
      }
      return updated;
    });
  }, [components]);

  const deleteComponent = useCallback((id: string) => {
    if (id === "1:1") {
      toast({
        title: "Non autorisé",
        description: "Vous ne pouvez pas supprimer le TGBT principal",
        variant: "destructive",
      });
      return;
    }

    setComponents((prev) => {
      const component = prev.find((c) => c.id === id);
      if (!component) return prev;

      let updated = prev.filter((c) => c.id !== id);

      // Retirer de la liste des enfants du parent
      if (component.parent) {
        updated = updated.map((c) =>
          c.id === component.parent
            ? { ...c, children: c.children.filter((cId) => cId !== id) }
            : c
        );
      }

      // Supprimer tous les enfants aussi
      if (component.children.length > 0) {
        const childrenToDelete = new Set(component.children);
        let queue = [...component.children];

        while (queue.length > 0) {
          const childId = queue.shift()!;
          const child = updated.find((c) => c.id === childId);
          if (child) {
            childrenToDelete.add(childId);
            queue.push(...child.children);
          }
        }

        updated = updated.filter((c) => !childrenToDelete.has(c.id));
      }

      return updated;
    });
  }, [toast]);

  const updateComponent = useCallback((id: string, updates: Partial<SchemaComponent>) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const generateHierarchy = useCallback(() => {
    const nodes = components.map((c) => ({
      id: c.id,
      data: {
        label: c.name,
        associatedFile: c.measureFile || "",
      },
    }));

    const edges = components.flatMap((c) =>
      c.children.map((childId) => ({
        source: c.id,
        target: childId,
      }))
    );

    const hierarchy = generateHierarchyJSON(nodes, edges);
    setGeneratedHierarchy(hierarchy);
    onHierarchyGenerated(hierarchy);

    toast({
      title: "Hiérarchie générée",
      description: `${hierarchy.totalNodes} composant(s) structuré(s)`,
    });
  }, [components, onHierarchyGenerated, toast]);

  const processHierarchyData = useCallback(async () => {
    if (!generatedHierarchy) {
      toast({
        title: "Erreur",
        description: "Veuillez d'abord générer la hiérarchie",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const result = await processHierarchy(generatedHierarchy);
      toast({
        title: "Hiérarchie traitée",
        description: "Données structurées et prêtes pour l'analyse",
      });
      onProcessingComplete?.(result);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Erreur lors du traitement",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  }, [generatedHierarchy, onProcessingComplete, toast]);

  // Level colours: L1 amber, L2 indigo, L3 violet, L4+ slate
  const levelColor = (level: number) => {
    const map: Record<number, string> = {
      1: 'bg-amber-400/90',
      2: 'bg-indigo-400/90',
      3: 'bg-violet-400/90',
    };
    return map[level] ?? 'bg-slate-500/90';
  };

  const renderComponentTree = (parentId: string | null, level: number = 0) => {
    const children = components.filter((c) => c.parent === parentId);

    return (
      <div className={level > 0 ? 'ml-5 pl-4 border-l border-slate-700/60' : ''}>
        {children.map((component, idx) => (
          <div key={component.id} className={idx > 0 ? 'mt-2' : ''}>
            {/* Node row */}
            <div className="flex items-center gap-2 group">
              {/* Level dot */}
              <span className={`shrink-0 w-1.5 h-5 rounded-full ${levelColor(component.level)}`} />

              {/* Name input */}
              <input
                value={component.name}
                onChange={(e) => updateComponent(component.id, { name: e.target.value })}
                placeholder="Nom du composant"
                className={
                  'flex-1 h-8 px-3 rounded-lg text-xs font-medium ' +
                  'bg-[#151825] border border-slate-700/50 text-slate-200 placeholder:text-slate-600 ' +
                  'focus:outline-none focus:border-indigo-500/60 focus:bg-[#1a1d2e] transition-all'
                }
              />

              {/* Mono level badge */}
              <span className="shrink-0 hidden group-hover:inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-mono text-slate-500 bg-slate-800/60">
                L{component.level}
              </span>

              {/* Add child */}
              <button
                onClick={() => addComponent(component.id)}
                title="Ajouter un sous-composant"
                className={
                  'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ' +
                  'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 ' +
                  'hover:bg-indigo-500/20 hover:border-indigo-400/40'
                }
              >
                <Plus className="h-3 w-3" />
              </button>

              {/* Delete */}
              <button
                onClick={() => deleteComponent(component.id)}
                title="Supprimer"
                className={
                  'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all ' +
                  'bg-red-500/10 border border-red-500/20 text-red-400 ' +
                  'hover:bg-red-500/20 hover:border-red-400/40'
                }
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            {/* File selector */}
            {measureFiles.length > 0 && (
              <div className="ml-3.5 mt-1.5 pl-4 border-l border-slate-700/40">
                <Select
                  value={component.measureFile || ""}
                  onValueChange={(value) =>
                    updateComponent(component.id, {
                      measureFile: value === "none" ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger className="h-7 text-[11px] bg-[#0f111a] border-slate-700/50 text-slate-400">
                    <SelectValue placeholder="Lier un fichier de mesure…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun fichier</SelectItem>
                    {measureFiles.map((f) => (
                      <SelectItem key={f.name} value={f.name}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Children */}
            <div className="mt-2">
              {renderComponentTree(component.id, level + 1)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Main tree card */}
      <div className="bg-[#0f111a] border border-slate-700/50 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-200">Structure du schéma électrique</span>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-800/50 px-1.5 py-0.5 rounded">
              {components.length} nœud{components.length !== 1 ? 's' : ''}
            </span>
          </div>

          <button
            onClick={() => addComponent()}
            className={
              'flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium transition-all ' +
              'bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 ' +
              'hover:bg-indigo-500/25 hover:border-indigo-400/40'
            }
          >
            <Plus className="w-3 h-3" />
            Ajouter racine
          </button>
        </div>

        {/* Tree */}
        <div className="p-5">
          {renderComponentTree(null)}
        </div>
      </div>

      {/* Generated hierarchy result */}
      {generatedHierarchy && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-300 mb-0.5">Hiérarchie générée</p>
            <p className="text-[11px] text-emerald-600 font-mono">
              {generatedHierarchy.totalNodes} composant(s) · {generatedHierarchy.totalLevels} niveau(x)
            </p>
          </div>
          <button
            onClick={processHierarchyData}
            disabled={processing || isLoading}
            className={
              'flex items-center gap-2 h-8 px-4 rounded-lg text-xs font-medium transition-all ' +
              'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 ' +
              'hover:bg-emerald-500/25 hover:border-emerald-400/50 ' +
              'disabled:opacity-50 disabled:cursor-not-allowed'
            }
          >
            {processing && <Loader2 className="h-3 w-3 animate-spin" />}
            {processing ? 'Traitement…' : 'Traiter la hiérarchie'}
          </button>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={generateHierarchy}
        disabled={components.length === 0 || generatedHierarchy !== null}
        className={
          'w-full h-9 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ' +
          'border ' +
          (generatedHierarchy !== null
            ? 'bg-slate-800/40 border-slate-700/30 text-slate-600 cursor-not-allowed'
            : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-400/50')
        }
      >
        <Download className="h-3.5 w-3.5" />
        Générer la hiérarchie
      </button>
    </div>
  );
}
