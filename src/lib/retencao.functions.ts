import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ambienteRetencao, sincronizarRetencao } from "./retencao-api";

/** Botão "Sincronizar agora" (operação). A chave da API fica só no servidor. */
export const sincronizarRetencaoAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: pode } = await context.supabase.rpc("pode_operar");
    if (!pode) throw new Error("Seu perfil não acessa a retenção.");
    const amb = ambienteRetencao(process.env);
    if (!amb) throw new Error("Integração da retenção não configurada no servidor.");
    return sincronizarRetencao(amb, "manual");
  });
