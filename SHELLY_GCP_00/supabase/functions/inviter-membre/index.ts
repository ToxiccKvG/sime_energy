/**
 * Edge Function : inviter-membre
 *
 * Accès à la plateforme sur invitation seulement (décision du 21/10/2026).
 * Un admin d'organisation invite une personne par son e-mail, avec un rôle
 * (membre ou admin). La fonction :
 *  1. vérifie que l'appelant est admin de l'organisation ;
 *  2. enregistre l'invitation (code à 12 caractères, valable 7 jours) ;
 *  3. prépare le lien personnel :
 *     - personne sans compte : lien d'invitation Supabase (generateLink,
 *       type « invite ») qui crée l'accès et ramène sur /invite?code=… où
 *       elle choisit son mot de passe puis rejoint l'organisation ;
 *     - personne qui a déjà un compte : lien /invite?code=…, elle se
 *       connecte avec son mot de passe habituel puis accepte.
 * Aucun e-mail n'est envoyé : l'admin copie le lien et le transmet
 * (option retenue le 21/10 ; l'envoi automatique viendra avec un SMTP).
 * La clé service_role ne quitte jamais le serveur.
 * Déployée AVEC vérification JWT (pas de --no-verify-jwt).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Adresses de la plateforme vers lesquelles un lien peut ramener
const ORIGINES = (Deno.env.get("INVITE_ALLOWED_ORIGINS") ?? "http://localhost:8080")
  .split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);

const VALIDITE_JOURS = 7;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function codeInvitation(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const octets = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(octets, (o) => chars[o % chars.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  // Appelant : jeton de la session
  const jeton = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: errUser } = await supabase.auth.getUser(jeton);
  if (errUser || !user) return json({ error: "Connexion requise" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Corps JSON invalide" }, 400); }

  const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "admin" ? "admin" : "member";
  const origine = typeof body.origin === "string" ? body.origin.replace(/\/$/, "") : "";

  if (!organizationId) return json({ error: "Organisation manquante" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Adresse e-mail invalide" }, 400);
  if (!ORIGINES.includes(origine)) return json({ error: `Adresse de la plateforme non autorisée : ${origine}` }, 400);

  // L'appelant doit être admin de l'organisation
  const { data: membre } = await supabase
    .from("organization_users")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membre?.role !== "admin") return json({ error: "Seul un admin de l'organisation peut inviter" }, 403);

  // Invitation
  const code = codeInvitation();
  const expiresAt = new Date(Date.now() + VALIDITE_JOURS * 86_400_000).toISOString();
  const { error: errInv } = await supabase.from("organization_invitations").insert({
    organization_id: organizationId,
    code,
    inviter_id: user.id,
    invited_email: email,
    expires_at: expiresAt,
    status: "pending",
    role,
  });
  if (errInv) return json({ error: `Invitation non enregistrée : ${errInv.message}` }, 500);

  // Lien personnel
  const retour = `${origine}/invite?code=${code}`;
  const { data: lienData, error: errLien } = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: retour },
  });

  if (!errLien && lienData?.properties?.action_link) {
    return json({ lien: lienData.properties.action_link, compte_existant: false, code, expires_at: expiresAt, role });
  }
  // Compte déjà existant : il se connecte puis accepte sur /invite?code=…
  if (errLien && /already|registered|exists/i.test(errLien.message)) {
    return json({ lien: retour, compte_existant: true, code, expires_at: expiresAt, role });
  }
  await supabase.from("organization_invitations").update({ status: "revoked" }).eq("code", code);
  return json({ error: `Lien non créé : ${errLien?.message ?? "réponse inattendue"}` }, 500);
});
