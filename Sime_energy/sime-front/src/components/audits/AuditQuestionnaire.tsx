import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PVQuestionnaire, PVSectionData } from '@/types/audit';
import {
  QUESTIONNAIRE_SCHEMA
  ,
} from '@/constants/pv-questionnaire-schema';
import { CustomFieldsBuilder } from './questionnaire/CustomFieldsBuilder';
import { DuplicateDialog } from './questionnaire/DuplicateDialog';
import { PremiumToggle } from './questionnaire/PremiumToggle';
import { QuestionnaireTabBar } from './questionnaire/QuestionnaireTabBar';
import { RecapDialog } from './questionnaire/RecapDialog';
import { SectionCard } from './questionnaire/SectionCard';
import {
  createEmptyQuestionnaire, createEmptySectionData,
} from './questionnaire/questionnaire-data';

// ─── Main Component ───────────────────────────────────────────────────────────

interface AuditQuestionnaireProps {
  value: PVQuestionnaire[];
  onChange: (questionnaires: PVQuestionnaire[]) => void;
}

export default function AuditQuestionnaire({ value, onChange }: AuditQuestionnaireProps) {
  const enabled = value.length > 0;
  const [activeId, setActiveId] = useState<string>('');
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);

  const activeQuestionnaire = value.find((q) => q.id === activeId) ?? value[0];

  const handleToggle = () => {
    if (enabled) {
      // Collapse UI, keep data
      onChange([]);
    } else {
      const q = createEmptyQuestionnaire('Questionnaire 1');
      onChange([q]);
      setActiveId(q.id);
    }
  };

  const handleAdd = (name: string) => {
    const q = createEmptyQuestionnaire(name);
    onChange([...value, q]);
    setActiveId(q.id);
  };

  const handleRemove = (id: string) => {
    const next = value.filter((q) => q.id !== id);
    onChange(next);
    if (activeId === id) setActiveId(next[0]?.id ?? '');
  };

  const handleRename = (id: string, name: string) => {
    onChange(value.map((q) => (q.id === id ? { ...q, name } : q)));
  };

  const updateQuestionnaire = (updated: PVQuestionnaire) => {
    onChange(value.map((q) => (q.id === updated.id ? updated : q)));
  };

  const updateSection = (sectionIdx: number, sectionData: PVSectionData) => {
    if (!activeQuestionnaire) return;
    const sections = activeQuestionnaire.sections.map((s, i) => (i === sectionIdx ? sectionData : s));
    updateQuestionnaire({ ...activeQuestionnaire, sections });
  };

  return (
    <div className="space-y-4">
      <PremiumToggle enabled={enabled} onToggle={handleToggle} />

      {enabled && activeQuestionnaire && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          {/* Tab bar */}
          <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 flex items-center justify-between gap-3">
            <QuestionnaireTabBar
              questionnaires={value}
              activeId={activeQuestionnaire.id}
              onSelect={setActiveId}
              onAdd={() => setDuplicateOpen(true)}
              onRemove={handleRemove}
              onRename={handleRename}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRecapOpen(true)}
              className="shrink-0 border-slate-600 bg-slate-700/40 text-slate-300 hover:bg-slate-700/80 hover:text-blue-300"
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Récap PDF
            </Button>
          </div>

          {/* Questionnaire content */}
          <div className="p-4 space-y-3">
            {QUESTIONNAIRE_SCHEMA.map((schema, i) => (
              <SectionCard
                key={schema.id}
                idx={i}
                schema={schema}
                data={activeQuestionnaire.sections[i] ?? createEmptySectionData(schema)}
                onChange={(d) => updateSection(i, d)}
              />
            ))}

            <CustomFieldsBuilder
              fields={activeQuestionnaire.customFields}
              onChange={(cf) => updateQuestionnaire({ ...activeQuestionnaire, customFields: cf })}
            />
          </div>
        </div>
      )}

      <DuplicateDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        count={value.length}
        onConfirm={handleAdd}
      />

      {activeQuestionnaire && (
        <RecapDialog
          open={recapOpen}
          onOpenChange={setRecapOpen}
          questionnaire={activeQuestionnaire}
        />
      )}
    </div>
  );
}
