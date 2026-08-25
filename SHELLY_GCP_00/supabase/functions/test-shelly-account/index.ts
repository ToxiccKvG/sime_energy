/**
 * Edge Function : test-shelly-account
 * Teste la connexion à un compte Shelly Cloud sans jamais renvoyer
 * auth_key au navigateur. Deux modes :
 *  - { account_id } : lit la clé côté serveur (service_role) pour un
 *    compte déjà enregistré dans shelly_accounts.
 *  - { auth_key, server_url } : teste une clé pas encore enregistrée
 *    (saisie en cours dans le formulaire d'ajout).
 * Déployée AVEC vérification JWT (pas de --no-verify-jwt) : seul un
 * utilisateur authentifié de la plateforme peut l'appeler.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Corps JSON invalide" }, 400); }

  let authKey: string | undefined;
  let serverUrl: string | undefined;

  if (typeof body.account_id === "string") {
    const { data, error } = await supabase
      .from("shelly_accounts")
      .select("auth_key, server_url")
      .eq("id", body.account_id)
      .single();
    if (error || !data) return json({ ok: false, error: "Compte introuvable" }, 404);
    authKey = data.auth_key;
    serverUrl = data.server_url;
  } else if (typeof body.auth_key === "string" && typeof body.server_url === "string") {
    authKey = body.auth_key;
    serverUrl = body.server_url;
  } else {
    return json({ ok: false, error: "Paramètres manquants (account_id, ou auth_key+server_url)" }, 400);
  }

  try {
    const resp = await fetch(`${serverUrl}/interface/device/list`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ auth_key: authKey! }),
    });
    const data = await resp.json();
    if (data?.isok) {
      const devices = data?.data?.deviceList ?? [];
      return json({ ok: true, nb_devices: devices.length });
    }
    return json({ ok: false, error: JSON.stringify(data?.errors ?? "Réponse invalide") });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
