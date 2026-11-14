import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey){

    throw new Error('Supabase credentials are not defined in environment variables')
}

// Organisation sélectionnée dans l'application, envoyée à la base dans l'en-tête
// `x-organisation-id` : les règles d'accès IOT (user_sites()) ne renvoient alors que
// les sites de cette organisation, et seulement si l'utilisateur en est membre
// (migration 20261114_iot_sites_organisation_selectionnee). Tenue à jour par
// OrganizationProvider.
let organisationSelectionnee: string | null = null;

export function definirOrganisationSelectionnee(id: string | null): void {
    organisationSelectionnee = id;
}

// Seulement vers l'API REST (tables et fonctions SQL) : les fonctions serveur
// (inviter-membre…) n'autorisent pas cet en-tête dans leur CORS.
const fetchAvecOrganisation: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!organisationSelectionnee || !url.includes('/rest/v1/')) return fetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('x-organisation-id', organisationSelectionnee);
    return fetch(input, { ...init, headers });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchAvecOrganisation },
});
