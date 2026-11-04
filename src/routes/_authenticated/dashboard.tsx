import { createFileRoute, Link } from "@tanstack/react-router";
import { FilePlus2, FileClock, CheckCircle2, Timer, DollarSign } from "lucide-react";
import { useClients, useSellers } from "@/lib/session";
import { clientStatus, formatBRLCompact, formatDuration, STATUS_LABEL } from "@/lib/crm";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Icom" }] }),
  component: Dashboard,
});

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: any; tone: string }) {
  const size = String(value).length > 11 ? "text-xl" : String(value).length > 6 ? "text-2xl" : "text-3xl";
  return (
    <div className="rounded-xl bg-card p-5 shadow-card">
      <div className={`mb-4 inline-flex rounded-lg p-2 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className={`whitespace-nowrap font-semibold font-display ${size}`}>{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Dashboard() {
  const { data: clients = [] } = useClients();
  const { data: sellers = [] } = useSellers();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = clients.filter((c) => new Date(c.created_at) >= monthStart);
  const waiting = clients.filter((c) => !c.contract_signed);
  const done = clients.filter((c) => clientStatus(c) === "finalizado");
  const durations = done
    .filter((c) => c.onboarding_completed_at)
    .map((c) => new Date(c.onboarding_completed_at!).getTime() - new Date(c.started_at).getTime());
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const revenue = thisMonth.reduce((s, c) => s + c.value, 0);
  const sellerName = (id: string | null) => sellers.find((s) => s.id === id)?.full_name || "—";

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral de contratos e onboarding.</p>
        </div>
        <Button asChild>
          <Link to="/clientes/novo">Novo cliente</Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Novos contratos no mês" value={thisMonth.length} icon={FilePlus2} tone="bg-secondary text-primary" />
        <Stat label="Aguardando assinatura" value={waiting.length} icon={FileClock} tone="bg-warning/20 text-warning-foreground" />
        <Stat label="Finalizados" value={done.length} icon={CheckCircle2} tone="bg-success/15 text-success" />
        <Stat label="Tempo médio de onboarding" value={avg ? formatDuration(avg) : "—"} icon={Timer} tone="bg-info/15 text-info" />
        <Stat label="Vendido no mês" value={formatBRLCompact(revenue)} icon={DollarSign} tone="bg-accent/30 text-accent-foreground" />
      </div>
      <div className="rounded-xl bg-card p-6 shadow-card">
        <h2 className="mb-4 text-lg font-semibold">Últimos clientes</h2>
        <div className="divide-y">
          {clients.slice(0, 8).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{c.clinic_name}</div>
                <div className="text-muted-foreground">{sellerName(c.seller_id)} · {c.products.join(", ")}</div>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {STATUS_LABEL[clientStatus(c)]}
              </span>
            </div>
          ))}
          {clients.length === 0 && <p className="py-6 text-center text-muted-foreground">Nenhum cliente ainda.</p>}
        </div>
      </div>
    </div>
  );
}
