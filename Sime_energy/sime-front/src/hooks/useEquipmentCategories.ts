import { useQuery } from '@tanstack/react-query';
import { seedDefaultCategories, getCategories } from '@/lib/inventory-service';
import type { EquipmentCategory } from '@/types/inventory';

export function useEquipmentCategories(orgId: string | undefined) {
  return useQuery<EquipmentCategory[]>({
    queryKey: ['equipment-categories', orgId],
    queryFn: async () => {
      const cats = await seedDefaultCategories(orgId!).catch(() => getCategories(orgId!));
      const seen = new Set<string>();
      return cats.filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)));
    },
    enabled: !!orgId,
    staleTime: Infinity,
  });
}
