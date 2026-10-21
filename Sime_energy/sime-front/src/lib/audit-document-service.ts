import { supabase } from '@/lib/supabase'

// Documents d'un projet : bucket Storage, un dossier par audit.
// Les fonctions renvoient la réponse Supabase telle quelle ; l'appelant gère l'erreur.

const BUCKET = 'audit-documents'

export function listAuditDocuments(auditId: string) {
  return supabase.storage
    .from(BUCKET)
    .list(auditId, { sortBy: { column: 'updated_at', order: 'desc' } })
}

export function uploadAuditDocument(auditId: string, file: File) {
  const path = `${auditId}/${Date.now()}_${file.name}`
  return supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
}

export function createAuditDocumentSignedUrl(auditId: string, docName: string, expiresInSeconds: number) {
  return supabase.storage
    .from(BUCKET)
    .createSignedUrl(`${auditId}/${docName}`, expiresInSeconds)
}

export function removeAuditDocument(auditId: string, docName: string) {
  return supabase.storage.from(BUCKET).remove([`${auditId}/${docName}`])
}
