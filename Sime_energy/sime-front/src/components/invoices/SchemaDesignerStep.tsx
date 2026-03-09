/**
 * Composant pour la conception du schéma électrique avec hiérarchie
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const renderComponentTree = (parentId: string | null, level: number = 0) => {
    const children = components.filter((c) => c.parent === parentId);

    return (
      <div className={`space-y-2 ${level > 0 ? "ml-6 border-l-2 border-border pl-4" : ""}`}>
        {children.map((component) => (
          <div key={component.id} className="space-y-2">
            <Card className="p-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={component.name}
                    onChange={(e) => updateComponent(component.id, { name: e.target.value })}
                    placeholder="Nom du composant"
                    className="flex-1 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addComponent(component.id)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteComponent(component.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {measureFiles.length > 0 && (
                  <Select
                    value={component.measureFile || ""}
                    onValueChange={(value) =>
                      updateComponent(component.id, {
                        measureFile: value === "none" ? undefined : value,
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Lier un fichier de mesure" />
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
                )}
              </div>
            </Card>

            {renderComponentTree(component.id, level + 1)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Structure du schéma électrique</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addComponent()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Ajouter composant racine
          </Button>
        </div>

        <div className="space-y-3">
          {renderComponentTree(null)}
        </div>
      </Card>

      {generatedHierarchy && (
        <Card className="p-4 bg-green-50 border border-green-200">
          <div className="space-y-3">
            <div>
              <p className="font-medium text-green-900">Hiérarchie générée</p>
              <p className="text-sm text-green-700">
                {generatedHierarchy.totalNodes} composant(s) dans {generatedHierarchy.totalLevels} niveau(x)
              </p>
            </div>

            <Button
              onClick={processHierarchyData}
              disabled={processing || isLoading}
              className="w-full"
            >
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {processing ? "Traitement en cours..." : "Traiter la hiérarchie"}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Button
          onClick={generateHierarchy}
          disabled={components.length === 0 || generatedHierarchy !== null}
          className="flex-1"
        >
          <Download className="mr-2 h-4 w-4" />
          Générer la hiérarchie
        </Button>
      </div>
    </div>
  );
}
