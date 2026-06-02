import { supabase } from '@/lib/supabase';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/V1';
const STORAGE_KEY = 'benjamin_history';
const MAX_MESSAGES = 50;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── localStorage helpers ─────────────────────────────────────────────────

export function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Page context builder ─────────────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  '/':            'Tableau de bord',
  '/audits':      'Liste des projets',
  '/inventaire':  'Inventaire énergétique',
  '/facturation': 'Module Facturation',
  '/rapport':     'Rapports',
  '/parametres':  'Paramètres',
  '/compte':      'Mon compte',
};

function resolvePageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  if (pathname.startsWith('/audits/')) return 'Détail du projet';
  return pathname;
}

export async function buildPageContext(
  pathname: string,
  searchParams: URLSearchParams
): Promise<string> {
  const parts: string[] = [];

  // ─── Global context (always fetched) ─────────────────────────
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: orgUsers } = await supabase
        .from('organization_users')
        .select('organization_id')
        .eq('user_id', user.id);

      const orgId = orgUsers?.[0]?.organization_id as string | undefined;

      parts.push('=== CONTEXTE GLOBAL SIMEE ===');
      parts.push(`Utilisateur : ${user.email}`);

      if (orgId) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .single();
        if (org) parts.push(`Organisation : ${org.name}`);

        const { data: auditList } = await supabase
          .from('audits')
          .select('name, status, client_type, completion_percentage')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (auditList && auditList.length > 0) {
          parts.push(`\nProjets de l'organisation (${auditList.length}) :`);
          for (const a of auditList) {
            parts.push(
              `  - "${a.name}" | Type: ${a.client_type ?? 'N/D'} | Statut: ${a.status} | Complété: ${a.completion_percentage ?? 0}%`
            );
          }
        }
      }
    }
  } catch {
    // Global context is best-effort — silently skip on error
  }

  // ─── Page-specific context ────────────────────────────────────
  const auditIdFromParam = searchParams.get('auditId');
  const auditIdFromRoute = pathname.match(/\/audits\/([^/]+)/)?.[1];
  const auditId = auditIdFromParam ?? auditIdFromRoute;

  parts.push(`\n=== PAGE ACTUELLE ===`);
  parts.push(`Page : ${resolvePageLabel(pathname)}`);

  if (!auditId) return parts.join('\n');

  // ─── Audit-specific deep context ─────────────────────────────
  try {
    const [auditRes, sitesRes, buildingsRes, invoicesRes, measRes] = await Promise.all([
      supabase
        .from('audits')
        .select('name, status, client_type, completion_percentage, general_info, personnel')
        .eq('id', auditId)
        .single(),
      supabase.from('audit_sites').select('id, name, address, status').eq('audit_id', auditId),
      supabase
        .from('audit_buildings')
        .select('id, site_id, building_name, building_type, surface_batie')
        .eq('audit_id', auditId),
      supabase
        .from('audit_invoices')
        .select('invoice_date, amount, status')
        .eq('audit_id', auditId)
        .order('invoice_date', { ascending: false })
        .limit(12),
      supabase
        .from('audit_measurements')
        .select('sensor_name, sensor_type, unit, recorded_at')
        .eq('audit_id', auditId)
        .order('recorded_at', { ascending: false })
        .limit(20),
    ]);

    if (auditRes.error || !auditRes.data) {
      parts.push(`(Projet non chargé)`);
      return parts.join('\n');
    }

    const a = auditRes.data;
    parts.push(`\nProjet ouvert : "${a.name}"`);
    parts.push(`Type client : ${a.client_type ?? 'non défini'}`);
    parts.push(`Statut : ${a.status} | Complétion : ${a.completion_percentage ?? 0}%`);

    // Informations générales (flatten JSONB, skip nulls/empties)
    if (a.general_info && typeof a.general_info === 'object') {
      const entries = Object.entries(a.general_info as Record<string, unknown>).filter(
        ([, v]) => v !== null && v !== '' && v !== undefined
      );
      if (entries.length > 0) {
        parts.push(`\nInformations générales :`);
        for (const [k, v] of entries) {
          parts.push(`  ${k}: ${String(v)}`);
        }
      }
    }

    // Personnel (flatten JSONB)
    if (a.personnel && typeof a.personnel === 'object') {
      const entries = Object.entries(a.personnel as Record<string, unknown>).filter(
        ([, v]) => v !== null && v !== ''
      );
      if (entries.length > 0) {
        parts.push(`\nPersonnel clé :`);
        for (const [k, v] of entries) {
          parts.push(`  ${k}: ${String(v)}`);
        }
      }
    }

    // Sites + bâtiments
    if (sitesRes.data && sitesRes.data.length > 0) {
      parts.push(`\nSites (${sitesRes.data.length}) :`);
      for (const site of sitesRes.data) {
        parts.push(`  - "${site.name}" | Adresse: ${site.address ?? 'N/D'} | Statut: ${site.status}`);
        const bldgs = buildingsRes.data?.filter((b) => b.site_id === site.id) ?? [];
        for (const b of bldgs) {
          parts.push(
            `    • ${b.building_name} (${b.building_type ?? 'type N/D'}) | Surface: ${b.surface_batie ?? '?'} m²`
          );
        }
      }
    }

    // Factures
    if (invoicesRes.data && invoicesRes.data.length > 0) {
      const total = invoicesRes.data.reduce((s, i) => s + (i.amount ?? 0), 0);
      parts.push(
        `\nFactures (${invoicesRes.data.length} factures, total: ${total.toLocaleString('fr-FR')} FCFA) :`
      );
      for (const inv of invoicesRes.data.slice(0, 6)) {
        parts.push(
          `  - ${inv.invoice_date ?? 'date N/D'} | ${(inv.amount ?? 0).toLocaleString('fr-FR')} FCFA | ${inv.status}`
        );
      }
      if (invoicesRes.data.length > 6) {
        parts.push(`  ... et ${invoicesRes.data.length - 6} autre(s)`);
      }
    }

    // Mesures
    if (measRes.data && measRes.data.length > 0) {
      const byType: Record<string, number> = {};
      for (const m of measRes.data) {
        byType[m.sensor_type] = (byType[m.sensor_type] ?? 0) + 1;
      }
      parts.push(`\nMesures (${measRes.data.length} enregistrements) :`);
      for (const [type, count] of Object.entries(byType)) {
        parts.push(`  - ${type}: ${count} mesure(s)`);
      }
      if (measRes.data[0]?.recorded_at) {
        parts.push(`  Dernière mesure: ${measRes.data[0].recorded_at}`);
      }
    }
  } catch {
    parts.push(`(Données du projet non chargées)`);
  }

  return parts.join('\n');
}

// ─── Streaming chat ───────────────────────────────────────────────────────

export async function* streamChat(
  messages: ChatMessage[],
  context: string
): AsyncGenerator<string, void, unknown> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    });
  } catch {
    throw new Error('Impossible de contacter Benjamin. Vérifiez que le backend est démarré.');
  }

  if (!response.ok) {
    throw new Error(`Erreur serveur : ${response.status}`);
  }

  if (!response.body) {
    throw new Error('La réponse ne contient pas de flux de données.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines[lines.length - 1]; // keep incomplete line

      for (const line of lines.slice(0, -1)) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const chunk = JSON.parse(data);
          // Check for error payload from backend
          if (chunk.error) throw new Error(chunk.error);
          const token: string | undefined = chunk.choices?.[0]?.delta?.content;
          if (token) yield token;
        } catch (e) {
          if (e instanceof SyntaxError) continue; // malformed chunk — skip
          throw e;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
