// ============================================================
// IOT — Arbre des circuits : ne jamais additionner une branche à son parent
//
// parent_device_id (shelly_device_roles) dit quel compteur alimente un circuit.
// Un site sans arbre déclaré reste à plat : ses départs sont des branches
// distinctes, comme avant.
// ============================================================

import type { MethodeConsommation, SiteBilan } from '@/lib/iot-supabase-service';

export interface RoleCircuit {
  device_id: string;
  role: string;
  parent_device_id?: string | null;
}

/** Départs alimentés par un autre départ : déjà comptés dans leur parent. */
export function departsImbriques(roles: RoleCircuit[]): Set<string> {
  const parId = new Map(roles.map(r => [r.device_id, r]));
  return new Set(roles
    .filter(r => r.role === 'DEPART' && r.parent_device_id && parId.get(r.parent_device_id)?.role === 'DEPART')
    .map(r => r.device_id));
}

const ROLE_DE_METHODE: Partial<Record<MethodeConsommation, string>> = {
  arrivee: 'M1_RESEAU', charge_M3: 'M3_CHARGE', departs: 'DEPART',
};

/**
 * Identifiants de la série qu'on peut additionner sans double comptage, site
 * par site : la méthode déclarée, sinon l'arrivée, sinon les départs de premier
 * niveau. null = pas de rôles sur ces lignes (fichier importé) : rien à restreindre.
 */
export function idsSerieSansDoubleCompte(
  appareils: { deviceId: string; site: string }[],
  roles: RoleCircuit[],
  sitesBilan: SiteBilan[],
): Set<string> | null {
  const roleDe = new Map(roles.map(r => [r.device_id, r.role]));
  if (!appareils.some(a => roleDe.has(a.deviceId))) return null;
  const imbriques = departsImbriques(roles);
  const methodeDe = new Map(sitesBilan.map(b => [b.site, b.methode]));
  const parSite = new Map<string, string[]>();
  for (const a of appareils) parSite.set(a.site, [...(parSite.get(a.site) ?? []), a.deviceId]);

  const ids = new Set<string>();
  for (const [site, liste] of parSite) {
    const duRole = (role: string) => liste.filter(id => roleDe.get(id) === role && !(role === 'DEPART' && imbriques.has(id)));
    const declare = ROLE_DE_METHODE[methodeDe.get(site) as MethodeConsommation];
    const choix = [declare, 'M1_RESEAU', 'M3_CHARGE', 'DEPART'].map(r => (r ? duRole(r) : [])).find(l => l.length > 0);
    // Aucun rôle de consommation sur ce site : ses lignes restent telles quelles
    for (const id of choix ?? liste) ids.add(id);
  }
  return ids;
}
