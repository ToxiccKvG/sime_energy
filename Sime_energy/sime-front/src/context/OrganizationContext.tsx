import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export interface Organization {
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
  loading: boolean;
  error: string | null;
  setOrganization: (org: Organization | null) => void;
  createOrganization: (name: string, description?: string) => Promise<Organization>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [organization, setOrganization] = useState<Organization | null>(null);
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
        const { data: orgUsers, error: orgUsersError } = await supabase
          .from('organization_users')
          .select('organization_id')
          .eq('user_id', user.id)
          .limit(1);

        if (orgUsersError) throw orgUsersError;

        if (orgUsers && orgUsers.length > 0) {
          const organizationId = orgUsers[0].organization_id;
          const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', organizationId)
            .single();

          if (orgError) throw orgError;
          setOrganization(org);
        } else {
          const { data: createdOrgs, error: createdOrgsError } = await supabase
            .from('organizations')
            .select('*')
            .eq('created_by', user.id)
            .limit(1);

          if (createdOrgsError) throw createdOrgsError;

          if (createdOrgs && createdOrgs.length > 0) {
            setOrganization(createdOrgs[0]);
          } else {
            setOrganization(null);
          }
        }
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

      setOrganization(data);
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
      organization, loading, error,
      setOrganization, createOrganization,
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
      loading: false,
      error: 'OrganizationProvider manquant',
      setOrganization: () => {},
      createOrganization: async () => { throw new Error('OrganizationProvider manquant'); },
    } as OrganizationContextType;
  }
  return context;
}
