// Alerte email quand un compte Shelly renvoie 401 (auth_key révoquée, p.ex. après
// un changement de mot de passe). Appelée toutes les 5 min par pg_cron.
// Déployée avec --no-verify-jwt (comme poll-shelly).
// Secrets : RESEND_API_KEY, ALERT_EMAIL_TO (optionnel : ALERT_EMAIL_FROM).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DELAY_MS = 5 * 60_000;       // 401 persistant avant la 1re alerte
const REMINDER_MS = 6 * 3_600_000; // rappel tant que ce n'est pas réglé

async function sendMail(subject: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("ALERT_EMAIL_TO");
  if (!key || !to) throw new Error("RESEND_API_KEY / ALERT_EMAIL_TO manquant");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ALERT_EMAIL_FROM") ?? "SIME Alertes <onboarding@resend.dev>",
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

Deno.serve(async () => {
  try {
    const { data: accounts, error } = await supabase
      .from("shelly_accounts")
      .select("site, last_poll_status, last_error_msg, last_poll_at")
      .eq("actif", true);
    if (error) throw error;
    const { data: states } = await supabase.from("shelly_alert_state").select("*");
    const stateBySite = new Map((states ?? []).map((s) => [s.site, s]));
    const now = Date.now();
    const log: string[] = [];

    for (const a of accounts ?? []) {
      const st = stateBySite.get(a.site);
      const revoked = a.last_poll_status === "error" && /\b401\b/.test(a.last_error_msg ?? "");

      if (revoked) {
        if (!st) {
          await supabase.from("shelly_alert_state").insert({ site: a.site });
          log.push(`${a.site}: 401 détecté`);
          continue;
        }
        const age = now - new Date(st.first_seen).getTime();
        const sinceSent = st.last_sent ? now - new Date(st.last_sent).getTime() : Infinity;
        if (age >= DELAY_MS && sinceSent >= REMINDER_MS) {
          await sendMail(
            `⚠️ Collecte Shelly arrêtée — ${a.site}`,
            `Le compte Shelly « ${a.site} » renvoie une erreur 401 depuis ${Math.round(age / 60000)} min : ` +
            `l'auth_key a été révoquée (changement de mot de passe Shelly Cloud ?). La collecte de ce site est arrêtée.\n\n` +
            `Pour rétablir : control.shelly.cloud → Settings → Cloud → Auth Key, puis mettre à jour la clé du site ` +
            `« ${a.site} » dans la table shelly_accounts (Paramètres).\n\n` +
            `Dernière erreur : ${a.last_error_msg}\nDernier poll : ${a.last_poll_at}`,
          );
          await supabase.from("shelly_alert_state").update({ last_sent: new Date().toISOString() }).eq("site", a.site);
          log.push(`${a.site}: alerte envoyée`);
        }
      } else if (st) {
        if (st.last_sent) {
          await sendMail(
            `✅ Collecte Shelly rétablie — ${a.site}`,
            `Le compte Shelly « ${a.site} » répond de nouveau normalement.`,
          );
        }
        await supabase.from("shelly_alert_state").delete().eq("site", a.site);
        log.push(`${a.site}: rétabli`);
      }
    }
    return new Response(JSON.stringify({ ok: true, log }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
