import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAudits, deleteAudit, AuditDB } from '@/lib/audit-service';

export function useAudits(orgId: string | undefined) {
  return useQuery<AuditDB[]>({
    queryKey: ['audits', orgId],
    queryFn: () => getAudits(orgId!),
    enabled: !!orgId,
  });
}

export function useDeleteAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAudit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });
}
