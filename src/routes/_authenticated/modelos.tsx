import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProdutos } from "@/lib/session";
import { Card, ColorBadge, EmptyState, PageHeader } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/modelos")({
  head: () => ({ meta: [{ title: "Modelos de onboarding — ICOM" }] }),
  component: Modelos,
});

const STATUS_MODELO: Record<string, { label: string; cls: string }> = {
  publicado: { label: "Publicado", cls: "bg-[#D1FAE5] text-[#065F46]" },
  rascunho: { label: "Rascunho", cls: "bg-[#F1F5F9] text-[#64748B]" },
  arquivado: { label: "Arquivado", cls: "bg-[#F1F5F9] text-[#94A3B8] line-through" },
};

function Modelos() {
  const { data: produtos = [] } = useProdutos();
  const { data, isLoading } = useQuery({
    queryKey: ["modelos-resumo"],
    queryFn: async () => {
      const [m, e, f] = await Promise.all([
        supabase.from("modelos").select("*").order("versao", { ascending: false }),
        supabase.from("modelo_etapas").select("id, modelo_id, fase_id, nome, ordem, sla_dias, principal").order("ordem"),
        supabase.from("modelo_fases").select("*").order("ordem"),
      ]);
      if (m.error) throw m.error;
      return { modelos: m.data, etapas: e.data ?? [], fases: f.data ?? [] };
    },
  });
  const modelos = data?.modelos ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Modelos de onboarding" description="O passo a passo de cada linha de produto. Cada onboarding copia o modelo publicado no momento em que começa." />
      {!isLoading && modelos.length === 0 ? (
        <EmptyState icon={Workflow} title="Nenhum modelo criado" description="Crie o primeiro modelo para definir as fases, etapas, SLAs e checklists de um produto." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {modelos.map((m) => {
            const p = produtos.find((x) => x.id === m.produto_id);
            const etapas = (data?.etapas ?? []).filter((e) => e.modelo_id === m.id);
            const fases = (data?.fases ?? []).filter((f) => f.modelo_id === m.id);
            const st = STATUS_MODELO[m.status] ?? { label: "Rascunho", cls: "bg-[#F1F5F9] text-[#64748B]" };
            return (
              <Card key={m.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {p && <ColorBadge color={p.cor}>{p.nome}</ColorBadge>}
                    <h2 className="mt-2 text-base font-semibold">{m.nome}</h2>
                    <div className="text-xs text-muted-foreground">
                      Versão {m.versao} · dias {m.calendario === "uteis" ? "úteis" : "corridos"} · risco a partir de {m.limiar_risco_pct}% do SLA
                    </div>
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {fases.map((f) => (
                    <div key={f.id}>
                      <div className="filter-label mb-1.5 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.cor }} />{f.nome}</div>
                      <ol className="space-y-1">
                        {etapas.filter((e) => e.fase_id === f.id).map((e) => (
                          <li key={e.id} className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2.5 py-1.5 text-sm">
                            <span className={e.principal ? "font-medium" : "text-muted-foreground"}>{e.ordem}. {e.nome}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{e.sla_dias}d</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-4 text-xs text-muted-foreground">
                  {etapas.length} etapas · SLA total {etapas.reduce((s, e) => s + e.sla_dias, 0)} dias
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
