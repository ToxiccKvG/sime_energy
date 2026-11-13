/**
 * Standalone auto-verification logic for invoices.
 * Runs outside of React (no hooks) — safe to call from loadData / Realtime callbacks.
 *
 * When a processing/pending invoice has all required dictionary fields present
 * in its ocr_data, we immediately flip its status to 'verified' so the
 * Facturation list reflects reality without the user having to open AnnotationPage.
 */

import { getAnnotationCollection } from './annotation-dictionary-service';
import { updateInvoice } from './invoice-service';
import type { AuditInvoice } from './invoice-service';

// ─── String normalisation (mirrors useAnnotationDictionary.ts) ──────────────

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s*:\s*$/, '')                    // trailing colon
    .replace(/[°º()[\],.%²¹³'"`/]/g, ' ')      // units / parens / punctuation → space
    .replace(/_/g, ' ')                          // snake_case → spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function keyMatches(textractKey: string, fieldKey: string, aliases: string[]): boolean {
  const n = normalize(textractKey);
  return n === normalize(fieldKey) || aliases.some((a) => n === normalize(a));
}

// ─── OCR data extraction ─────────────────────────────────────────────────────

function extractFormKeys(ocrData: unknown): string[] {
  if (!ocrData || typeof ocrData !== 'object') return [];
  const d = ocrData as Record<string, unknown>;

  // page[0].forms  (legacy key from some backend versions)
  const page = d.page as Array<{ forms?: Array<{ Key: string }> }> | undefined;
  if (Array.isArray(page) && page[0]?.forms) return page[0].forms.map((f) => f.Key);

  // pages[0].forms  (current backend output)
  const pages = d.pages as Array<{ forms?: Array<{ Key: string }> }> | undefined;
  if (Array.isArray(pages) && pages[0]?.forms) return pages[0].forms.map((f) => f.Key);

  // top-level forms array
  const forms = d.forms as Array<{ Key: string }> | undefined;
  if (Array.isArray(forms)) return forms.map((f) => f.Key);

  // flat array of FormField objects
  if (Array.isArray(ocrData)) return (ocrData as Array<{ Key: string }>).map((f) => f.Key);

  return [];
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * For each invoice in 'processing' or 'pending' state whose ocr_data already
 * contains all required dictionary fields, update Supabase status to 'verified'
 * and call onVerified(id) so the caller can update local state optimistically.
 *
 * Errors are silently ignored — the Realtime subscription will reconcile.
 */
export async function autoVerifyProcessingInvoices(
  invoices: AuditInvoice[],
  organizationId: string,
  onVerified: (invoiceId: string) => void,
): Promise<void> {
  const candidates = invoices.filter(
    (inv) =>
      (inv.status === 'processing' || inv.status === 'pending') &&
      inv.ocr_data != null,
  );
  if (candidates.length === 0) return;

  let collection;
  try {
    collection = await getAnnotationCollection(organizationId);
  } catch {
    return; // can't load dictionary — bail silently
  }

  const { dictionaries, displaySettings } = collection;
  const activeDictId = displaySettings.selectedDictionaryId;
  const dict = activeDictId
    ? (dictionaries.find((d) => d.id === activeDictId) ?? dictionaries[0])
    : dictionaries[0];

  if (!dict) return;

  const requiredFields = dict.fields.filter((f) => f.required);
  if (requiredFields.length === 0) return;

  for (const invoice of candidates) {
    const formKeys = extractFormKeys(invoice.ocr_data);
    if (formKeys.length === 0) continue;

    const allFound = requiredFields.every((field) =>
      formKeys.some((key) => keyMatches(key, field.key, field.aliases ?? [])),
    );

    if (allFound) {
      try {
        await updateInvoice(invoice.id, { status: 'verified' });
        onVerified(invoice.id);
      } catch {
        // Realtime subscription will pick up the eventual server state
      }
    }
  }
}
