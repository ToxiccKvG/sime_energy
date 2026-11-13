import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface Organization {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface OrganizationContextType {
  organization: Organization | null;
  /** Toutes les organisations de l'utilisateur, par date d'adhésion */
  organizations: Organization[];
  loading: boolean;
  error: string | null;
  setOrganization: (org: Organization | null) => void;
  switchOrganization: (organizationId: string) => void;
  createOrganization: (name: string, description?: string) => Promise<Organization>;
}

// Dernière organisation choisie par l'utilisateur sur ce navigateur
const ACTIVE_ORG_KEY = 'simee.activeOrganizationId';

function readActiveOrgId(): string | null {
  try { return localStorage.getItem(ACTIVE_ORG_KEY); } catch { return null; }
}

function writeActiveOrgId(id: string) {
  try { localStorage.setItem(ACTIVE_ORG_KEY, id); } catch { /* navigation privée */ }
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadOrganization = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Toutes les adhésions, dans un ordre stable (la plus ancienne d'abord)
        const { data: memberships, error: membershipsError } = await supabase
          .from('organization_users')
          .select('created_at, organizations(*)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (membershipsError) throw membershipsError;

        let orgs = (memberships ?? [])
          .map(m => m.organizations as unknown as Organization | null)
          .filter((o): o is Organization => !!o);

        if (orgs.length === 0) {
          const { data: createdOrgs, error: createdOrgsError } = await supabase
            .from('organizations')
            .select('*')
            .eq('created_by', user.id)
            .order('created_at', { ascending: true });

          if (createdOrgsError) throw createdOrgsError;
          orgs = createdOrgs ?? [];
        }

        const storedId = readActiveOrgId();
        setOrganizations(orgs);
        setOrganization(orgs.find(o => o.id === storedId) ?? orgs[0] ?? null);
      } catch (err) {
        console.error('Error loading organization:', err);
        setError(err instanceof Error ? err.message : 'Failed to load organization');
        setOrganization(null);
      } finally {
        setLoading(false);
      }
    };

    loadOrganization();
  }, [user?.id]);

  const switchOrganization = (organizationId: string) => {
    const next = organizations.find(o => o.id === organizationId);
    if (!next || next.id === organization?.id) return;
    writeActiveOrgId(next.id);
    setOrganization(next);
    // Les données en cache appartiennent à l'organisation précédente
    queryClient.invalidateQueries();
  };

  const createOrganization = async (name: string, description?: string): Promise<Organization> => {
    if (!user?.id) throw new Error('User not authenticated');

    try {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const { data, error } = await supabase
        .from('organizations')
        .insert([{ name, slug, description, created_by: user.id }])
        .select()
        .single();

      if (error) throw error;

      const { error: userError } = await supabase
        .from('organization_users')
        .insert([{ organization_id: data.id, user_id: user.id, role: 'admin' }])
        .select()
        .single();

      if (userError && userError.code !== '23505') {
        console.warn('Error adding user to organization_users:', userError);
      }

      setOrganizations(prev => [...prev, data]);
      setOrganization(data);
      writeActiveOrgId(data.id);
      toast({ title: 'Organisation créée', description: `${name} a été créée avec succès` });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création de l\'organisation';
      setError(message);
      toast({ title: 'Erreur', description: message, variant: 'destructive' });
      throw err;
    }
  };

  return (
    <OrganizationContext.Provider value={{
      organization, organizations, loading, error,
      setOrganization, switchOrganization, createOrganization,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    console.warn('useOrganization appelé hors OrganizationProvider. Retour d\'un contexte par défaut.');
    return {
      organization: null,
      organizations: [],
      loading: false,
      error: 'OrganizationProvider manquant',
      setOrganization: () => {},
      switchOrganization: () => {},
      createOrganization: async () => { throw new Error('OrganizationProvider manquant'); },
    } as OrganizationContextType;
  }
  return context;
}
