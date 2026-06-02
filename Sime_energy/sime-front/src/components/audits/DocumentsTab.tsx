import { useState, useEffect, useRef } from 'react'
import { Upload, FileText, Download, Trash2, Loader2, FolderOpen, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const BUCKET = 'audit-documents'

interface Doc {
  name:       string
  id:         string
  updated_at: string
  metadata?:  { size?: number; mimetype?: string }
}

function formatSize(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024)        return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  const colors: Record<string, string> = {
    pdf: 'text-red-400', xlsx: 'text-emerald-400', xls: 'text-emerald-400',
    docx: 'text-blue-400', doc: 'text-blue-400',
    png: 'text-violet-400', jpg: 'text-violet-400', jpeg: 'text-violet-400',
    csv: 'text-amber-400',
  }
  return colors[ext ?? ''] ?? 'text-slate-400'
}

interface DocumentsTabProps {
  auditId: string
}

export function DocumentsTab({ auditId }: DocumentsTabProps) {
  const [docs,      setDocs]      = useState<Doc[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [bucketErr, setBucketErr] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadDocs() }, [auditId])

  async function loadDocs() {
    setLoading(true)
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(auditId, { sortBy: { column: 'updated_at', order: 'desc' } })

    if (error) {
      // Bucket inexistant ou pas de politique d'accès → afficher message
      if (error.message?.includes('not found') || error.message?.includes('The resource was not found')) {
        setBucketErr(true)
      }
      setLoading(false)
      return
    }

    // Filtrer les dossiers et les .emptyFolderPlaceholder
    setDocs((data ?? []).filter(f => f.id && !f.name.startsWith('.')) as Doc[])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 50 Mo)'); return }

    setUploading(true)
    try {
      const path = `${auditId}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (error) throw error
      toast.success(`${file.name} ajouté`)
      await loadDocs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur upload'
      if (msg.includes('not found')) {
        setBucketErr(true)
        toast.error('Bucket "audit-documents" introuvable — créez-le dans Supabase Storage')
      } else {
        toast.error('Erreur lors de l\'upload')
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDownload(docName: string) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${auditId}/${docName}`, 120)
    if (error || !data?.signedUrl) { toast.error('Impossible de générer le lien'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(docName: string) {
    const { error } = await supabase.storage.from(BUCKET).remove([`${auditId}/${docName}`])
    if (error) { toast.error('Erreur lors de la suppression'); return }
    setDocs(prev => prev.filter(d => d.name !== docName))
    toast.success('Document supprimé')
  }

  // ── Bucket manquant ──
  if (bucketErr) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20">
          <AlertCircle className="w-6 h-6 text-orange-400" />
        </div>
        <p className="text-sm font-medium text-slate-200">Bucket de stockage introuvable</p>
        <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
          Créez un bucket nommé <span className="font-mono text-slate-300 bg-white/5 px-1 rounded">audit-documents</span> dans
          Supabase Storage (Dashboard → Storage → New bucket) puis activez les politiques RLS.
        </p>
      </div>
    )
  }

  // ── Chargement ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    )
  }

  // ── Vide ──
  if (docs.length === 0) {
    return (
      <>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
          accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.csv,.txt" />
        <div className="flex flex-col items-center justify-center py-14 px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5"
            style={{ boxShadow: '0 0 32px #3b82f620' }}>
            <FolderOpen className="w-7 h-7 text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1.5">Aucun document</h3>
          <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-6">
            Centralisez rapports de visite, photos terrain, plans et documents de référence pour cet audit.
          </p>
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/20 gap-1.5 text-xs"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />
            }
            Ajouter un document
          </Button>
        </div>
      </>
    )
  }

  // ── Liste ──
  return (
    <>
      <input ref={fileRef} type="file" className="hidden" onChange={handleUpload}
        accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg,.csv,.txt" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            <span className="font-mono text-blue-300 font-bold">{docs.length}</span> document{docs.length !== 1 ? 's' : ''}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            {uploading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5" />
            }
            Ajouter
          </Button>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-[#0a0c14] overflow-hidden">
          {docs.map((doc, i) => {
            // Strip timestamp prefix from display name
            const displayName = doc.name.replace(/^\d+_/, '')
            return (
              <div
                key={doc.id}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors',
                  i < docs.length - 1 && 'border-b border-white/[0.05]',
                )}
              >
                <FileText className={cn('w-4 h-4 shrink-0', fileIcon(doc.name))} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium truncate">{displayName}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {formatDate(doc.updated_at)}
                    {doc.metadata?.size && (
                      <span className="ml-2">{formatSize(doc.metadata.size)}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-500 hover:text-slate-200"
                    onClick={() => handleDownload(doc.name)}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-400"
                    onClick={() => handleDelete(doc.name)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
