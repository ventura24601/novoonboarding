import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, FileSignature, FilePlus2, Wallet, PenLine, Inbox, Waypoints, Filter, Gauge, ListChecks, Workflow, Building2, Settings, LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, useMe, useOnboardings } from "@/lib/session";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean; badge?: "assinaturas" | "vendas" };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Análises",
    items: [{ to: "/funis", label: "Funis", icon: Filter }],
  },
  {
    title: "Etapa 1 · Contratos",
    items: [
      { to: "/dashboard", label: "Painel comercial", icon: LayoutDashboard },
      { to: "/vendas", label: "Vendas recebidas", icon: Inbox, badge: "vendas" },
      { to: "/clientes", label: "Contratos", icon: FileSignature, exact: true },
      { to: "/clientes/novo", label: "Novo contrato", icon: FilePlus2 },
      { to: "/assinaturas", label: "Assinaturas", icon: PenLine, badge: "assinaturas" },
      { to: "/comissoes", label: "Comissões", icon: Wallet },
    ],
  },
  {
    title: "Etapa 2 · Onboarding",
    items: [
      { to: "/painel", label: "Painel", icon: Gauge },
      { to: "/minhas-etapas", label: "Minhas etapas", icon: ListChecks },
      { to: "/modelos", label: "Modelos de onboarding", icon: Workflow },
      { to: "/vinculos", label: "Produtos e onboardings", icon: Waypoints },
      { to: "/carteira", label: "Clientes", icon: Building2 },
    ],
  },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function SideLink({ item, contagem }: { item: NavItem; contagem?: number | undefined }) {
  return (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact ?? false }}
      className="group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition hover:bg-sidebar-accent/60 hover:text-white"
      activeProps={{ className: "!bg-sidebar-accent !text-white before:absolute before:-left-3 before:top-1 before:bottom-1 before:w-1 before:rounded-r before:bg-primary" }}
    >
      <item.icon className="h-4 w-4 shrink-0 opacity-80" />
      <span className="truncate">{item.label}</span>
      {!!contagem && (
        <span className="ml-auto rounded-full bg-[#D97706] px-1.5 text-[10px] font-bold leading-4 text-white" title={item.badge === "vendas" ? "Vendas aguardando revisão" : "Assinaturas aguardando vínculo"}>{contagem}</span>
      )}
    </Link>
  );
}

function Layout() {
  const { data: me } = useMe();
  const { data: onbs = [] } = useOnboardings();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const emAndamento = onbs.filter((o) => o.status === "em_andamento").length;
  const atrasados = onbs.filter((o) => o.situacao === "atrasado").length;
  const { data: vendasPendentes = 0 } = useQuery({
    queryKey: ["vendas-pendentes"],
    enabled: !!me && (me.isAdmin || me.roles.includes("vendedor")),
    queryFn: async () => {
      const { count } = await supabase.from("vendas_recebidas").select("id", { count: "exact", head: true }).eq("status", "pendente");
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  const { data: pendentes = 0 } = useQuery({
    queryKey: ["docusign-pendentes"],
    enabled: !!me && (me.isAdmin || me.isGestor),
    queryFn: async () => {
      const { count } = await supabase.from("docusign_envelopes").select("id", { count: "exact", head: true })
        .eq("status", "completed").is("cliente_id", null).eq("ignorado", false);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar px-3 py-5">
        <Link to="/painel" className="mb-7 flex items-center gap-2.5 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-black text-white">IC</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-wide text-white">ICOM</span>
            <span className="block text-[11px] text-sidebar-foreground/70">Central de Onboarding</span>
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {SECTIONS.map((s) => (
            <div key={s.title} className="flex flex-col gap-0.5">
              <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/50">{s.title}</div>
              {s.items.map((i) => <SideLink key={i.to} item={i} contagem={i.badge === "assinaturas" ? pendentes : i.badge === "vendas" ? vendasPendentes : undefined} />)}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border pt-3">
          <SideLink item={{ to: "/configuracoes", label: "Configurações", icon: Settings }} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b bg-card/95 px-8 backdrop-blur">
          <div className="text-sm text-muted-foreground">
            <Link to="/painel" className="font-semibold text-foreground hover:underline">{emAndamento} em andamento</Link>
            <span className="mx-2">·</span>
            <Link to="/painel" search={{ situacao: "atrasado" }} className={atrasados ? "font-semibold text-[#B91C1C] hover:underline" : "hover:underline"}>
              {atrasados} atrasado{atrasados === 1 ? "" : "s"}
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">{initials(me?.name ?? "")}</span>
            )}
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-semibold">{me?.name}</div>
              <div className="text-[11px] text-muted-foreground">{me?.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "Sem perfil"}</div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut /> Sair
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-8 py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
