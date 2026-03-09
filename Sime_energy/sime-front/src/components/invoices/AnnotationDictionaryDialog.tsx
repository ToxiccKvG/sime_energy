/**
 * Dialog pour visualiser et modifier les dictionnaires d'annotation
 * Permet de créer, modifier et supprimer des dictionnaires
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RotateCcw,
  FileText,
  Table2,
  AlertTriangle,
  Grid3X3,
  Rows3,
  Columns3,
  Loader2,
  MoreVertical,
  FolderPlus,
  Palette,
} from 'lucide-react';
import type { AnnotationDictionary, AnnotationField, TableTemplate } from '@/types/annotation-dictionary';
import { DICTIONARY_COLORS } from '@/types/annotation-dictionary';
import { TableTemplateEditor } from './TableTemplateEditor';

interface AnnotationDictionaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dictionaries: AnnotationDictionary[];
  currentDictionary: AnnotationDictionary | null;
  onSelectDictionary: (id: string) => void;
  onCreateDictionary: (dict: Omit<AnnotationDictionary, 'id' | 'createdAt' | 'updatedAt'>) => Promise<AnnotationDictionary>;
  onUpdateDictionary: (id: string, updates: Partial<AnnotationDictionary>) => void;
  onDeleteDictionary: (id: string) => void;
  onAddField: (field: Omit<AnnotationField, 'id'>) => void;
  onUpdateField: (id: string, updates: Partial<AnnotationField>) => void;
  onRemoveField: (id: string) => void;
  onAddTableTemplate: (template: Omit<TableTemplate, 'id'>) => void;
  onUpdateTableTemplate: (id: string, updates: Partial<TableTemplate>) => void;
  onRemoveTableTemplate: (id: string) => void;
  onResetToDefault: () => void;
  isSaving?: boolean;
}

interface FieldEditState {
  id: string;
  key: string;
  description: string;
  required: boolean;
}

export function AnnotationDictionaryDialog({
  open,
  onOpenChange,
  dictionaries,
  currentDictionary,
  onSelectDictionary,
  onCreateDictionary,
  onUpdateDictionary,
  onDeleteDictionary,
  onAddField,
  onUpdateField,
  onRemoveField,
  onAddTableTemplate,
  onUpdateTableTemplate,
  onRemoveTableTemplate,
  onResetToDefault,
  isSaving = false,
}: AnnotationDictionaryDialogProps) {
  // États pour les champs
  const [editingField, setEditingField] = useState<FieldEditState | null>(null);
  const [isAddingField, setIsAddingField] = useState(false);
  const [newField, setNewField] = useState<FieldEditState>({
    id: '',
    key: '',
    description: '',
    required: false,
  });

  // États pour les modèles de tableaux
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Omit<TableTemplate, 'id'> | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState<Omit<TableTemplate, 'id'>>({
    name: '',
    description: '',
    headerLayout: 'row',
    columnCount: 0,
    rowCount: 0,
    columnHeaders: [],
    rowHeaders: [],
    required: false,
    excelMappings: [],
  });

  // États pour la gestion des dictionnaires
  const [isCreatingDict, setIsCreatingDict] = useState(false);
  const [newDictName, setNewDictName] = useState('');
  const [newDictDescription, setNewDictDescription] = useState('');
  const [newDictColor, setNewDictColor] = useState(DICTIONARY_COLORS[0].value);
  const [isEditingDictMeta, setIsEditingDictMeta] = useState(false);
  const [editDictMeta, setEditDictMeta] = useState({ name: '', description: '', color: '' });

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const dictionary = currentDictionary;

  // === Handlers pour les champs ===
  const handleStartEditField = (field: AnnotationField) => {
    setEditingField({
      id: field.id,
      key: field.key,
      description: field.description || '',
      required: field.required,
    });
  };

  const handleSaveField = () => {
    if (!editingField) return;
    onUpdateField(editingField.id, {
      key: editingField.key,
      description: editingField.description || undefined,
      required: editingField.required,
    });
    setEditingField(null);
  };

  const handleAddField = () => {
    if (!newField.key.trim()) return;
    onAddField({
      key: newField.key.trim(),
      description: newField.description || undefined,
      required: newField.required,
      category: 'forms',
    });
    setNewField({ id: '', key: '', description: '', required: false });
    setIsAddingField(false);
  };

  // === Handlers pour les modèles de tableaux ===
  const handleStartEditTemplate = (template: TableTemplate) => {
    setEditingTemplateId(template.id);
    setEditingTemplate({
      name: template.name,
      description: template.description,
      headerLayout: template.headerLayout,
      columnCount: template.columnCount,
      rowCount: template.rowCount,
      columnHeaders: [...template.columnHeaders],
      rowHeaders: [...template.rowHeaders],
      required: template.required,
      excelMappings: template.excelMappings ?? [],
    });
  };

  const handleSaveTemplate = () => {
    if (!editingTemplateId || !editingTemplate) return;
    onUpdateTableTemplate(editingTemplateId, editingTemplate);
    setEditingTemplateId(null);
    setEditingTemplate(null);
  };

  const handleAddTemplate = () => {
    if (!newTemplate.name.trim()) return;
    onAddTableTemplate(newTemplate);
    setNewTemplate({
      name: '',
      description: '',
      headerLayout: 'row',
      columnCount: 0,
      rowCount: 0,
      columnHeaders: [],
      rowHeaders: [],
      required: false,
      excelMappings: [],
    });
    setIsAddingTemplate(false);
  };

  // === Handlers pour les dictionnaires ===
  const handleCreateDictionary = async () => {
    if (!newDictName.trim()) return;
    try {
      const created = await onCreateDictionary({
        name: newDictName.trim(),
        description: newDictDescription || undefined,
        color: newDictColor,
        fields: [],
        tableTemplates: [],
      });
      onSelectDictionary(created.id);
      setIsCreatingDict(false);
      setNewDictName('');
      setNewDictDescription('');
      setNewDictColor(DICTIONARY_COLORS[0].value);
    } catch (error) {
      console.error('Error creating dictionary:', error);
    }
  };

  const handleStartEditDictMeta = () => {
    if (!dictionary) return;
    setEditDictMeta({
      name: dictionary.name,
      description: dictionary.description || '',
      color: dictionary.color || DICTIONARY_COLORS[0].value,
    });
    setIsEditingDictMeta(true);
  };

  const handleSaveDictMeta = () => {
    if (!dictionary || !editDictMeta.name.trim()) return;
    onUpdateDictionary(dictionary.id, {
      name: editDictMeta.name.trim(),
      description: editDictMeta.description || undefined,
      color: editDictMeta.color,
    });
    setIsEditingDictMeta(false);
  };

  const handleConfirmReset = () => {
    onResetToDefault();
    setResetConfirmOpen(false);
  };

  const handleConfirmDelete = () => {
    if (dictionary) {
      onDeleteDictionary(dictionary.id);
    }
    setDeleteConfirmOpen(false);
  };

  const getLayoutIcon = (layout: string) => {
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

  const getLayoutLabel = (layout: string) => {
    switch (layout) {
      case 'row':
        return 'Ligne';
      case 'column':
        return 'Colonne';
      case 'both':
        return 'Double';
      default:
        return layout;
    }
  };

  const requiredFieldsCount = dictionary?.fields.filter((f) => f.required).length || 0;
  const optionalFieldsCount = (dictionary?.fields.length || 0) - requiredFieldsCount;
  const requiredTablesCount = dictionary?.tableTemplates.filter((t) => t.required).length || 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col border-white/10 bg-[#0b0d14] text-slate-50 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-slate-50">
                <FileText className="h-5 w-5 text-emerald-500" />
                Dictionnaires d'annotation
              </DialogTitle>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>
            <DialogDescription className="text-slate-400">
              Gérez vos dictionnaires pour différents types de factures
            </DialogDescription>
          </DialogHeader>

          {/* Sélecteur de dictionnaire */}
          <div className="px-6 pb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Select
                  value={dictionary?.id || ''}
                  onValueChange={onSelectDictionary}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <div className="flex items-center gap-2">
                      {dictionary?.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: dictionary.color }}
                        />
                      )}
                      <SelectValue placeholder="Sélectionner un dictionnaire" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-[#0b0d14] border-white/10">
                    {dictionaries.map((dict) => (
                      <SelectItem
                        key={dict.id}
                        value={dict.id}
                        className="text-white hover:bg-white/10 focus:bg-white/10"
                      >
                        <div className="flex items-center gap-2">
                          {dict.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: dict.color }}
                            />
                          )}
                          <span>{dict.name}</span>
                          <span className="text-slate-500 text-xs">
                            ({dict.fields.length} champs)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreatingDict(true)}
                className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 bg-transparent"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Nouveau
              </Button>

              {dictionary && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-[#0b0d14] border-white/10"
                  >
                    <DropdownMenuItem
                      onClick={handleStartEditDictMeta}
                      className="text-slate-300 hover:text-white hover:bg-white/10 focus:bg-white/10"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Modifier le dictionnaire
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
                      disabled={dictionaries.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Formulaire de création */}
            {isCreatingDict && (
              <div className="mt-4 p-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-400">Nom</label>
                    <Input
                      value={newDictName}
                      onChange={(e) => setNewDictName(e.target.value)}
                      className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                      placeholder="Ex: Moyenne Tension"
                      autoFocus
                    />
                  </div>
                  <div className="w-32">
                    <label className="text-xs font-medium text-slate-400">Couleur</label>
                    <Select value={newDictColor} onValueChange={setNewDictColor}>
                      <SelectTrigger className="mt-1 h-8 bg-white/5 border-white/10 text-white">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: newDictColor }}
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-[#0b0d14] border-white/10">
                        {DICTIONARY_COLORS.map((color) => (
                          <SelectItem
                            key={color.value}
                            value={color.value}
                            className="text-white hover:bg-white/10"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: color.value }}
                              />
                              <span>{color.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400">Description</label>
                  <Input
                    value={newDictDescription}
                    onChange={(e) => setNewDictDescription(e.target.value)}
                    className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                    placeholder="Description optionnelle"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsCreatingDict(false);
                      setNewDictName('');
                      setNewDictDescription('');
                    }}
                    className="text-slate-400 hover:text-white"
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateDictionary}
                    disabled={!newDictName.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Créer
                  </Button>
                </div>
              </div>
            )}

            {/* Formulaire d'édition des métadonnées */}
            {isEditingDictMeta && (
              <div className="mt-4 p-4 rounded-lg border border-cyan-500/50 bg-cyan-500/10 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-slate-400">Nom</label>
                    <Input
                      value={editDictMeta.name}
                      onChange={(e) =>
                        setEditDictMeta({ ...editDictMeta, name: e.target.value })
                      }
                      className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div className="w-32">
                    <label className="text-xs font-medium text-slate-400">Couleur</label>
                    <Select
                      value={editDictMeta.color}
                      onValueChange={(v) => setEditDictMeta({ ...editDictMeta, color: v })}
                    >
                      <SelectTrigger className="mt-1 h-8 bg-white/5 border-white/10 text-white">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: editDictMeta.color }}
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-[#0b0d14] border-white/10">
                        {DICTIONARY_COLORS.map((color) => (
                          <SelectItem
                            key={color.value}
                            value={color.value}
                            className="text-white hover:bg-white/10"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: color.value }}
                              />
                              <span>{color.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400">Description</label>
                  <Input
                    value={editDictMeta.description}
                    onChange={(e) =>
                      setEditDictMeta({ ...editDictMeta, description: e.target.value })
                    }
                    className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingDictMeta(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveDictMeta}
                    disabled={!editDictMeta.name.trim()}
                    className="bg-cyan-600 hover:bg-cyan-700"
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
            )}
          </div>

          {dictionary && !isCreatingDict && !isEditingDictMeta && (
            <Tabs defaultValue="fields" className="flex-1 flex flex-col min-h-0 px-6">
              <TabsList className="grid w-full grid-cols-2 bg-white/5 flex-shrink-0">
                <TabsTrigger
                  value="fields"
                  className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Champs ({dictionary.fields.length})
                </TabsTrigger>
                <TabsTrigger
                  value="tables"
                  className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300"
                >
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  Modèles tableaux ({dictionary.tableTemplates.length})
                </TabsTrigger>
              </TabsList>

              {/* === ONGLET CHAMPS === */}
              <TabsContent
                value="fields"
                className="flex-1 flex flex-col min-h-0 mt-4 data-[state=inactive]:hidden"
              >
                <div className="flex gap-4 pb-3 flex-shrink-0">
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    {requiredFieldsCount} obligatoire{requiredFieldsCount > 1 ? 's' : ''}
                  </Badge>
                  <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                    {optionalFieldsCount} optionnel{optionalFieldsCount > 1 ? 's' : ''}
                  </Badge>
                </div>

                <Separator className="bg-white/10 flex-shrink-0" />

                <ScrollArea className="flex-1 min-h-0 mt-3">
                  <div className="space-y-2 pb-4 pr-4">
                    {dictionary.fields.map((field) => {
                      const isEditing = editingField?.id === field.id;

                      if (isEditing && editingField) {
                        return (
                          <div
                            key={field.id}
                            className="p-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 space-y-3"
                          >
                            <div>
                              <label className="text-xs font-medium text-slate-400">
                                Nom du champ
                              </label>
                              <Input
                                value={editingField.key}
                                onChange={(e) =>
                                  setEditingField({ ...editingField, key: e.target.value })
                                }
                                className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-slate-400">
                                Description
                              </label>
                              <Input
                                value={editingField.description}
                                onChange={(e) =>
                                  setEditingField({
                                    ...editingField,
                                    description: e.target.value,
                                  })
                                }
                                className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={editingField.required}
                                  onCheckedChange={(checked) =>
                                    setEditingField({ ...editingField, required: checked })
                                  }
                                />
                                <span className="text-sm text-slate-300">Obligatoire</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingField(null)}
                                  className="text-slate-400 hover:text-white hover:bg-white/10"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveField}
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={field.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-white truncate">
                                {field.key}
                              </span>
                              {field.required && (
                                <Badge className="text-[0.65rem] px-1.5 py-0 h-4 bg-red-500/20 text-red-400 border-red-500/30">
                                  Obligatoire
                                </Badge>
                              )}
                            </div>
                            {field.description && (
                              <p className="text-xs text-slate-500 mt-0.5 truncate">
                                {field.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                              onClick={() => handleStartEditField(field)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => onRemoveField(field.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Ajout de champ */}
                    {isAddingField ? (
                      <div className="p-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-400">
                            Nom du champ
                          </label>
                          <Input
                            value={newField.key}
                            onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                            className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                            placeholder="Ex: Montant TTC"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-400">
                            Description
                          </label>
                          <Input
                            value={newField.description}
                            onChange={(e) =>
                              setNewField({ ...newField, description: e.target.value })
                            }
                            className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                            placeholder="Description optionnelle"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={newField.required}
                              onCheckedChange={(checked) =>
                                setNewField({ ...newField, required: checked })
                              }
                            />
                            <span className="text-sm text-slate-300">Obligatoire</span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setIsAddingField(false);
                                setNewField({ id: '', key: '', description: '', required: false });
                              }}
                              className="text-slate-400 hover:text-white hover:bg-white/10"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleAddField}
                              disabled={!newField.key.trim()}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full border-dashed border-white/20 text-slate-400 hover:text-white hover:bg-white/5"
                        onClick={() => setIsAddingField(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter un champ
                      </Button>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* === ONGLET MODÈLES DE TABLEAUX === */}
              <TabsContent
                value="tables"
                className="flex-1 flex flex-col min-h-0 mt-4 data-[state=inactive]:hidden"
              >
                <div className="flex gap-4 pb-3 flex-shrink-0">
                  <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                    {dictionary.tableTemplates.length} modèle
                    {dictionary.tableTemplates.length > 1 ? 's' : ''}
                  </Badge>
                  {requiredTablesCount > 0 && (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                      {requiredTablesCount} obligatoire{requiredTablesCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                <Separator className="bg-white/10 flex-shrink-0" />

                <ScrollArea className="flex-1 min-h-0 mt-3">
                  <div className="space-y-3 pb-4 pr-4">
                    {dictionary.tableTemplates.map((template) => {
                      const isEditing = editingTemplateId === template.id;

                      if (isEditing && editingTemplate) {
                        return (
                          <div
                            key={template.id}
                            className="p-4 rounded-lg border border-cyan-500/50 bg-cyan-500/10"
                          >
                            <TableTemplateEditor
                              template={{ ...editingTemplate, id: template.id }}
                              onChange={(t) => setEditingTemplate(t)}
                              onSave={handleSaveTemplate}
                              onCancel={() => {
                                setEditingTemplateId(null);
                                setEditingTemplate(null);
                              }}
                            />
                          </div>
                        );
                      }

                      return (
                        <div
                          key={template.id}
                          className="p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Table2 className="h-5 w-5 text-cyan-400" />
                              <span className="font-medium text-white">{template.name}</span>
                              <Badge className="text-[0.6rem] px-1.5 py-0 h-4 bg-slate-500/20 text-slate-300 border-slate-500/30">
                                {getLayoutIcon(template.headerLayout)}
                                <span className="ml-1">{getLayoutLabel(template.headerLayout)}</span>
                              </Badge>
                              {template.required && (
                                <Badge className="text-[0.6rem] px-1.5 py-0 h-4 bg-red-500/20 text-red-400 border-red-500/30">
                                  Obligatoire
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
                                onClick={() => handleStartEditTemplate(template)}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => onRemoveTableTemplate(template.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {template.description && (
                            <p className="text-xs text-slate-500 mb-2">{template.description}</p>
                          )}

                          {/* Mini preview */}
                          <div className="border border-white/10 rounded overflow-hidden bg-slate-900/50">
                            <table className="w-full text-[0.65rem]">
                              <tbody>
                                {(template.headerLayout === 'row' ||
                                  template.headerLayout === 'both') && (
                                  <tr>
                                    {template.headerLayout === 'both' && (
                                      <td className="border-r border-b border-white/10 p-1.5 bg-slate-700/30 text-slate-500 text-center w-20" />
                                    )}
                                    {template.columnHeaders.slice(0, 4).map((header, idx) => (
                                      <td
                                        key={idx}
                                        className="border-r border-b border-emerald-500/20 p-1.5 bg-emerald-500/10 text-emerald-300 text-center font-medium"
                                      >
                                        {header.length > 12
                                          ? header.substring(0, 12) + '...'
                                          : header}
                                      </td>
                                    ))}
                                    {template.columnHeaders.length > 4 && (
                                      <td className="border-b border-white/10 p-1.5 text-slate-500 text-center">
                                        +{template.columnHeaders.length - 4}
                                      </td>
                                    )}
                                  </tr>
                                )}

                                {(template.headerLayout === 'column' ||
                                  template.headerLayout === 'both') &&
                                  template.rowHeaders.slice(0, 3).map((rowHeader, rowIdx) => (
                                    <tr key={rowIdx}>
                                      <td className="border-r border-b border-cyan-500/20 p-1.5 bg-cyan-500/10 text-cyan-300 font-medium w-20">
                                        {rowHeader.length > 12
                                          ? rowHeader.substring(0, 12) + '...'
                                          : rowHeader}
                                      </td>
                                      {template.headerLayout === 'both' &&
                                        template.columnHeaders.slice(0, 4).map((_, colIdx) => (
                                          <td
                                            key={colIdx}
                                            className="border-r border-b border-white/10 p-1.5 text-slate-600 text-center"
                                          >
                                            •
                                          </td>
                                        ))}
                                      {template.headerLayout === 'column' &&
                                        [0, 1, 2].map((colIdx) => (
                                          <td
                                            key={colIdx}
                                            className="border-r border-b border-white/10 p-1.5 text-slate-600 text-center"
                                          >
                                            •
                                          </td>
                                        ))}
                                    </tr>
                                  ))}

                                {template.headerLayout === 'row' && (
                                  <tr>
                                    {template.columnHeaders.slice(0, 4).map((_, idx) => (
                                      <td
                                        key={idx}
                                        className="border-r border-white/10 p-1.5 text-slate-600 text-center"
                                      >
                                        •
                                      </td>
                                    ))}
                                    {template.columnHeaders.length > 4 && (
                                      <td className="p-1.5 text-slate-600 text-center">•</td>
                                    )}
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}

                    {/* Ajout de modèle */}
                    {isAddingTemplate ? (
                      <div className="p-4 rounded-lg border border-emerald-500/50 bg-emerald-500/10">
                        <TableTemplateEditor
                          template={newTemplate}
                          onChange={setNewTemplate}
                          onSave={handleAddTemplate}
                          onCancel={() => {
                            setIsAddingTemplate(false);
                            setNewTemplate({
                              name: '',
                              description: '',
                              headerLayout: 'row',
                              columnCount: 0,
                              rowCount: 0,
                              columnHeaders: [],
                              rowHeaders: [],
                              required: false,
                            });
                          }}
                          isNew
                        />
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full border-dashed border-white/20 text-slate-400 hover:text-white hover:bg-white/5"
                        onClick={() => setIsAddingTemplate(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter un modèle de tableau
                      </Button>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <Separator className="bg-white/10 mx-6" />

          <DialogFooter className="flex-row justify-between sm:justify-between px-6 pb-6 pt-4 flex-shrink-0">
            <Button
              variant="outline"
              className="text-orange-400 border-orange-400/30 hover:bg-orange-500/10 bg-transparent"
              onClick={() => setResetConfirmOpen(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Tout réinitialiser
            </Button>
            <Button onClick={() => onOpenChange(false)} className="bg-slate-700 hover:bg-slate-600">
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation reset */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0b0d14] text-slate-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-50">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Tout réinitialiser ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action va supprimer tous vos dictionnaires personnalisés et restaurer le
              dictionnaire par défaut.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReset}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Réinitialiser
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmation suppression */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="border-white/10 bg-[#0b0d14] text-slate-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-slate-50">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Supprimer ce dictionnaire ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Le dictionnaire "{dictionary?.name}" sera définitivement supprimé avec tous ses
              champs et modèles de tableaux.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
