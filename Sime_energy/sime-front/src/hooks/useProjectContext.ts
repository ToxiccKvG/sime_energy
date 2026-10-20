import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getProjectContext } from '@/lib/project-context-service';
import { refreshProjectContext } from '@/services/project-context-builder';

const contextKey = (auditId: string | undefined) => ['project-context', auditId];

export function useProjectContext(auditId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: contextKey(auditId),
    queryFn: () => getProjectContext(auditId!),
    enabled: !!auditId && enabled,
  });
}

export function useRefreshProjectContext(auditId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshProjectContext(auditId!, userId ?? null),
    onSuccess: (context) => {
      queryClient.setQueryData(contextKey(auditId), { context, generatedAt: context.generated_at });
    },
  });
}

/** Régénère le JSON d'un projet sans bloquer l'UI (après une modification de ses données). */
export function refreshProjectContextInBackground(auditId: string, userId: string | null) {
  refreshProjectContext(auditId, userId).catch(() => toast.error('Contexte JSON du projet non régénéré'));
}
