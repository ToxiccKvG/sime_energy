import type { PVQuestionnaire, PVSectionData } from '@/types/audit';
import { type PVSectionSchema, QUESTIONNAIRE_SCHEMA } from '@/constants/pv-questionnaire-schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function createEmptySectionData(schema: PVSectionSchema): PVSectionData {
  return {
    id: schema.id,
    fields: {},
    tableRows: schema.tableRows?.map((r) => ({
      id: r.id,
      label: r.label,
      dateTime: '',
      value: '',
      subGroup: r.subGroup,
    })),
    checkboxItems: schema.checkboxItems?.map((c) => ({ id: c.id, label: c.label, checked: false, comment: '' })),
    extraCheckboxItems: schema.extraCheckboxItems?.map((c) => ({ id: c.id, label: c.label, checked: false })),
    freeText: schema.hasFreeText ? '' : undefined,
    customFields: [],
    woyofalEntries: schema.hasWoyofal ? [] : undefined,
    mesureSessions: schema.hasWoyofal ? [] : undefined,
  };
}

export function createEmptyQuestionnaire(name: string): PVQuestionnaire {
  return {
    id: crypto.randomUUID(),
    name,
    sections: QUESTIONNAIRE_SCHEMA.map(createEmptySectionData),
    customFields: [],
    createdAt: new Date().toISOString(),
  };
}
