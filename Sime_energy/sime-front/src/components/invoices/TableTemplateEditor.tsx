/**
 * Éditeur visuel de template de tableau
 * Permet de définir la structure d'un tableau avec ses en-têtes
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, X, Rows3, Columns3, Grid3X3, Check } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  TableTemplate,
  TableHeaderLayout,
  ExcelMapping,
  ExcelMappingTransform,
} from '@/types/annotation-dictionary';

interface TableTemplateEditorProps {
  template: Omit<TableTemplate, 'id'> & { id?: string };
  onChange: (template: Omit<TableTemplate, 'id'> & { id?: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}

export function TableTemplateEditor({
  template,
  onChange,
  onSave,
  onCancel,
  isNew = false,
}: TableTemplateEditorProps) {
  const [newColumnHeader, setNewColumnHeader] = useState('');
  const [newRowHeader, setNewRowHeader] = useState('');
  const excelMappings = template.excelMappings ?? [];
  const [mappingTarget, setMappingTarget] = useState('');
  const [mappingTransform, setMappingTransform] = useState<ExcelMappingTransform>('string');
  const [mappingDefault, setMappingDefault] = useState('');
  const [selectedSource, setSelectedSource] = useState<ExcelMapping['source'] | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);

  const handleAddColumnHeader = () => {
    if (!newColumnHeader.trim()) return;
    if (!template.columnHeaders.includes(newColumnHeader.trim())) {
      onChange({
        ...template,
        columnHeaders: [...template.columnHeaders, newColumnHeader.trim()],
        columnCount: template.columnHeaders.length + 1,
      });
    }
    setNewColumnHeader('');
  };

  const handleRemoveColumnHeader = (header: string) => {
    onChange({
      ...template,
      columnHeaders: template.columnHeaders.filter((h) => h !== header),
      columnCount: Math.max(0, template.columnHeaders.length - 1),
    });
  };

  const handleAddRowHeader = () => {
    if (!newRowHeader.trim()) return;
    if (!template.rowHeaders.includes(newRowHeader.trim())) {
      onChange({
        ...template,
        rowHeaders: [...template.rowHeaders, newRowHeader.trim()],
        rowCount: template.rowHeaders.length + 1,
      });
    }
    setNewRowHeader('');
  };

  const handleRemoveRowHeader = (header: string) => {
    onChange({
      ...template,
      rowHeaders: template.rowHeaders.filter((h) => h !== header),
      rowCount: Math.max(0, template.rowHeaders.length - 1),
    });
  };

  const handleLayoutChange = (layout: TableHeaderLayout) => {
    onChange({
      ...template,
      headerLayout: layout,
      // Reset les en-têtes non utilisées selon le layout
      rowHeaders: layout === 'row' ? [] : template.rowHeaders,
      columnHeaders: layout === 'column' ? [] : template.columnHeaders,
    });
  };

  const handleCellSelect = (rowIdx: number, colIdx: number) => {
    // Le mapping doit se faire sur les valeurs (cellules de données), pas sur les en-têtes
    let source: ExcelMapping['source'] = {};

    if (template.headerLayout === 'both') {
      const column = template.columnHeaders[colIdx];
      const rowHeader = template.rowHeaders[rowIdx];
      source = {
        column,
        rowHeader,
        combine: { column, rowHeader },
      };
    } else if (template.headerLayout === 'row') {
      source = {
        column: template.columnHeaders[colIdx],
        rowIndex: rowIdx,
      };
    } else {
      source = {
        rowHeader: template.rowHeaders[rowIdx],
        colIndex: colIdx,
      };
    }

    setSelectedSource(source);
    setSelectedCell({ row: rowIdx, col: colIdx });
  };

  const formatSource = (source: ExcelMapping['source']) => {
    if (source.column && source.rowHeader) return `${source.rowHeader} × ${source.column}`;
    if (source.column && source.rowIndex !== undefined) return `${source.column} (ligne ${source.rowIndex + 1})`;
    if (source.rowHeader && source.colIndex !== undefined)
      return `${source.rowHeader} (col ${source.colIndex + 1})`;
    if (source.column) return source.column;
    if (source.rowHeader) return source.rowHeader;
    return 'Source non définie';
  };

  const resetMappingForm = () => {
    setMappingTarget('');
    setMappingTransform('string');
    setMappingDefault('');
    setSelectedSource(null);
    setSelectedCell(null);
  };

  const handleSaveMapping = () => {
    if (!mappingTarget.trim() || !selectedSource) return;
    const newMapping: ExcelMapping = {
      target: mappingTarget.trim(),
      source: selectedSource,
      transform: mappingTransform,
      default: mappingDefault === '' ? undefined : mappingDefault,
    };
    onChange({
      ...template,
      excelMappings: [...excelMappings, newMapping],
    });
    resetMappingForm();
  };

  const handleRemoveMapping = (index: number) => {
    onChange({
      ...template,
      excelMappings: excelMappings.filter((_, i) => i !== index),
    });
  };

  const getMappingWarning = (mapping: ExcelMapping): string | null => {
    const issues: string[] = [];
    if (mapping.source.column && !template.columnHeaders.includes(mapping.source.column)) {
      issues.push('Colonne non trouvée');
    }
    if (mapping.source.rowHeader && !template.rowHeaders.includes(mapping.source.rowHeader)) {
      issues.push('En-tête de ligne non trouvée');
    }
    return issues.length ? issues.join(' • ') : null;
  };

  const isValid =
    template.name.trim() &&
    (template.columnHeaders.length > 0 ||
      (template.headerLayout !== 'row' && template.rowHeaders.length > 0));

  return (
    <div className="space-y-4">
      {/* Nom et description */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400">Nom du modèle</label>
          <Input
            value={template.name}
            onChange={(e) => onChange({ ...template, name: e.target.value })}
            className="mt-1 h-8 bg-white/5 border-white/10 text-white"
            placeholder="Ex: Détail consommation"
            autoFocus={isNew}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400">Description</label>
          <Input
            value={template.description || ''}
            onChange={(e) => onChange({ ...template, description: e.target.value })}
            className="mt-1 h-8 bg-white/5 border-white/10 text-white"
            placeholder="Description optionnelle"
          />
        </div>
      </div>

      {/* Type de disposition */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-2 block">
          Disposition des en-têtes
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant={template.headerLayout === 'row' ? 'default' : 'outline'}
            className={`h-auto py-3 flex-col gap-1 ${
              template.headerLayout === 'row'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
            onClick={() => handleLayoutChange('row')}
          >
            <Rows3 className="h-5 w-5" />
            <span className="text-xs">En-têtes en ligne</span>
            <span className="text-[0.6rem] text-slate-400">(1ère ligne)</span>
          </Button>
          <Button
            type="button"
            variant={template.headerLayout === 'column' ? 'default' : 'outline'}
            className={`h-auto py-3 flex-col gap-1 ${
              template.headerLayout === 'column'
                ? 'bg-cyan-600 hover:bg-cyan-700'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
            onClick={() => handleLayoutChange('column')}
          >
            <Columns3 className="h-5 w-5" />
            <span className="text-xs">En-têtes en colonne</span>
            <span className="text-[0.6rem] text-slate-400">(1ère colonne)</span>
          </Button>
          <Button
            type="button"
            variant={template.headerLayout === 'both' ? 'default' : 'outline'}
            className={`h-auto py-3 flex-col gap-1 ${
              template.headerLayout === 'both'
                ? 'bg-slate-600 hover:bg-slate-700'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
            onClick={() => handleLayoutChange('both')}
          >
            <Grid3X3 className="h-5 w-5" />
            <span className="text-xs">Double entrée</span>
            <span className="text-[0.6rem] text-slate-400">(les deux)</span>
          </Button>
        </div>
      </div>

      {/* En-têtes de colonnes */}
      {(template.headerLayout === 'row' || template.headerLayout === 'both') && (
        <div>
          <label className="text-xs font-medium text-slate-400 mb-2 block">
            En-têtes de colonnes (première ligne)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {template.columnHeaders.map((header, idx) => (
              <Badge
                key={idx}
                className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 pr-1"
              >
                {header}
                <button
                  onClick={() => handleRemoveColumnHeader(header)}
                  className="ml-1 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newColumnHeader}
              onChange={(e) => setNewColumnHeader(e.target.value)}
              className="h-8 bg-white/5 border-white/10 text-white"
              placeholder="Ajouter une en-tête de colonne..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddColumnHeader();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddColumnHeader}
              disabled={!newColumnHeader.trim()}
              className="h-8 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* En-têtes de lignes */}
      {(template.headerLayout === 'column' || template.headerLayout === 'both') && (
        <div>
          <label className="text-xs font-medium text-slate-400 mb-2 block">
            En-têtes de lignes (première colonne)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {template.rowHeaders.map((header, idx) => (
              <Badge
                key={idx}
                className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 pr-1"
              >
                {header}
                <button
                  onClick={() => handleRemoveRowHeader(header)}
                  className="ml-1 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newRowHeader}
              onChange={(e) => setNewRowHeader(e.target.value)}
              className="h-8 bg-white/5 border-white/10 text-white"
              placeholder="Ajouter une en-tête de ligne..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddRowHeader();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAddRowHeader}
              disabled={!newRowHeader.trim()}
              className="h-8 bg-cyan-600 hover:bg-cyan-700"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Prévisualisation du tableau */}
      {(template.columnHeaders.length > 0 || template.rowHeaders.length > 0) && (
        <div>
          <label className="text-xs font-medium text-slate-400 mb-2 block">
            Prévisualisation du template
          </label>
          <div className="border border-white/10 rounded-lg overflow-hidden bg-slate-900/50">
            <table className="w-full text-xs">
              <tbody>
                {/* Première ligne (en-têtes de colonnes) */}
                {(template.headerLayout === 'row' || template.headerLayout === 'both') && (
                  <tr>
                    {template.headerLayout === 'both' && (
                      <td className="border border-white/10 p-2 bg-slate-700/50 text-slate-500 text-center">
                        ↘
                      </td>
                    )}
                    {template.columnHeaders.map((header, idx) => (
                      <td
                        key={idx}
                        className="border border-emerald-500/30 p-2 bg-emerald-500/20 text-emerald-300 font-medium text-center"
                      >
                        {header}
                      </td>
                    ))}
                  </tr>
                )}

                {/* Lignes de données */}
                {template.headerLayout === 'row' &&
                  [0, 1, 2].map((rowIdx) => (
                    <tr key={rowIdx}>
                      {template.columnHeaders.map((_, colIdx) => (
                        <td
                          key={colIdx}
                          className={`border border-white/10 p-2 text-slate-500 text-center cursor-pointer ${
                            selectedCell?.row === rowIdx && selectedCell.col === colIdx
                              ? 'ring-2 ring-cyan-400'
                              : ''
                          }`}
                          onClick={() => handleCellSelect(rowIdx, colIdx)}
                        >
                          valeur
                        </td>
                      ))}
                    </tr>
                  ))}

                {/* Lignes avec en-têtes de lignes */}
                {(template.headerLayout === 'column' || template.headerLayout === 'both') &&
                  template.rowHeaders.map((rowHeader, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="border border-cyan-500/30 p-2 bg-cyan-500/20 text-cyan-300 font-medium">
                        {rowHeader}
                      </td>
                      {template.headerLayout === 'both' &&
                        template.columnHeaders.map((_, colIdx) => (
                          <td
                            key={colIdx}
                            className={`border border-white/10 p-2 text-slate-500 text-center cursor-pointer ${
                              selectedCell?.row === rowIdx && selectedCell.col === colIdx
                                ? 'ring-2 ring-cyan-400'
                                : ''
                            }`}
                            onClick={() => handleCellSelect(rowIdx, colIdx)}
                          >
                            valeur
                          </td>
                        ))}
                      {template.headerLayout === 'column' &&
                        [0, 1, 2].map((colIdx) => (
                          <td
                            key={colIdx}
                            className="border border-white/10 p-2 text-slate-500 text-center"
                          >
                            valeur
                          </td>
                        ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-2 text-[0.65rem] text-slate-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-emerald-500/20 border border-emerald-500/30" />
              En-têtes colonnes (1ère ligne)
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-cyan-500/20 border border-cyan-500/30" />
              En-têtes lignes (1ère colonne)
            </div>
          </div>
        </div>
      )}

      {/* Mappings Excel */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-400">Export Excel (mapping)</label>
          <Badge className="bg-white/5 border-white/10 text-slate-300">
            {excelMappings.length} mapping{excelMappings.length > 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/50 p-4 space-y-3">
          <p className="text-xs text-slate-400">
            Cliquez sur la prévisualisation ci-dessus pour sélectionner la cellule source. Puis
            indiquez le nom de colonne cible pour l&apos;export Excel.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-400">Colonne cible (Excel)</label>
              <Input
                value={mappingTarget}
                onChange={(e) => setMappingTarget(e.target.value)}
                className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                placeholder="Ex: Consommation HP (kWh)"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Transformation</label>
              <Select value={mappingTransform} onValueChange={(v) => setMappingTransform(v as ExcelMappingTransform)}>
                <SelectTrigger className="mt-1 h-8 bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0d14] border-white/10 text-white">
                  <SelectItem value="string">Texte</SelectItem>
                  <SelectItem value="number">Nombre</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400">Valeur par défaut</label>
              <Input
                value={mappingDefault}
                onChange={(e) => setMappingDefault(e.target.value)}
                className="mt-1 h-8 bg-white/5 border-white/10 text-white"
                placeholder="Optionnel"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="text-slate-300">Source sélectionnée :</span>
            {selectedSource ? (
              <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-500/30">
                {formatSource(selectedSource)}
              </Badge>
            ) : (
              <span>Aucune (cliquez sur le tableau)</span>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-white/10"
              onClick={resetMappingForm}
            >
              Réinitialiser
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveMapping}
              disabled={!mappingTarget.trim() || !selectedSource}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Ajouter le mapping
            </Button>
          </div>

          <div className="space-y-2">
            {excelMappings.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun mapping défini pour ce tableau.</p>
            ) : (
              excelMappings.map((mapping, idx) => {
                const warning = getMappingWarning(mapping);
                return (
                  <div
                    key={`${mapping.target}-${idx}`}
                    className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30">
                          {mapping.target}
                        </Badge>
                        <Badge className="bg-slate-700 text-slate-200 border-white/10">
                          {formatSource(mapping.source)}
                        </Badge>
                        {mapping.transform && (
                          <Badge className="bg-slate-800 text-slate-300 border-white/10">
                            {mapping.transform}
                          </Badge>
                        )}
                      </div>
                      {warning && (
                        <p className="text-[0.65rem] text-orange-300 flex items-center gap-1">
                          {warning}
                        </p>
                      )}
                    </div>
                    <button
                      className="text-slate-400 hover:text-red-400"
                      onClick={() => handleRemoveMapping(idx)}
                      title="Supprimer le mapping"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Obligatoire */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <div className="flex items-center gap-2">
          <Switch
            checked={template.required}
            onCheckedChange={(checked) => onChange({ ...template, required: checked })}
          />
          <span className="text-sm text-slate-300">Tableau obligatoire</span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4 mr-1" />
            Annuler
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={!isValid}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Check className="h-4 w-4 mr-1" />
            {isNew ? 'Créer' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
