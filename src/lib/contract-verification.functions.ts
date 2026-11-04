import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Verificação manual da assinatura pelo admin, enquanto a integração com o provedor de assinatura
 * não existe. Continua server-managed: o cliente nunca grava contract_verified_at diretamente.
 * Registra quem confirmou e a origem ("manual").
 */
export const confirmContractManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin");
    if (!isAdmin?.length) throw new Error("Apenas administradores confirmam contratos manualmente.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin.from("clients")
      .update({ contract_signed: true, contract_verified_at: new Date().toISOString(), contract_verified_by: context.userId, contract_verification_source: "manual" })
      .eq("id", data.clientId).is("contract_verified_at", null).select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Este contrato já foi verificado.");
    return { ok: true };
  });
