import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Central de Onboarding ICOM" },
      { name: "description", content: "Controle de clientes pagantes, contratos e onboarding." },
      { property: "og:title", content: "Central de Onboarding ICOM" },
      { property: "og:description", content: "Controle de clientes pagantes, contratos e onboarding." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/painel" : "/auth" });
  },
  component: () => null,
});
