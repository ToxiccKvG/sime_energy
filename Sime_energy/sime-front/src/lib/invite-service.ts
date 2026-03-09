import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface InviteResponse {
  success: boolean;
  message: string;
  user_id?: string;
}

export async function inviteUserByEmail(email: string, metadata?: Record<string, any>): Promise<InviteResponse> {
  // Obtenir le token d'authentification de l'utilisateur actuel
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Vous devez être connecté pour inviter un utilisateur');
  }

  // Appeler l'endpoint backend sécurisé
  const response = await fetch(`${API_BASE_URL}/auth/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      email,
      metadata,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Erreur lors de l\'invitation' }));
    throw new Error(error.detail || `Erreur ${response.status}: ${response.statusText}`);
  }

  const data: InviteResponse = await response.json();
  return data;
}



