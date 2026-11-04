import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const N8N_URL = "https://icomtv.app.n8n.cloud/webhook/219ca018-0d0b-4fea-81b7-f078e259b7fe";

// Sends the full client record to n8n once the client is signed and paid. Sent at most once.
export const notifyClientFinalized = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await context.supabase.from("clients").select("*").eq("id", data.clientId).maybeSingle();
    if (!client || !client.paid || !client.contract_signed || client.finalized_webhook_sent_at) return { sent: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: claimed } = await supabaseAdmin.from("clients")
      .update({ finalized_webhook_sent_at: new Date().toISOString() })
      .eq("id", client.id).is("finalized_webhook_sent_at", null).select("id");
    if (!claimed?.length) return { sent: false };
    let seller: { full_name: string | null; email: string | null } | null = null;
    if (client.seller_id) {
      const { data: s } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", client.seller_id).maybeSingle();
      seller = s;
    }
    const { finalized_webhook_sent_at: _x, ...rest } = client;
    const res = await fetch(N8N_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "cliente_finalizado", client: { ...rest, seller_name: seller?.full_name ?? null, seller_email: seller?.email ?? null } }),
    });
    if (!res.ok) {
      await supabaseAdmin.from("clients").update({ finalized_webhook_sent_at: null }).eq("id", client.id);
      throw new Error(`Webhook n8n falhou (${res.status})`);
    }
    return { sent: true };
  });
