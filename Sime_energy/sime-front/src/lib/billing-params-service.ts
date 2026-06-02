import { supabase } from '@/lib/supabase'
import type { AuditBillingParamsDB } from '@/types/billing'

export async function getBillingParams(auditId: string, siteId: string) {
  const { data, error } = await supabase
    .from('audit_billing_params')
    .select('*')
    .eq('audit_id', auditId)
    .eq('site_id', siteId)
    .maybeSingle()

  if (error) throw error
  return data as AuditBillingParamsDB | null
}

export async function saveBillingParams(
  params: Omit<AuditBillingParamsDB, 'id' | 'created_at' | 'updated_at'>,
) {
  const { data, error } = await supabase
    .from('audit_billing_params')
    .upsert({ ...params, updated_at: new Date().toISOString() }, { onConflict: 'audit_id,site_id' })
    .select()
    .single()

  if (error) throw error
  return data as AuditBillingParamsDB
}

export interface InvoiceForSelector {
  id:           string
  file_name:    string
  invoice_date: string | null
  amount:       number | null
  status:       string
  ocr_data:     unknown
}

export async function getVerifiedInvoicesForAudit(auditId: string): Promise<InvoiceForSelector[]> {
  const { data, error } = await supabase
    .from('audit_invoices')
    .select('id, file_name, invoice_date, amount, status, ocr_data')
    .eq('audit_id', auditId)
    .eq('status', 'verified')
    .order('invoice_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as InvoiceForSelector[]
}
