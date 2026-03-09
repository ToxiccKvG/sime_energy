import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity-service';

export interface AuditInvoice {
  id: string;
  audit_id: string;
  building_id?: string;
  file_name: string;
  file_url?: string;
  uploaded_by: string;
  invoice_date?: string;
  amount?: number;
  supplier?: string;
  status: 'pending' | 'processing' | 'verified' | 'rejected';
  confidence_score: number;
  ocr_data?: Record<string, any>;
  ocr_data_verified?: Record<string, any>;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export async function getAuditInvoices(auditId: string) {
  const { data, error } = await supabase
    .from('audit_invoices')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createInvoice(auditId: string, organizationId: string, invoice: Partial<AuditInvoice>, userId: string) {
  const { data, error } = await supabase
    .from('audit_invoices')
    .insert([
      {
        organization_id: organizationId,
        audit_id: auditId,
        file_name: invoice.file_name,
        file_url: invoice.file_url,
        uploaded_by: userId,
        invoice_date: invoice.invoice_date,
        amount: invoice.amount,
        supplier: invoice.supplier,
        status: invoice.status || 'pending',
        confidence_score: invoice.confidence_score || 0,
        ocr_data: invoice.ocr_data || {},
        notes: invoice.notes,
        building_id: invoice.building_id,
      },
    ])
    .select()
    .single();

  if (error) throw error;

  // Log activity for invoice import (non-blocking, fire and forget)
  logActivity(
    auditId,
    organizationId,
    userId,
    'invoice_imported',
    `Facture importée: ${invoice.file_name}`,
    `Facture ${invoice.supplier ? `de ${invoice.supplier}` : ''} importée et en attente de traitement.`,
    { invoice_id: data.id, file_name: invoice.file_name, supplier: invoice.supplier }
  ).catch(e => {
    // Silently fail - activity logging shouldn't block invoice creation
    console.warn('Activity logging failed (non-blocking):', e);
  });

  return data;
}

export async function updateInvoice(invoiceId: string, updates: Partial<AuditInvoice>, auditId?: string, organizationId?: string, userId?: string) {
  const { data, error } = await supabase
    .from('audit_invoices')
    .update({
      status: updates.status,
      confidence_score: updates.confidence_score,
      amount: updates.amount,
      supplier: updates.supplier,
      invoice_date: updates.invoice_date,
      notes: updates.notes,
      // ocr_data: updates.ocr_data,
      ocr_data_verified: updates.ocr_data_verified,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw error;

  // Log activity if status changed to verified
  if (updates.status === 'verified' && auditId && organizationId && userId) {
    try {
      await logActivity(
        auditId,
        organizationId,
        userId,
        'invoice_verified',
        `Facture vérifiée: ${data.file_name}`,
        `Facture vérifiée avec un score de confiance de ${updates.confidence_score || data.confidence_score}%.`,
        { invoice_id: invoiceId, file_name: data.file_name }
      );
    } catch (e) {
      console.warn('Error logging invoice verification activity:', e);
    }
  }

  return data;
}

export async function deleteInvoice(invoiceId: string) {
  const { error } = await supabase
    .from('audit_invoices')
    .delete()
    .eq('id', invoiceId);

  if (error) throw error;
}

export async function getInvoiceStats(auditId: string) {
  const invoices = await getAuditInvoices(auditId);

  const total = invoices.length;
  const processed = invoices.filter(i => i.status !== 'pending').length;
  const verified = invoices.filter(i => i.status === 'verified').length;
  const totalAmount = invoices.reduce((sum, i) => sum + (i.amount || 0), 0);
  const averageConfidence = invoices.length > 0
    ? Math.round(invoices.reduce((sum, i) => sum + (i.confidence_score || 0), 0) / invoices.length)
    : 0;

  return {
    total,
    uploaded: total,
    processed,
    verified,
    totalAmount,
    averageConfidence,
  };
}
