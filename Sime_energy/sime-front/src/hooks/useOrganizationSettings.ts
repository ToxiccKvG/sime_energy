import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getOrganizationSettings, updateOrganizationSettings,
  type OrganizationSettings,
} from '@/lib/organization-settings-service';
import { refreshOrganizationProjectContexts } from '@/services/project-context-builder';

const settingsKey = (orgId: string | undefined) => ['organization-settings', orgId];

export function useOrganizationSettings(orgId: string | undefined) {
  return useQuery<OrganizationSettings>({
    queryKey: settingsKey(orgId),
    queryFn: () => getOrganizationSettings(orgId!),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Sauvegarde des réglages d'organisation, puis régénération (non bloquante)
 * du JSON contexte de tous les projets de l'organisation.
 */
export function useUpdateOrganizationSettings(orgId: string | undefined, userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<OrganizationSettings>) => updateOrganizationSettings(orgId!, patch, userId!),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey(orgId), settings);
      if (orgId) refreshProjectContextsInBackground(orgId, userId ?? null);
    },
  });
}

export function refreshProjectContextsInBackground(orgId: string, userId: string | null, notifySuccess = false) {
  refreshOrganizationProjectContexts(orgId, userId)
    .then(({ total, failed }) => {
      if (failed > 0) toast.error(`Contexte JSON : ${failed} projet(s) non régénéré(s)`);
      else if (notifySuccess) toast.success(`Contexte JSON régénéré pour ${total} projet(s)`);
    })
    .catch(() => toast.error('Contexte JSON des projets non régénéré'));
}
