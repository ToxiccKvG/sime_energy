import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganization } from '@/context/OrganizationContext';
import { getAudits } from '@/lib/audit-service';
import { getAuditInvoices, deleteInvoice } from '@/lib/invoice-service';
import { Upload, FileText, Loader2, DollarSign, CheckCircle2, Eye, Trash2, AlertCircle, Clock, ArrowDown, ArrowUp, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { InvoiceImportDialog } from '@/components/invoices/InvoiceImportDialog';
import { InvoiceViewDialog } from '@/components/invoices/InvoiceViewDialog';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { exportVerifiedInvoicesToExcel } from '@/lib/export-service';
import type { AuditInvoice } from '@/lib/invoice-service';
import '@dotlottie/player-component';

const MOCK_MODE = import.meta.env.VITE_MOCK_INVOICES === 'true';

const Facturation = () => {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [invoices, setInvoices] = useState<AuditInvoice[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<AuditInvoice | null>(null);
  const [isInvoiceViewOpen, setIsInvoiceViewOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const mockTimersRef = useRef<NodeJS.Timeout[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'single' | 'bulk' | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadData();
    return () => {
      // cleanup mock timers if any
      mockTimersRef.current.forEach((t) => clearTimeout(t));
      mockTimersRef.current = [];
    };
  }, [organization?.id]);

  // Subscribe to real-time updates on audit_invoices table (skip in mock mode)
  useEffect(() => {
    if (!organization?.id || MOCK_MODE) return;

    const subscription = supabase
      .channel(`audit_invoices:${organization.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audit_invoices',
          filter: `organization_id=eq.${organization.id}`,
        },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [organization?.id]);

  const loadData = async () => {
    // Mode mock: on génère des factures factices et on simule leur traitement
    if (MOCK_MODE) {
      setLoading(true);
      mockTimersRef.current.forEach((t) => clearTimeout(t));
      mockTimersRef.current = [];

      const now = Date.now();
      const mockInvoices: AuditInvoice[] = [
        {
          id: 'mock-1',
          audit_id: 'audit-1',
          building_id: '',
          file_name: 'facture_HP_001.pdf',
          file_url: '',
          uploaded_by: 'user-1',
          invoice_date: new Date(now - 86400000).toISOString(),
          amount: 1200,
          supplier: 'EDF',
          status: 'processing',
          confidence_score: 0,
          ocr_data: {},
          notes: '',
          created_at: new Date(now - 86400000).toISOString(),
          updated_at: new Date(now - 86400000).toISOString(),
        },
        {
          id: 'mock-2',
          audit_id: 'audit-1',
          building_id: '',
          file_name: 'facture_HC_002.pdf',
          file_url: '',
          uploaded_by: 'user-1',
          invoice_date: new Date(now - 172800000).toISOString(),
          amount: 2400,
          supplier: 'ENGIE',
          status: 'pending',
          confidence_score: 0,
          ocr_data: {},
          notes: '',
          created_at: new Date(now - 172800000).toISOString(),
          updated_at: new Date(now - 172800000).toISOString(),
        },
        {
          id: 'mock-3',
          audit_id: 'audit-2',
          building_id: '',
          file_name: 'facture_MT_003.pdf',
          file_url: '',
          uploaded_by: 'user-2',
          invoice_date: new Date(now - 432000000).toISOString(),
          amount: 3600,
          supplier: 'TOTAL',
          status: 'pending',
          confidence_score: 0,
          ocr_data: {},
          notes: '',
          created_at: new Date(now - 432000000).toISOString(),
          updated_at: new Date(now - 432000000).toISOString(),
        },
      ];

      setInvoices(mockInvoices);
      setAudits([
        { id: 'audit-1', name: 'Audit A', color: '#3b82f6' },
        { id: 'audit-2', name: 'Audit B', color: '#10b981' },
      ]);
      setLoading(false);

      // Simuler la progression : pending -> processing -> verified
      // Mock-2 passe en processing après 3s, puis verified après 7s
      mockTimersRef.current.push(
        setTimeout(() => {
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === 'mock-2' ? { ...inv, status: 'processing' } : inv
            )
          );
        }, 3000)
      );
      mockTimersRef.current.push(
        setTimeout(() => {
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === 'mock-2' ? { ...inv, status: 'verified', confidence_score: 92 } : inv
            )
          );
        }, 7000)
      );

      // Mock-3 passe en processing après 5s, puis verified après 10s
      mockTimersRef.current.push(
        setTimeout(() => {
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === 'mock-3' ? { ...inv, status: 'processing' } : inv
            )
          );
        }, 5000)
      );
      mockTimersRef.current.push(
        setTimeout(() => {
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === 'mock-3' ? { ...inv, status: 'verified', confidence_score: 88 } : inv
            )
          );
        }, 10000)
      );

      return;
    }

    // Mode réel
    if (!organization?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const auditsList = await getAudits(organization.id);
      setAudits(auditsList || []);

      const allInvoices: AuditInvoice[] = [];
      for (const audit of (auditsList || [])) {
        try {
          const auditInvoices = await getAuditInvoices(audit.id);
          allInvoices.push(...auditInvoices);
        } catch (e) {
          console.warn(`Failed to load invoices for audit ${audit.id}:`, e);
        }
      }
      setInvoices(allInvoices);
    } catch (error) {
      console.error('Failed to load invoices', error);
      toast.error('Impossible de charger les factures');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    const matchesAudit = !selectedAuditId || invoice.audit_id === selectedAuditId;
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    const matchesSearch = searchQuery === '' ||
      invoice.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (invoice.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

    return matchesAudit && matchesStatus && matchesSearch;
  });

  const getAuditName = (auditId: string) => {
    const audit = audits.find(a => a.id === auditId);
    return audit?.name || 'Audit inconnu';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'bg-green-500/15 text-green-200 border border-green-500/30';
      case 'processing': return 'bg-blue-500/15 text-blue-200 border border-blue-500/30';
      case 'rejected': return 'bg-red-500/15 text-red-200 border border-red-500/30';
      default: return 'bg-slate-500/10 text-slate-200 border border-slate-500/20';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'verified': return 'Vérifiée';
      case 'processing': return 'En traitement';
      case 'rejected': return 'Rejetée';
      default: return 'En attente';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'processing': return <Clock className="w-4 h-4 text-blue-600" />;
      case 'rejected': return <AlertCircle className="w-4 h-4 text-red-600" />;
      default: return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  // Format amount with thousand separators for XOF
  const formatXOF = (amount?: number) => {
    if (!amount) return '0 XOF';
    return amount.toLocaleString('fr-FR') + ' XOF';
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedInvoices.size === sortedAndFilteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(sortedAndFilteredInvoices.map(inv => inv.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedInvoices.size === 0) return;
    setDeleteConfirmType('bulk');
    setDeleteConfirmOpen(true);
  };

  const handleDeleteSingle = (invoiceId: string) => {
    setPendingDeleteId(invoiceId);
    setDeleteConfirmType('single');
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteConfirmType === 'single' && pendingDeleteId) {
        // Single deletion
        await deleteInvoice(pendingDeleteId);
        await loadData();
        toast.success('Facture supprimée');
      } else if (deleteConfirmType === 'bulk') {
        // Bulk deletion
        for (const invoiceId of selectedInvoices) {
          await deleteInvoice(invoiceId);
        }
        setSelectedInvoices(new Set());
        await loadData();
        toast.success(`${selectedInvoices.size} facture(s) supprimée(s)`);
      }
    } catch (error) {
      console.error('Error deleting invoices:', error);
      toast.error('Erreur lors de la suppression des factures');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setDeleteConfirmType(null);
      setPendingDeleteId(null);
    }
  };

  const handleExportSelected = async () => {
    if (selectedInvoices.size === 0) {
      toast.error('Sélectionnez au moins une facture');
      return;
    }

    setIsExporting(true);
    try {
      // Exporter les factures sélectionnées (qui doivent être vérifiées)
      await exportVerifiedInvoicesToExcel(sortedAndFilteredInvoices, selectedInvoices);
      toast.success(`Factures exportées avec succès`);
      setSelectedInvoices(new Set()); // Déselectionner après export
    } catch (error) {
      console.error('Error exporting invoices:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de l\'export';
      toast.error(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSort = (key: string) => {
    if (sortConfig?.key === key) {
      // Same column clicked, cycle through: desc -> asc -> none
      if (sortConfig.direction === 'desc') {
        setSortConfig({ key, direction: 'asc' });
      } else {
        setSortConfig(null); // Reset sort
      }
    } else {
      // New column, sort descending first
      setSortConfig({ key, direction: 'desc' });
    }
  };

  // Apply sorting to filtered invoices
  const sortedAndFilteredInvoices = (() => {
    let sorted = [...filteredInvoices];

    if (sortConfig) {
      sorted.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case 'amount':
            aValue = a.amount || 0;
            bValue = b.amount || 0;
            break;
          case 'date':
            aValue = a.invoice_date ? new Date(a.invoice_date).getTime() : 0;
            bValue = b.invoice_date ? new Date(b.invoice_date).getTime() : 0;
            break;
          case 'supplier':
            aValue = (a.supplier || '').toLowerCase();
            bValue = (b.supplier || '').toLowerCase();
            break;
          case 'status':
            aValue = a.status || '';
            bValue = b.status || '';
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return sorted;
  })();

  const totalAmount = sortedAndFilteredInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  const verifiedAmount = filteredInvoices
    .filter(inv => inv.status === 'verified')
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);

  // Factures en cours de traitement (pending ou processing)
  const loadingInvoices = invoices.filter(
    inv =>  inv.status === 'pending'
  );
  const loadingCount = loadingInvoices.length;
  const totalCount = invoices.length || 1;
  const loadingProgress = Math.min(
    100,
    Math.max(5, Math.round(((totalCount - loadingCount) / totalCount) * 100))
  );

  return (
    <div className="space-y-6 rounded-3xl border border-white/10 bg-[#0b0d14] p-6 text-slate-50 shadow-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Facturation</h1>
          <p className="mt-1 text-slate-400">
            Gestion et suivi des factures des audits
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/annotation')}
            className="border border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Annoter les factures
          </Button>
          <Button
            onClick={() => setIsImportDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Upload className="mr-2 h-4 w-4" />
            Importer des factures
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-6 border-white/10 bg-white/5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total factures</p>
              <p className="text-3xl font-bold text-white">{filteredInvoices.length}</p>
            </div>
            <FileText className="h-10 w-10 text-slate-400/60" />
          </div>
        </Card>

        <Card className="p-6 border-white/10 bg-white/5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Montant total</p>
              <p className="text-3xl font-bold text-white">{(totalAmount / 1000000).toFixed(2)}M</p>
            </div>
            <DollarSign className="h-10 w-10 text-emerald-400/50" />
          </div>
        </Card>

        <Card className="p-6 border-white/10 bg-white/5 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Vérifiées</p>
              <p className="text-3xl font-bold text-white">{filteredInvoices.filter(i => i.status === 'verified').length}</p>
            </div>
            <CheckCircle2 className="h-10 w-10 text-emerald-400/50" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center">
          <Input
            placeholder="Rechercher par nom ou fournisseur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-[220px] flex-1 bg-white/5 text-white placeholder:text-slate-500 border-white/10 focus-visible:ring-primary/70 focus-visible:border-primary/40"
          />
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center md:justify-end">
            <Select
              value={selectedAuditId ?? 'all'}
              onValueChange={(value) => setSelectedAuditId(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full min-w-[200px] border-white/10 bg-white/5 text-white focus:ring-primary/70 focus:ring-offset-0 hover:bg-white/10 md:w-[220px]">
                <SelectValue placeholder="Tous les audits" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b0d14] text-white">
                <SelectItem value="all">Tous les audits</SelectItem>
                {audits.map(audit => (
                  <SelectItem key={audit.id} value={audit.id}>
                    {audit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full min-w-[180px] border-white/10 bg-white/5 text-white focus:ring-primary/70 focus:ring-offset-0 hover:bg-white/10 md:w-[200px]">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b0d14] text-white">
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="processing">En traitement</SelectItem>
                <SelectItem value="verified">Vérifiée</SelectItem>
                <SelectItem value="rejected">Rejetée</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Banner de chargement des factures */}
      {loadingCount > 0 && (
        <Card className="border-white/10 bg-white/5 p-4 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <dotlottie-player
              src="/lottie/loading.lottie"
              autoplay
              loop
              style={{ width: '72px', height: '72px' }}
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">
                {loadingCount} facture{loadingCount > 1 ? 's' : ''} en cours de traitement
              </p>
              <p className="text-xs text-slate-400">
                Les factures apparaîtront dès qu'elle seront traitées .
              </p>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Invoices Table */}
      <Card className="overflow-hidden border-white/10 bg-[#0d1018] text-white shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-slate-400">Chargement des factures...</p>
            </div>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-3">
              <FileText className="h-12 w-12 text-slate-500 mx-auto" />
              <p className="text-slate-300">Aucune facture trouvée</p>
              <p className="text-sm text-slate-500">
                {invoices.length === 0 ? 'Importer des factures pour commencer' : 'Ajustez vos filtres'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Bulk Actions Bar */}
            {selectedInvoices.size > 0 && (
              <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4 backdrop-blur">
                <span className="text-sm font-medium text-slate-200">
                  {selectedInvoices.size} facture(s) sélectionnée(s)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleExportSelected}
                    disabled={isExporting}
                    className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Export en cours...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Exporter en Excel
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedInvoices.size === sortedAndFilteredInvoices.length && sortedAndFilteredInvoices.length > 0}
                      onChange={toggleAllSelection}
                      className="rounded border-white/20 bg-white/5 text-primary"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-200">Fichier</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-200 cursor-pointer hover:bg-white/5" onClick={() => handleSort('supplier')}>
                    <div className="flex items-center gap-2">
                      Fournisseur
                      {sortConfig?.key === 'supplier' && (
                        sortConfig.direction === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-200 cursor-pointer hover:bg-white/5" onClick={() => handleSort('amount')}>
                    <div className="flex items-center justify-end gap-2">
                      Montant
                      {sortConfig?.key === 'amount' && (
                        sortConfig.direction === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-200 cursor-pointer hover:bg-white/5" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-2">
                      Date
                      {sortConfig?.key === 'date' && (
                        sortConfig.direction === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-200 cursor-pointer hover:bg-white/5" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-2">
                      Statut
                      {sortConfig?.key === 'status' && (
                        sortConfig.direction === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-white/10 bg-transparent transition-colors hover:bg-white/5">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.has(invoice.id)}
                        onChange={() => toggleInvoiceSelection(invoice.id)}
                        className="rounded border-white/20 bg-white/5 text-primary"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-white">{invoice.file_name}</p>
                          <p className="text-xs text-slate-400">{getAuditName(invoice.audit_id)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {invoice.supplier || '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-semibold text-white">
                        {formatXOF(invoice.amount)}
                      </div>
                      {invoice.confidence_score > 0 && (
                        <p className="text-xs text-slate-400">Confiance: {invoice.confidence_score}%</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {invoice.invoice_date
                        ? format(new Date(invoice.invoice_date), 'dd MMM yyyy', { locale: fr })
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {invoice.status === 'pending' ? (
                          <dotlottie-player
                            src="/lottie/loading.lottie"
                            autoplay
                            loop
                            style={{ width: '36px', height: '36px' }}
                          />
                        ) : (
                          getStatusIcon(invoice.status)
                        )}
                        <Badge className={getStatusColor(invoice.status)} variant="secondary">
                          {getStatusLabel(invoice.status)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-200 hover:bg-white/10"
                          title="Consulter"
                          onClick={() => {
                            setSelectedInvoiceForView(invoice);
                            setIsInvoiceViewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleDeleteSingle(invoice.id)}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirmType === 'bulk' ? 'Supprimer les factures' : 'Supprimer la facture'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmType === 'bulk'
                ? `Êtes-vous sûr de vouloir supprimer ${selectedInvoices.size} facture(s)? Cette action est irréversible.`
                : 'Êtes-vous sûr de vouloir supprimer cette facture? Cette action est irréversible.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel disabled={isDeleting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer'
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Dialog */}
      <InvoiceImportDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        onImportComplete={() => {
          setIsImportDialogOpen(false);
          loadData(); // Reload invoices after import
        }}
      />

      {/* Invoice View Dialog */}
      <InvoiceViewDialog
        invoice={selectedInvoiceForView}
        open={isInvoiceViewOpen}
        onOpenChange={setIsInvoiceViewOpen}
      />
    </div>
  );
};

export default Facturation;
