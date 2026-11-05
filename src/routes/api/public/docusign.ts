import { createFileRoute } from "@tanstack/react-router";
import { chavesConfiguradas, receberDocusign } from "@/lib/docusign-webhook";

export const Route = createFileRoute("/api/public/docusign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return receberDocusign(request, chavesConfiguradas(), {
          buscar: async (envelopeId) => {
            const { data, error } = await supabaseAdmin
              .from("docusign_envelopes")
              .select("status, evento_em")
              .eq("envelope_id", envelopeId)
              .maybeSingle();
            if (error) throw error;
            return data;
          },
          gravar: async (env) => {
            // Só dados do envelope: o vínculo com o cliente é decidido no banco (automático) ou na tela (manual).
            const { error } = await supabaseAdmin
              .from("docusign_envelopes")
              .upsert(env, { onConflict: "envelope_id" });
            if (error) throw error;
          },
        });
      },
    },
  },
});
