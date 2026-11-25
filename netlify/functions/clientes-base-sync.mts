// Coleta da base total de clientes 1x por dia (07h de Brasília = 10h UTC), antes da 1ª coleta da retenção.
import { ambienteBase, sincronizarClientesBase } from "../../src/lib/clientes-base-api.ts";

export default async () => {
  const amb = ambienteBase(process.env);
  if (!amb) {
    console.error("[base] variáveis da API / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
    return new Response("não configurado", { status: 500 });
  }
  const r = await sincronizarClientesBase(amb, "agendado");
  console.log("[base] sincronização", JSON.stringify(r));
  return new Response(JSON.stringify(r), { status: r.ok ? 200 : 502 });
};

export const config = { schedule: "0 10 * * *" };
