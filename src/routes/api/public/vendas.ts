import { createFileRoute } from "@tanstack/react-router";
import { receberVendas, tokensConfigurados } from "@/lib/vendas";

export const Route = createFileRoute("/api/public/vendas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return receberVendas(request, tokensConfigurados(), {
          gravar: async (v) => {
            // Reenvio do mesmo conteúdo não cria outra venda (chave única).
            const { data: existente, error: e1 } = await supabaseAdmin
              .from("vendas_recebidas")
              .select("id")
              .eq("chave", v.chave)
              .maybeSingle();
            if (e1) throw e1;
            if (existente) return { id: existente.id, nova: false };
            const { data, error } = await supabaseAdmin
              .from("vendas_recebidas")
              .insert(v)
              .select("id")
              .single();
            if (error) {
              if (error.code === "23505") {
                const { data: d } = await supabaseAdmin
                  .from("vendas_recebidas")
                  .select("id")
                  .eq("chave", v.chave)
                  .single();
                return { id: d!.id, nova: false };
              }
              throw error;
            }
            return { id: data.id, nova: true };
          },
        });
      },
    },
  },
});
