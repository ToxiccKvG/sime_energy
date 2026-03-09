/**
 * Composant pour afficher un PDF avec les bounding boxes et annotation des données extraites
 * Supporte l'édition des clés et valeurs avec validation via dictionnaire
 * Reconnaissance des tableaux par modèles avec structure visuelle
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { StructuredExtractedData } from '@/services/invoiceService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Edit2,
  Check,
  X,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Table2,
  HelpCircle,
  Rows3,
  Columns3,
  Grid3X3,
} from 'lucide-react';
import type {
  ValidationResult,
  FieldValidationResult,
  TableRecognitionResult,
} from '@/types/annotation-dictionary';

interface FormField {
  Key: string;
  Value: string;
  box?: [number, number, number, number];
}

interface TableData {
  box?: [number, number, number, number];
  rows?: Array<Array<{ text: string; box?: [number, number, number, number] }>>;
}

interface PDFAnnotationViewerProps {
  extractedData: StructuredExtractedData[];
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
  onFieldUpdate?: (pageIndex: number, fieldKey: string, value: string) => void;
  onFieldKeyUpdate?: (pageIndex: number, oldKey: string, newKey: string) => void;
  onFieldDelete?: (pageIndex: number, fieldKey: string) => void;
  onFieldAdd?: (pageIndex: number) => void;
  onTableCellUpdate?: (
    pageIndex: number,
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    value: string
  ) => void;
  onTableAdd?: (pageIndex: number) => void;
  onTableDelete?: (pageIndex: number, tableIndex: number) => void;
  /** Résultat de validation des champs contre le dictionnaire */
  validationResult?: ValidationResult;
  /** Afficher les labels sur les bounding boxes */
  showLabels?: boolean;
}

type EditMode = 'key' | 'value' | null;

interface EditState {
  fieldKey: string;
  mode: EditMode;
  value: string;
}

/**
 * Normalise une chaîne pour la comparaison
 */
function normalizeString(str: string): string {
  // Comparaison stricte : ignore seulement la casse et les espaces en bord
  return str.toLowerCase().trim();
}

/**
 * Vérifie si une cellule correspond à une en-tête
 */
function isMatchingHeader(cellText: string, headers: string[]): boolean {
  const normalized = normalizeString(cellText);
  return headers.some((header) => normalizeString(header) === normalized);
}

export function PDFAnnotationViewer({
  extractedData,
  currentIndex = 0,
  onFieldUpdate,
  onFieldKeyUpdate,
  onFieldDelete,
  onFieldAdd,
  onTableCellUpdate,
  onTableAdd,
  onTableDelete,
  validationResult,
  showLabels = true,
}: PDFAnnotationViewerProps) {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [activeTab, setActiveTab] = useState<'forms' | 'tables'>('forms');
  const [recognizedTooltip, setRecognizedTooltip] = useState<Record<number, boolean>>({});
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const formsContainerRef = useRef<HTMLDivElement>(null);
  const fieldRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const currentData = extractedData[currentIndex];

  // Observer pour les changements de taille
  useEffect(() => {
    if (!imageRef.current || !currentData) return;

    const updateDimensions = () => {
      if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: rect.width,
          height: rect.height,
        });
      }
    };

    const img = imageRef.current;
    img.onload = () => {
      updateDimensions();
    };

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });

    resizeObserver.observe(img);
    return () => resizeObserver.disconnect();
  }, [currentData?.pageImage]);

  // Mettre à jour les dimensions de l'image
  useEffect(() => {
    if (!currentData || !currentData.pageImage) return;

    const img = new Image();
    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = currentData.pageImage;
  }, [currentData?.pageImage]);

  // Compteurs pour les onglets
  const tableRecognitionStats = useMemo(() => {
    if (!validationResult?.tableRecognition) return { recognized: 0, unrecognized: 0 };
    const recognized = validationResult.tableRecognition.filter((t) => t.isRecognized).length;
    const unrecognized = validationResult.tableRecognition.filter((t) => !t.isRecognized).length;
    return { recognized, unrecognized };
  }, [validationResult?.tableRecognition]);

  // Vérifier si on a des données
  if (!currentData) {
    return (
      <Card className="p-6 border-white/10 bg-white/5">
        <p className="text-center text-slate-400">Aucune donnée à afficher</p>
      </Card>
    );
  }

  // Calculer les coordonnées mises à l'échelle
  const getScaledCoordinates = (coords: [number, number, number, number]) => {
    if (containerDimensions.width === 0 || imageDimensions.width === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const [x1, y1, x2, y2] = coords;
    const scaleX = containerDimensions.width / imageDimensions.width;
    const scaleY = containerDimensions.height / imageDimensions.height;

    return {
      x: x1 * scaleX,
      y: y1 * scaleY,
      width: (x2 - x1) * scaleX,
      height: (y2 - y1) * scaleY,
    };
  };

  // Obtenir le statut de validation d'un champ
  const getFieldValidationStatus = (fieldKey: string): FieldValidationResult | undefined => {
    return validationResult?.fieldResults.find((r) => r.fieldKey === fieldKey);
  };

  // Obtenir le résultat de reconnaissance d'un tableau
  const getTableRecognition = (tableIndex: number): TableRecognitionResult | undefined => {
    return validationResult?.tableRecognition?.find((t) => t.tableIndex === tableIndex);
  };

  // Obtenir les classes CSS selon le statut de validation
  const getValidationClasses = (fieldKey: string): string => {
    const status = getFieldValidationStatus(fieldKey);
    if (!status) return 'border-blue-500 bg-blue-500/10';

    switch (status.status) {
      case 'valid':
        return 'border-emerald-500 bg-emerald-500/10';
      case 'extra':
        return 'border-orange-500 bg-orange-500/10';
      case 'missing':
        return 'border-red-500 bg-red-500/10';
      default:
        return 'border-blue-500 bg-blue-500/10';
    }
  };

  // Obtenir les classes pour le panel (thème dark)
  const getFieldPanelClasses = (fieldKey: string, isSelected: boolean): string => {
    const status = getFieldValidationStatus(fieldKey);
    const baseClasses = 'p-2 rounded-lg border transition-colors cursor-pointer';

    if (isSelected) {
      if (status?.status === 'extra') {
        return `${baseClasses} bg-orange-500/20 border-orange-500 ring-1 ring-orange-500`;
      }
      if (status?.status === 'valid') {
        return `${baseClasses} bg-emerald-500/20 border-emerald-500 ring-1 ring-emerald-500`;
      }
      return `${baseClasses} bg-primary/20 border-primary ring-1 ring-primary`;
    }

    if (status?.status === 'extra') {
      return `${baseClasses} border-orange-500/30 bg-orange-500/5 hover:border-orange-500/60`;
    }
    if (status?.status === 'valid') {
      return `${baseClasses} border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60`;
    }

    return `${baseClasses} border-white/10 bg-white/5 hover:border-white/20`;
  };

  const handleFieldClick = (fieldKey: string) => {
    setSelectedField(fieldKey);
    setActiveTab('forms');

    setTimeout(() => {
      const fieldElement = fieldRefsMap.current.get(fieldKey);
      if (fieldElement && formsContainerRef.current) {
        fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleFieldInPanelClick = (fieldKey: string) => {
    setSelectedField(fieldKey);

    if (containerRef.current) {
      const form = displayForms.find((f) => f.Key === fieldKey);
      if (form && form.box) {
        const scaled = getScaledCoordinates(form.box);
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const centerX = scaled.x + scaled.width / 2 - containerWidth / 2;
        const centerY = scaled.y + scaled.height / 2 - containerHeight / 2;

        containerRef.current.scrollLeft = Math.max(0, centerX);
        containerRef.current.scrollTop = Math.max(0, centerY);
      }
    }
  };

  const handleStartEditKey = (fieldKey: string, currentKey: string) => {
    setEditState({ fieldKey, mode: 'key', value: currentKey });
  };

  const handleStartEditValue = (fieldKey: string, currentValue: string) => {
    setEditState({ fieldKey, mode: 'value', value: currentValue });
  };

  const handleSaveEdit = () => {
    if (!editState) return;

    if (editState.mode === 'value' && onFieldUpdate) {
      onFieldUpdate(currentIndex, editState.fieldKey, editState.value);
    } else if (editState.mode === 'key' && onFieldKeyUpdate) {
      onFieldKeyUpdate(currentIndex, editState.fieldKey, editState.value);
    }

    setEditState(null);
  };

  const handleCancelEdit = () => {
    setEditState(null);
  };

  const handleDelete = (fieldKey: string) => {
    if (onFieldDelete) {
      onFieldDelete(currentIndex, fieldKey);
    }
  };

  const handleTableCellChange = (
    tableIndex: number,
    rowIndex: number,
    cellIndex: number,
    value: string
  ) => {
    if (onTableCellUpdate) {
      onTableCellUpdate(currentIndex, tableIndex, rowIndex, cellIndex, value);
    }
  };

  // Filter forms (exclude image)
  const displayForms: FormField[] =
    (currentData.forms as FormField[] | undefined)?.filter(
      (form) => form.Key?.toLowerCase() !== 'image'
    ) || [];
  const displayTables: TableData[] = currentData.tables || [];

  // Compter les champs par statut
  const validCount =
    validationResult?.fieldResults.filter((r) => r.status === 'valid').length || 0;
  const extraCount = validationResult?.extraFields.length || 0;

  const getLayoutIcon = (layout?: string) => {
    switch (layout) {
      case 'row':
        return <Rows3 className="h-3 w-3" />;
      case 'column':
        return <Columns3 className="h-3 w-3" />;
      case 'both':
        return <Grid3X3 className="h-3 w-3" />;
      default:
        return <Table2 className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-0 h-full">
      {/* Contenu principal - Layout 2 colonnes (7-5) */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-400px)]">
        {/* Colonne gauche: PDF avec bounding boxes (7/12) */}
        <div className="col-span-7 border border-white/10 rounded-lg overflow-hidden bg-slate-900/50">
          {currentData.pageImage ? (
            <div
              className="relative inline-block w-full h-full overflow-auto"
              ref={containerRef}
            >
              <img
                ref={imageRef}
                src={currentData.pageImage}
                alt={`Page ${currentIndex + 1}`}
                className="w-full h-auto block"
              />

              {/* Overlay avec bounding boxes */}
              <div className="absolute inset-0 pointer-events-none">
                {activeTab === 'forms' &&
                  displayForms.map((form, idx) => {
                    if (!form.box) return null;
                    const scaled = getScaledCoordinates(form.box);
                    if (scaled.width === 0 || scaled.height === 0) return null;

                    const isSelected = selectedField === form.Key;
                    const validationClasses = getValidationClasses(form.Key);
                    const fieldStatus = getFieldValidationStatus(form.Key);

                    return (
                      <div
                        key={`form-${idx}`}
                        className={`absolute border-2 transition-all pointer-events-auto cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/30 shadow-lg shadow-primary/20'
                            : validationClasses + ' hover:opacity-80'
                        }`}
                        style={{
                          left: `${scaled.x}px`,
                          top: `${scaled.y}px`,
                          width: `${scaled.width}px`,
                          height: `${scaled.height}px`,
                        }}
                        onClick={() => handleFieldClick(form.Key)}
                        title={`${form.Key}: ${form.Value}`}
                      >
                        {showLabels && (
                          <div
                            className={`absolute -top-5 -left-0.5 text-[0.6rem] px-1.5 py-0.5 rounded text-white whitespace-nowrap max-w-[150px] truncate shadow-lg ${
                              fieldStatus?.status === 'extra'
                                ? 'bg-orange-600'
                                : fieldStatus?.status === 'valid'
                                  ? 'bg-emerald-600'
                                  : 'bg-primary'
                            }`}
                          >
                            {form.Key.length > 20 ? form.Key.substring(0, 20) + '...' : form.Key}
                          </div>
                        )}
                      </div>
                    );
                  })}

                {activeTab === 'tables' &&
                  displayTables.map((table, tableIdx) => {
                    if (!table.box) return null;
                    const scaled = getScaledCoordinates(table.box);
                    if (scaled.width === 0 || scaled.height === 0) return null;

                    const recognition = getTableRecognition(tableIdx);
                    const isRecognized = recognition?.isRecognized ?? false;

                    return (
                      <div
                        key={`table-${tableIdx}`}
                        className={`absolute border-2 pointer-events-auto cursor-pointer ${
                          isRecognized
                            ? 'border-cyan-500 bg-cyan-500/10 hover:border-cyan-400'
                            : 'border-slate-500 bg-slate-500/10 hover:border-slate-400'
                        }`}
                        style={{
                          left: `${scaled.x}px`,
                          top: `${scaled.y}px`,
                          width: `${scaled.width}px`,
                          height: `${scaled.height}px`,
                        }}
                        title={
                          isRecognized
                            ? `Tableau reconnu: ${recognition?.matchedTemplate?.name}`
                            : 'Tableau non reconnu'
                        }
                      >
                        {showLabels && (
                          <div
                            className={`absolute -top-5 -left-0.5 text-[0.6rem] px-1.5 py-0.5 rounded text-white whitespace-nowrap shadow-lg flex items-center gap-1 ${
                              isRecognized ? 'bg-cyan-600' : 'bg-slate-600'
                            }`}
                          >
                            {getLayoutIcon(recognition?.matchedTemplate?.headerLayout)}
                            {isRecognized
                              ? recognition?.matchedTemplate?.name
                              : `Tableau ${tableIdx + 1}`}
                            {!isRecognized && <HelpCircle className="h-3 w-3" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-900/50">
              <p className="text-slate-500">Image de la page non disponible</p>
            </div>
          )}
        </div>

        {/* Colonne droite: Panel d'édition (5/12) */}
        <div className="col-span-5 flex flex-col overflow-hidden border border-white/10 rounded-lg bg-[#0d1018]">
          {/* Onglets avec indicateurs de validation */}
          <div className="flex-shrink-0 p-2 border-b border-white/10">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'forms' | 'tables')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 h-9 bg-white/5">
                <TabsTrigger
                  value="forms"
                  className="text-xs flex items-center gap-1 data-[state=active]:bg-primary/20 data-[state=active]:text-white"
                >
                  Valeurs ({displayForms.length})
                  {validationResult && (
                    <div className="flex gap-0.5 ml-1">
                      {validCount > 0 && (
                        <Badge className="h-4 px-1 text-[0.6rem] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          {validCount}
                        </Badge>
                      )}
                      {extraCount > 0 && (
                        <Badge className="h-4 px-1 text-[0.6rem] bg-orange-500/20 text-orange-400 border-orange-500/30">
                          {extraCount}
                        </Badge>
                      )}
                    </div>
                  )}
                </TabsTrigger>
                {displayTables.length > 0 && (
                  <TabsTrigger
                    value="tables"
                    className="text-xs data-[state=active]:bg-cyan-500/20 data-[state=active]:text-white"
                  >
                    Tableaux ({displayTables.length})
                    <div className="flex gap-0.5 ml-1">
                      {tableRecognitionStats.recognized > 0 && (
                        <Badge className="h-4 px-1 text-[0.6rem] bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                          {tableRecognitionStats.recognized}
                        </Badge>
                      )}
                      {tableRecognitionStats.unrecognized > 0 && (
                        <Badge className="h-4 px-1 text-[0.6rem] bg-slate-500/20 text-slate-400 border-slate-500/30">
                          {tableRecognitionStats.unrecognized}
                        </Badge>
                      )}
                    </div>
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          </div>

          {/* Contenu scrollable */}
          <ScrollArea className="flex-1" ref={formsContainerRef}>
            <div className="p-3">
              {activeTab === 'forms' && (
                <div className="flex justify-end mb-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 h-7 px-2"
                    onClick={() => onFieldAdd?.(currentIndex)}
                  >
                    + Ajouter un champ
                  </Button>
                </div>
              )}

              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'forms' | 'tables')}
                className="h-full"
              >
                {/* Onglet Valeurs - Grid 2 colonnes */}
                <TabsContent value="forms" className="space-y-0 mt-0">
                  {displayForms.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                      <p className="text-center text-slate-500 text-sm">Aucun champ détecté</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {displayForms.map((form, index) => {
                        const isFieldSelected = selectedField === form.Key;
                        const fieldStatus = getFieldValidationStatus(form.Key);
                        const isEditingKey =
                          editState?.fieldKey === form.Key && editState.mode === 'key';
                        const isEditingValue =
                          editState?.fieldKey === form.Key && editState.mode === 'value';

                        return (
                          <div
                            key={index}
                            ref={(el) => {
                              if (el) fieldRefsMap.current.set(form.Key, el);
                            }}
                            className={getFieldPanelClasses(form.Key, isFieldSelected)}
                            onClick={() => handleFieldInPanelClick(form.Key)}
                          >
                            {/* Header avec clé et actions */}
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <div className="flex-1 min-w-0">
                                {isEditingKey && editState ? (
                                  <Input
                                    value={editState.value}
                                    onChange={(e) =>
                                      setEditState({ ...editState, value: e.target.value })
                                    }
                                    autoFocus
                                    className="text-xs h-5 px-1 bg-white/10 border-white/20 text-white"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEdit();
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                  />
                                ) : (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1">
                                          <p
                                            className={`text-[0.65rem] font-medium uppercase tracking-wider truncate cursor-pointer hover:text-primary ${
                                              fieldStatus?.status === 'extra'
                                                ? 'text-orange-400'
                                                : fieldStatus?.status === 'valid'
                                                  ? 'text-emerald-400'
                                                  : 'text-slate-400'
                                            }`}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStartEditKey(form.Key, form.Key);
                                            }}
                                          >
                                            {form.Key}
                                          </p>
                                          {fieldStatus?.status === 'extra' && (
                                            <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                                          )}
                                          {fieldStatus?.status === 'valid' && (
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="max-w-xs bg-slate-800 border-white/10 text-white"
                                      >
                                        <p className="text-xs">
                                          {fieldStatus?.status === 'extra'
                                            ? `⚠️ "${form.Key}" n'est pas un champ attendu`
                                            : fieldStatus?.status === 'valid'
                                              ? `✓ Correspond à "${fieldStatus.matchedDictionaryField?.key}"`
                                              : 'Cliquez pour modifier la clé'}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>

                              {/* Actions */}
                              {!editState && (
                                <div className="flex gap-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEditKey(form.Key, form.Key);
                                    }}
                                    className="p-0.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded flex-shrink-0"
                                    title="Modifier la clé"
                                  >
                                    <Edit2 className="h-2.5 w-2.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(form.Key);
                                    }}
                                    className="p-0.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded flex-shrink-0"
                                    title="Supprimer"
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              )}

                              {(isEditingKey || isEditingValue) && (
                                <div className="flex gap-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveEdit();
                                    }}
                                    className="p-0.5 text-emerald-400 hover:bg-emerald-500/10 rounded"
                                  >
                                    <Check className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancelEdit();
                                    }}
                                    className="p-0.5 text-red-400 hover:bg-red-500/10 rounded"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Valeur */}
                            {isEditingValue && editState ? (
                              <Input
                                value={editState.value}
                                onChange={(e) =>
                                  setEditState({ ...editState, value: e.target.value })
                                }
                                autoFocus
                                className="text-xs h-6 bg-white/10 border-white/20 text-white"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit();
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                              />
                            ) : (
                              <div
                                className="flex items-center justify-between gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditValue(form.Key, form.Value);
                                }}
                              >
                                <p className="text-xs font-mono text-white break-words flex-1 line-clamp-2 cursor-pointer hover:text-primary">
                                  {form.Value || '-'}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Onglet Tableaux */}
              {displayTables.length > 0 && (
                <TabsContent value="tables" className="space-y-4 mt-0">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-400">
                      Tableaux reconnus/non reconnus : {tableRecognitionStats.recognized} / {tableRecognitionStats.unrecognized}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/30 h-7 px-2"
                      onClick={() => onTableAdd?.(currentIndex)}
                    >
                      + Ajouter un tableau
                    </Button>
                  </div>

                  {displayTables.map((table, tableIdx) => {
                      const recognition = getTableRecognition(tableIdx);
                      const isRecognized = recognition?.isRecognized ?? false;
                      const template = recognition?.matchedTemplate;

                      // Créer des sets pour vérification rapide
                      const foundColHeaders = new Set(recognition?.foundColumnHeaders || []);
                      const foundRowHeaders = new Set(recognition?.foundRowHeaders || []);
                      const allFoundHeaders = [
                        ...(recognition?.foundColumnHeaders || []),
                        ...(recognition?.foundRowHeaders || []),
                      ];

                      return (
                        <div
                          key={tableIdx}
                          className={`rounded-lg border overflow-hidden ${
                            isRecognized
                              ? 'border-cyan-500/30 bg-cyan-500/5'
                              : 'border-slate-500/30 bg-slate-500/5'
                          }`}
                        >
                          {/* Header du tableau */}
                          <div
                            className={`px-3 py-2 border-b ${
                              isRecognized
                                ? 'border-cyan-500/30 bg-cyan-500/10'
                                : 'border-slate-500/30 bg-slate-500/10'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {getLayoutIcon(template?.headerLayout)}
                                <span className="text-sm font-medium text-white">
                                  {isRecognized ? template?.name : `Tableau ${tableIdx + 1}`}
                                </span>
                                {isRecognized ? (
                                  <Badge className="text-[0.65rem] bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {Math.round(recognition?.matchPercentage || 0)}%
                                  </Badge>
                                ) : (
                                  <Badge className="text-[0.65rem] bg-slate-500/20 text-slate-400 border-slate-500/30">
                                    <HelpCircle className="h-3 w-3 mr-1" />
                                    Non reconnu
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10"
                                  title="Reconnaissance du tableau"
                                  onClick={() => {
                                    const existingStatus = recognizedTooltip[tableIdx];
                                    setRecognizedTooltip((prev) => ({
                                      ...prev,
                                      [tableIdx]: !existingStatus,
                                    }));
                                  }}
                                >
                                  {isRecognized ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-orange-400" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-400 hover:text-white hover:bg-red-500/10"
                                  title="Supprimer le tableau"
                                  onClick={() => onTableDelete?.(currentIndex, tableIdx)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Indicateurs pour tableaux reconnus */}
                            {isRecognized && recognition && (
                              <div className="mt-2 space-y-1.5">
                                {/* En-têtes de colonnes */}
                                {template?.headerLayout !== 'column' && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[0.6rem] text-slate-500 w-16">Colonnes:</span>
                                    {recognition.foundColumnHeaders.map((h, i) => (
                                      <Badge
                                        key={`col-found-${i}`}
                                        className="text-[0.55rem] px-1 py-0 h-4 bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                      >
                                        ✓ {h}
                                      </Badge>
                                    ))}
                                    {recognition.missingColumnHeaders.map((h, i) => (
                                      <Badge
                                        key={`col-miss-${i}`}
                                        className="text-[0.55rem] px-1 py-0 h-4 bg-red-500/20 text-red-300 border-red-500/30"
                                      >
                                        ✗ {h}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                {/* En-têtes de lignes */}
                                {template?.headerLayout !== 'row' && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[0.6rem] text-slate-500 w-16">Lignes:</span>
                                    {recognition.foundRowHeaders.map((h, i) => (
                                      <Badge
                                        key={`row-found-${i}`}
                                        className="text-[0.55rem] px-1 py-0 h-4 bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                                      >
                                        ✓ {h}
                                      </Badge>
                                    ))}
                                    {recognition.missingRowHeaders.map((h, i) => (
                                      <Badge
                                        key={`row-miss-${i}`}
                                        className="text-[0.55rem] px-1 py-0 h-4 bg-red-500/20 text-red-300 border-red-500/30"
                                      >
                                        ✗ {h}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Contenu du tableau */}
                          <div className="p-2 overflow-auto">
                            <table className="w-full text-[0.65rem] border-collapse">
                              <tbody>
                                {(table.rows || []).map((row, rowIdx) => (
                                  <tr key={rowIdx}>
                                    {row.map((cell, cellIdx) => {
                                      // Déterminer si cette cellule est une en-tête reconnue
                                      const isColumnHeader =
                                        isRecognized &&
                                        (template?.headerLayout === 'row' || template?.headerLayout === 'both') &&
                                        rowIdx === 0 &&
                                        isMatchingHeader(cell.text, Array.from(foundColHeaders));
                                      const isRowHeader =
                                        isRecognized &&
                                        (template?.headerLayout === 'column' || template?.headerLayout === 'both') &&
                                        cellIdx === 0 &&
                                        isMatchingHeader(cell.text, Array.from(foundRowHeaders));
                                      const isAnyHeader =
                                        isRecognized && isMatchingHeader(cell.text, allFoundHeaders);

                                      let cellClass = 'border border-white/10 p-1';
                                      let inputClass = 'h-5 text-[0.65rem] p-0.5 min-w-[60px] bg-transparent border-0 text-white focus:bg-white/5';

                                      if (isColumnHeader) {
                                        cellClass = 'border border-emerald-500/30 p-1 bg-emerald-500/15';
                                        inputClass += ' font-semibold text-emerald-300';
                                      } else if (isRowHeader) {
                                        cellClass = 'border border-cyan-500/30 p-1 bg-cyan-500/15';
                                        inputClass += ' font-semibold text-cyan-300';
                                      } else if (isAnyHeader) {
                                        cellClass = 'border border-slate-500/30 p-1 bg-slate-500/10';
                                        inputClass += ' font-medium text-slate-300';
                                      }

                                      return (
                                        <td key={cellIdx} className={cellClass}>
                                          <Input
                                            value={cell.text || ''}
                                            onChange={(e) => {
                                              handleTableCellChange(
                                                tableIdx,
                                                rowIdx,
                                                cellIdx,
                                                e.target.value
                                              );
                                            }}
                                            className={inputClass}
                                            placeholder=""
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
