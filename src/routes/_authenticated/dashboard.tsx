import { createFileRoute, Link } from "@tanstack/react-router";
import { FilePlus2, FileClock, CreditCard, Rocket, Timer, DollarSign } from "lucide-react";
import { useClients, useSellers } from "@/lib/session";
import { CLIENT_STATUS_TOKEN, clientStatus, formatBRLCompact, formatDuration, STATUS_LABEL } from "@/lib/crm";
import { Card, KpiCard, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel comercial — ICOM" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: clients = [] } = useClients();
  const { data: sellers = [] } = useSellers();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = clients.filter((c) => new Date(c.created_at) >= monthStart);
  const by = (s: string) => clients.filter((c) => clientStatus(c) === s).length;
  const durations = clients
    .filter((c) => c.onboarding_completed_at && c.onboarding_released_at)
    .map((c) => new Date(c.onboarding_completed_at!).getTime() - new Date(c.onboarding_released_at!).getTime());
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const revenue = thisMonth.reduce((s, c) => s + c.value, 0);
  const sellerName = (id: string | null) => sellers.find((s) => s.id === id)?.full_name || "—";

  return (
    <div className="space-y-6">
      <PageHeader title="Painel comercial" description="Etapa 1: contratos, pagamentos e liberação para o onboarding."
        actions={<Button variant="dark" asChild><Link to="/clientes/novo">Novo contrato</Link></Button>} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard title="Contratos no mês" value={thisMonth.length} icon={FilePlus2} color="#7C3AED" />
        <KpiCard title="Aguard. assinatura" value={by("aguardando_assinatura")} icon={FileClock} color="#64748B" />
        <KpiCard title="Aguard. pagamento" value={by("aguardando_pagamento")} icon={CreditCard} color="#D97706" />
        <KpiCard title="Prontos p/ onboarding" value={by("pronto_para_liberar") + by("aguardando_verificacao")} icon={Rocket} color="#0284C7" />
        <KpiCard title="Tempo médio onboarding" value={avg ? formatDuration(avg) : "—"} icon={Timer} color="#10B981" />
        <KpiCard title="Vendido no mês" value={formatBRLCompact(revenue)} icon={DollarSign} color="#B48E4B" />
      </div>
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold">Últimos contratos</h2>
        <div className="divide-y">
          {clients.slice(0, 8).map((c) => {
            const st = clientStatus(c);
            return (
              <div key={c.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <Link to="/clientes/$id" params={{ id: c.id }} className="font-medium hover:text-primary hover:underline">{c.clinic_name}</Link>
                  <div className="text-muted-foreground">{sellerName(c.seller_id)} · {c.products.join(", ")}</div>
                </div>
                <StatusBadge status={CLIENT_STATUS_TOKEN[st]} label={STATUS_LABEL[st]} />
              </div>
            );
          })}
          {clients.length === 0 && <p className="py-6 text-center text-muted-foreground">Nenhum contrato ainda.</p>}
        </div>
      </Card>
    </div>
  );
}
