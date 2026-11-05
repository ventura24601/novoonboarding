import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Vínculo manual de envelopes DocuSign (só admin). Grava com service role porque o envelope concluído
 * marca o contrato como verificado, e essa verificação é server-managed (trigger clients_release_guard).
 */
async function exigirAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin");
  if (!data?.length) throw new Error("Apenas administradores vinculam assinaturas.");
}

export const vincularEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ envelopeId: z.string().uuid(), clienteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("docusign_envelopes")
      .update({
        cliente_id: data.clienteId,
        vinculo: "manual",
        vinculo_motivo: "Vinculado manualmente",
        vinculado_por: context.userId,
        vinculado_em: new Date().toISOString(),
        ignorado: false,
      })
      .eq("id", data.envelopeId)
      .is("cliente_id", null)
      .select("id, status");
    if (error) throw new Error(error.message);
    if (!rows?.length)
      throw new Error("Este envelope já está vinculado. Desvincule antes de trocar o cliente.");
    return { ok: true, assinado: rows[0]!.status === "completed" };
  });

export const desvincularEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ envelopeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("docusign_envelopes")
      .update({
        cliente_id: null,
        vinculo: "manual",
        vinculo_motivo: "Desvinculado manualmente",
        vinculado_por: context.userId,
        vinculado_em: new Date().toISOString(),
      })
      .eq("id", data.envelopeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ignorarEnvelope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ envelopeId: z.string().uuid(), ignorado: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("docusign_envelopes")
      .update({ ignorado: data.ignorado })
      .eq("id", data.envelopeId)
      .is("cliente_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
