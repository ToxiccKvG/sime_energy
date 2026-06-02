import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function safeNum(val: unknown, min: number, max: number): number | null {
  if (val == null) return null;
  const n = Number(val);
  if (!isFinite(n) || n < min || n > max) { if (isFinite(n)) console.warn(`[webhook sanity] ${n} hors [${min},${max}]`); return null; }
  return Math.round(n * 10000) / 10000;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // device_id et site passés en query params: ?device_id=xxx&site=yyy
  const url = new URL(req.url);
  const device_id = url.searchParams.get("device_id") ?? (payload.src as string) ?? "unknown";
  const site = url.searchParams.get("site") ?? null;

  const ts = (payload.ts as string) ?? new Date().toISOString();

  // Données énergie Shelly Pro 3EM / EM3
  const params = (payload.params as Record<string, unknown>) ?? payload;
  const em = (params["em:0"] as Record<string, unknown>) ?? null;

  if (!em) {
    // Message non-énergie (ex: ping, status) — on ignore silencieusement
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("shelly_cl").insert({
    device_id,
    site,
    ts,
    name: device_id,
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
    console.error("Supabase insert error:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
