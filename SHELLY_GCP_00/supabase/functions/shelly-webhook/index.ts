// ============================================================
//  Webhook Shelly — ingestion directe depuis un appareil.
//
//  Cette fonction est déployée SANS vérification de JWT : elle est
//  appelable publiquement, puisque c'est un appareil Shelly qui la
//  contacte, pas un utilisateur connecté. Le secret partagé est donc
//  la SEULE barrière — d'où le refus de démarrer sans lui (voir plus
//  bas), et la validation de tout ce que l'appelant fournit.
//
//  Durcissement du 2026-09-25 :
//   • secret OBLIGATOIRE : sans SHELLY_WEBHOOK_SECRET, on refuse tout.
//     Avant, `if (webhookSecret)` sautait silencieusement le contrôle
//     quand la variable n'était pas définie — et elle ne l'était pas
//     en production : le point d'entrée était grand ouvert.
//   • comparaison à temps constant (pas de fuite par timing).
//   • secret accepté en en-tête X-Webhook-Secret, ou à défaut en query
//     param : le firmware Shelly (Webhook.Create) ne sait envoyer que
//     des URL, sans en-têtes. Le query param reste donc supporté, mais
//     l'en-tête est préféré dès que l'appelant sait l'émettre.
//   • device_id vérifié contre les appareils connus. Avant, il était
//     pris tel quel dans l'URL : n'importe qui pouvait injecter des
//     mesures sous l'identité de n'importe quel compteur.
//   • site DÉDUIT de l'appareil, plus jamais lu depuis l'URL.
//   • horodatage borné : pas de mesure antidatée ni dans le futur.
//   • taille du corps plafonnée.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 64 * 1024;       // un message Shelly fait ~1 Ko
const TS_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const TS_PAST_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function safeNum(val: unknown, min: number, max: number): number | null {
  if (val == null) return null;
  const n = Number(val);
  if (!isFinite(n) || n < min || n > max) {
    if (isFinite(n)) console.warn(`[webhook sanity] ${n} hors [${min},${max}]`);
    return null;
  }
  return Math.round(n * 10000) / 10000;
}

/** Comparaison à temps constant : la durée ne dépend pas du préfixe commun. */
function secretsMatch(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  // La différence de longueur est déjà un écart, mais on parcourt quand
  // même la totalité pour ne pas révéler laquelle par le temps de réponse.
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Un appareil n'est accepté que s'il est déjà connu de la plateforme.
 * Deux sources : le catalogue (vue matérialisée, rafraîchie par lots,
 * donc en retard de quelques dizaines de minutes) et la table des rôles
 * (à jour immédiatement). L'union des deux évite qu'un appareil
 * fraîchement qualifié soit rejeté en attendant le rafraîchissement.
 */
async function resolveDevice(deviceId: string): Promise<{ site: string } | null> {
  const { data: cat } = await supabase
    .from("shelly_devices_catalog")
    .select("site")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (cat?.site) return { site: cat.site };

  const { data: role } = await supabase
    .from("shelly_device_roles")
    .select("device_id")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!role) return null;

  // Connu par son rôle mais pas encore au catalogue : on retrouve son site
  // sur sa dernière mesure brute.
  const { data: last } = await supabase
    .from("shelly_cl")
    .select("site")
    .eq("device_id", deviceId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  return last?.site ? { site: last.site } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── 1. Secret obligatoire ───────────────────────────────────
  // Absence de secret = configuration incomplète, pas « pas de contrôle ».
  const expected = Deno.env.get("SHELLY_WEBHOOK_SECRET");
  if (!expected) {
    console.error(
      "[webhook] SHELLY_WEBHOOK_SECRET absent — toute requête est refusée. " +
      "Définir le secret : supabase secrets set SHELLY_WEBHOOK_SECRET=<valeur>",
    );
    return json({ ok: false, error: "Webhook not configured" }, 503);
  }

  const url = new URL(req.url);
  const given = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
  if (!secretsMatch(given, expected)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  // ── 2. Corps borné et bien formé ────────────────────────────
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Payload too large" }, 413);
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Payload too large" }, 413);
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  // ── 3. Appareil : doit être connu, et c'est LUI qui porte le site ──
  const deviceId = (url.searchParams.get("device_id") ?? (payload.src as string) ?? "").trim();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(deviceId)) {
    return json({ ok: false, error: "Invalid device_id" }, 400);
  }
  const device = await resolveDevice(deviceId);
  if (!device) {
    console.warn(`[webhook] appareil inconnu rejeté : ${deviceId}`);
    return json({ ok: false, error: "Unknown device" }, 403);
  }
  // Le paramètre ?site= de l'URL est volontairement ignoré : le site
  // vient de la plateforme, pas de l'appelant.
  const site = device.site;

  // ── 4. Horodatage borné ─────────────────────────────────────
  const now = Date.now();
  let ts = new Date().toISOString();
  const claimed = payload.ts;
  if (claimed != null) {
    // Shelly émet un epoch en secondes ; on tolère aussi une chaîne ISO.
    const parsed = typeof claimed === "number"
      ? new Date(claimed * 1000)
      : new Date(String(claimed));
    const t = parsed.getTime();
    if (isFinite(t) && t <= now + TS_FUTURE_TOLERANCE_MS && t >= now - TS_PAST_TOLERANCE_MS) {
      ts = parsed.toISOString();
    } else {
      console.warn(`[webhook] horodatage hors bornes pour ${deviceId} : ${String(claimed)}`);
    }
  }

  // ── 5. Mesures énergie (Shelly Pro 3EM / EM3) ───────────────
  const params = (payload.params as Record<string, unknown>) ?? payload;
  const em = (params["em:0"] as Record<string, unknown>) ?? null;
  if (!em) {
    // Message non-énergie (ping, status…) : accusé de réception sans écriture.
    return json({ ok: true, skipped: true });
  }

  const { error } = await supabase.from("shelly_cl").insert({
    device_id: deviceId,
    site,
    ts,
    name: deviceId,
    device_type: "SPEM-003CEBEU",
    device_family: "ENERGIE_3PH",
    state: "on",
    power_w: safeNum(em.total_act_power, -1e5, 1e5),
    p_a: safeNum(em.a_act_power, -1e5, 1e5),
    p_b: safeNum(em.b_act_power, -1e5, 1e5),
    p_c: safeNum(em.c_act_power, -1e5, 1e5),
    v_a: safeNum(em.a_voltage, 0, 500),
    v_b: safeNum(em.b_voltage, 0, 500),
    v_c: safeNum(em.c_voltage, 0, 500),
    i_a: safeNum(em.a_current, 0, 1000),
    i_b: safeNum(em.b_current, 0, 1000),
    i_c: safeNum(em.c_current, 0, 1000),
  });

  if (error) {
    // Le détail reste dans les logs ; l'appelant n'a pas à connaître le schéma.
    console.error("[webhook] insert échoué :", error);
    return json({ ok: false, error: "Insert failed" }, 500);
  }

  return json({ ok: true });
});
