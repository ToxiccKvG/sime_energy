import { useQuery } from '@tanstack/react-query';
import {
  AuditDB,
  ActivityItem,
  getDashboardSiteCount,
  getDashboardInvoiceCount,
  getDashboardActivity,
} from '@/lib/audit-service';
import { getDashboardEquipmentStats } from '@/lib/inventory-service';

export function useDashboardStats(audits: AuditDB[]) {
  const ids = audits.map((a) => a.id);
  const enabled = ids.length > 0;

  const sitesQ = useQuery({
    queryKey: ['dashboard-sites', ids],
    queryFn: () => getDashboardSiteCount(ids),
    enabled,
    staleTime: 30_000,
  });
  const equipQ = useQuery({
    queryKey: ['dashboard-equipment', ids],
    queryFn: () => getDashboardEquipmentStats(ids),
    enabled,
    staleTime: 30_000,
  });
  const invoicesQ = useQuery({
    queryKey: ['dashboard-invoices', ids],
    queryFn: () => getDashboardInvoiceCount(ids),
    enabled,
    staleTime: 30_000,
  });
  const activityQ = useQuery({
    queryKey: ['dashboard-activity', ids],
    queryFn: () => getDashboardActivity(ids),
    enabled,
    staleTime: 10_000,
  });

  return {
    sites: sitesQ.data ?? 0,
    equipment: equipQ.data?.count ?? 0,
    powerKW: equipQ.data?.powerKW ?? 0,
    invoices: invoicesQ.data ?? 0,
    activity: activityQ.data ?? ([] as ActivityItem[]),
    loading:
      sitesQ.isPending ||
      equipQ.isPending ||
      invoicesQ.isPending ||
      activityQ.isPending,
  };
}
