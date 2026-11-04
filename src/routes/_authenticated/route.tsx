import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Users, UserPlus, Wallet, Shield, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/clientes/novo", label: "Novo cliente", icon: UserPlus },
  { to: "/comissoes", label: "Comissões", icon: Wallet },
] as const;

function Layout() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const linkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const activeCls = "bg-sidebar-accent text-sidebar-accent-foreground font-semibold";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar p-4">
        <div className="mb-8 px-3 pt-2">
          <span className="font-display text-lg font-semibold text-sidebar-primary">Icom</span>
          <span className="ml-2 text-xs text-sidebar-foreground/60">Vendas & CS</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={linkCls} activeProps={{ className: activeCls }} activeOptions={{ exact: true }}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
          {me?.isAdmin && (
            <Link to="/usuarios" className={linkCls} activeProps={{ className: activeCls }}>
              <Shield className="h-4 w-4" /> Usuários
            </Link>
          )}
        </nav>
        <div className="border-t border-sidebar-border pt-4">
          <div className="px-3 text-sm text-sidebar-foreground">{me?.name}</div>
          <div className="px-3 text-xs capitalize text-sidebar-foreground/60">{me?.roles.join(", ") || "sem função"}</div>
          <button onClick={signOut} className={`${linkCls} mt-2 w-full`}>
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
