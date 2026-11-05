import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardings } from "@/lib/session";
import { CLIENT_STATUS_TOKEN, STATUS_LABEL, type ClientStatus } from "@/lib/crm";
import { Card, ColorBadge, EmptyState, FilterLabel, PageHeader, StatusBadge } from "@/components/app/ui";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/carteira")({
  head: () => ({ meta: [{ title: "Clientes — ICOM" }] }),
  component: Carteira,
});

const STATUS_VIEW: Record<string, ClientStatus> = {
  aguardando_assinatura: "aguardando_assinatura", aguardando_pagamento: "aguardando_pagamento",
  aguardando_verificacao: "aguardando_verificacao", pronto_para_liberar: "pronto_para_liberar",
  em_onboarding: "em_onboarding", onboarding_concluido: "finalizado",
};

function Carteira() {
  const [q, setQ] = useState("");
  const { data: onbs = [] } = useOnboardings();
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes-view"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => clientes.filter((c) => !q || `${c.nome} ${c.codigo_externo ?? ""} ${c.cidade ?? ""}`.toLowerCase().includes(q.toLowerCase())), [clientes, q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Clientes" description="Todos os clientes, com a etapa do contrato e os onboardings de cada produto." />
      <Card className="p-4">
        <div className="w-72">
          <FilterLabel htmlFor="q">Buscar</FilterLabel>
          <Input id="q" placeholder="Nome, código ou cidade..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      {!isLoading && rows.length === 0 ? (
        <EmptyState icon={Building2} title="Nenhum cliente encontrado" description="Os clientes cadastrados na etapa de Contratos aparecem aqui." />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-[#F8FAFC]">
              <tr>{["Cliente", "Código", "Cidade/UF", "Contato", "Contrato", "Onboardings"].map((h) => <th key={h} className="filter-label px-4 py-2.5 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const st = STATUS_VIEW[c.status_contrato ?? ""] ?? "aguardando_assinatura";
                const dele = onbs.filter((o) => o.cliente_id === c.id);
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-[#FAFAFC]">
                    <td className="px-4 py-3"><Link to="/clientes/$id" params={{ id: c.id! }} className="font-semibold text-[#1F2937] hover:text-primary hover:underline">{c.nome}</Link>
                      <div className="text-[11px] text-muted-foreground">{c.segmento ?? "—"}</div></td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.codigo_externo ?? "—"}</td>
                    <td className="px-4 py-3">{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</td>
                    <td className="px-4 py-3"><div>{c.contato_nome ?? "—"}</div><div className="text-[11px] text-muted-foreground">{c.telefone}</div></td>
                    <td className="px-4 py-3"><StatusBadge status={CLIENT_STATUS_TOKEN[st]} label={STATUS_LABEL[st]} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {dele.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {dele.map((o) => (
                          <Link key={o.id} to="/onboardings/$id" params={{ id: o.id! }} className="inline-flex items-center gap-1.5 rounded hover:opacity-80" title="Abrir onboarding">
                            <ColorBadge color={o.produto_cor ?? "#7C3AED"}>{o.produto_nome}</ColorBadge>
                            <StatusBadge status={o.situacao} />
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
