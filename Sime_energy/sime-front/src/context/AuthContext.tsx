import {createContext, useContext, useState, useEffect} from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';
import { setCustomTariffGrids } from '@/constants/senelec-tariffs';

function syncTariffsFromUser(user: User | null) {
    const customGrids = (user?.user_metadata?.energy_settings?.custom_tariff_grids ?? null) as
        | Record<number, any>
        | null;
    setCustomTariffGrids(customGrids);
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signUp: (email: string, password: string, userData?: Record<string, any>) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User |null>(null);
    const [loading, setLoading] = useState(true);

    //Session verification on launching
    useEffect(() => {
        const checkSession =  async () => {
            const { data: { user } } = await supabase.auth.getUser();
            syncTariffsFromUser(user);
            setUser(user);
            setLoading(false);
        };

        checkSession();
        // listen to auth change
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
                const nextUser = session?.user || null;
                syncTariffsFromUser(nextUser);
                setUser(nextUser);
            }
        });

        return () => subscription?.unsubscribe();
    }, []);

    const signUp = async (email:string, password: string, userData?: Record<string, any>) => {
        const {error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: userData || {},
                emailRedirectTo: `${window.location.origin}/auth`,
            }
        });
        if (error) throw error;
    };


    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        });
        if (error) {
            // Fire-and-forget: log failed attempt for security monitoring (no PII stored)
            supabase.from('auth_events').insert([{ event_type: 'failed_login' }]).then(() => {});
            throw error;
        }
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const resetPassword = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
    };

    return(
        <AuthContext.Provider value={{user, loading, signUp,signIn,signOut, resetPassword}}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}