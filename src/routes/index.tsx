import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Icom — Vendas & CS" },
      { name: "description", content: "Controle de clientes pagantes, contratos e onboarding." },
      { property: "og:title", content: "Icom — Vendas & CS" },
      { property: "og:description", content: "Controle de clientes pagantes, contratos e onboarding." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/auth" });
  },
  component: () => null,
});
