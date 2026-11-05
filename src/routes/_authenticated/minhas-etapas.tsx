import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useOnboardings } from "@/lib/session";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/minhas-etapas")({
  head: () => ({ meta: [{ title: "Minhas etapas — ICOM" }] }),
  component: MinhasEtapas,
});

function MinhasEtapas() {
  const { data: me } = useMe();
  const { data: onbs = [] } = useOnboardings();
  const { data: etapas = [], isLoading } = useQuery({
    queryKey: ["minhas-etapas", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("onboarding_etapas_situacao").select("*")
        .eq("responsavel_id", me!.id).not("status", "in", "(concluida,pulada,pendente)").order("prazo_em");
      if (error) throw error;
      return data;
    },
  });
  const onb = (id: string | null) => onbs.find((o) => o.id === id);

  return (
    <div className="space-y-6">
      <PageHeader title="Minhas etapas" description="Etapas em que você é o responsável, das mais urgentes para as mais tranquilas." />
      {!isLoading && etapas.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nenhuma etapa com você agora"
          description="Quando um gestor atribuir você como responsável de uma etapa em andamento, ela aparece aqui com o prazo e a situação de SLA."
          action={<Button variant="outline" asChild><Link to="/painel">Ver todos os onboardings</Link></Button>} />
      ) : (
        <Card className="divide-y">
          {etapas.map((e) => {
            const o = onb(e.onboarding_id);
            return (
              <Link key={e.id} to="/onboardings/$id" params={{ id: e.onboarding_id! }} search={{ etapa: e.id! }}
                className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-[#FAFAFC]">
                <div className="min-w-0">
                  <div className="font-semibold text-gold">{e.nome}</div>
                  <div className="text-xs text-muted-foreground">{o?.cliente_nome} · {o?.produto_nome} · {e.fase_nome}</div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums text-muted-foreground">{e.prazo_em ? format(parseISO(e.prazo_em), "dd/MM/yyyy", { locale: ptBR }) : "—"}</span>
                  <StatusBadge status={e.situacao} />
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
