// Coleta da retenção 2x por dia (08h e 14h, horário de Brasília = 11h e 17h UTC).
import { ambienteRetencao, sincronizarRetencao } from "../../src/lib/retencao-api.ts";

export default async () => {
  const amb = ambienteRetencao(process.env);
  if (!amb) {
    console.error(
      "[retencao] variáveis RETENCAO_API_CHAVE / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes",
    );
    return new Response("não configurado", { status: 500 });
  }
  const r = await sincronizarRetencao(amb, "agendado");
  console.log("[retencao] sincronização", JSON.stringify(r));
  return new Response(JSON.stringify(r), { status: r.ok ? 200 : 502 });
};

export const config = { schedule: "0 11,17 * * *" };
