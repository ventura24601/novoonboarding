import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ShieldAlert, UserPlus, Users } from "lucide-react";
import {
  createTeamUser, listTeamUsers, resetTeamUserPassword, setProdutoGestores, setTeamUserActive, setTeamUserRole,
} from "@/lib/users.functions";
import { ROLE_LABEL, useMe, useProdutos, type AppRole } from "@/lib/session";
import { Card, ColorBadge, EmptyState, PageHeader } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ICOM" }] }),
  component: Configuracoes,
});

const ROLES = Object.keys(ROLE_LABEL) as AppRole[];
const ROLE_HINT: Record<AppRole, string> = {
  admin: "Faz tudo, inclusive gerenciar usuários.",
  gestor: "Edita modelos e campos dos produtos que gerencia, reatribui responsáveis e ajusta prazos.",
  operador: "Executa etapas: checklist, avançar, bloquear e anotar.",
  vendedor: "Cadastra contratos e acompanha a etapa comercial.",
  cs: "Executa etapas de onboarding como o operador.",
};

function Configuracoes() {
  const { data: me } = useMe();
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Usuários, perfis e vínculo de gestores com produtos." />
      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios"><Users className="mr-1.5 h-4 w-4" />Usuários</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios" className="mt-4">
          {me && !me.isAdmin
            ? <EmptyState icon={ShieldAlert} title="Acesso restrito" description="Somente administradores gerenciam usuários e perfis." />
            : <Usuarios meId={me?.id} enabled={!!me?.isAdmin} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Usuarios({ meId, enabled }: { meId: string | undefined; enabled: boolean }) {
  const qc = useQueryClient();
  const list = useServerFn(listTeamUsers);
  const setRole = useServerFn(setTeamUserRole);
  const setActive = useServerFn(setTeamUserActive);
  const setGestor = useServerFn(setProdutoGestores);
  const reset = useServerFn(resetTeamUserPassword);
  const { data: produtos = [] } = useProdutos();
  const { data: users = [] } = useQuery({ queryKey: ["team"], queryFn: () => list(), enabled });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["team"] }), qc.invalidateQueries({ queryKey: ["sellers"] })]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast.success(ok); await refresh(); } catch (err) { toast.error((err as Error).message); }
  }

  async function changePassword(id: string) {
    const pw = window.prompt("Nova senha (mínimo 8 caracteres):");
    if (!pw) return;
    if (pw.length < 8) { toast.error("Senha muito curta."); return; }
    await run(() => reset({ data: { userId: id, password: pw } }), "Senha alterada.");
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="text-sm font-semibold">{users.length} usuário{users.length === 1 ? "" : "s"}</div>
        <InviteDialog onDone={refresh} />
      </div>
      <table className="w-full text-sm">
        <thead className="border-b bg-[#F8FAFC]">
          <tr>{["Usuário", "Perfil", "Produtos que gerencia", "Ativo", ""].map((h) => <th key={h} className="filter-label px-5 py-2.5 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const role = (u.roles[0] ?? "operador") as AppRole;
            return (
              <tr key={u.id} className={`border-b last:border-0 ${u.ativo ? "" : "opacity-60"}`}>
                <td className="px-5 py-3"><div className="font-semibold">{u.full_name || "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
                <td className="px-5 py-3">
                  <Select value={role} onValueChange={(v) => run(() => setRole({ data: { userId: u.id, role: v as AppRole } }), "Perfil atualizado.")}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-5 py-3">
                  {role === "gestor" ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 max-w-72 justify-between gap-2">
                          <span className="flex flex-wrap gap-1 truncate">
                            {u.produtos.length === 0 ? <span className="text-muted-foreground">Nenhum produto</span>
                              : u.produtos.map((pid) => { const p = produtos.find((x) => x.id === pid); return p ? <ColorBadge key={pid} color={p.cor}>{p.nome}</ColorBadge> : null; })}
                          </span>
                          <ChevronDown className="opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        {produtos.map((p) => {
                          const on = u.produtos.includes(p.id);
                          return (
                            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                              <Checkbox checked={on} onCheckedChange={() => run(() => setGestor({ data: { userId: u.id, produtoIds: on ? u.produtos.filter((x) => x !== p.id) : [...u.produtos, p.id] } }), "Produtos atualizados.")} />
                              {p.nome}
                            </label>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  ) : role === "admin" ? <span className="text-xs text-muted-foreground">Todos</span> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-5 py-3">
                  <Switch checked={u.ativo} disabled={u.id === meId}
                    onCheckedChange={(v) => run(() => setActive({ data: { userId: u.id, ativo: v } }), v ? "Usuário reativado." : "Usuário desativado.")}
                    aria-label={`Ativo — ${u.full_name}`} />
                </td>
                <td className="px-5 py-3 text-right"><Button size="sm" variant="outline" onClick={() => changePassword(u.id)}>Alterar senha</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function InviteDialog({ onDone }: { onDone: () => Promise<unknown> }) {
  const create = useServerFn(createTeamUser);
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"convite" | "senha">("convite");
  const [f, setF] = useState({ full_name: "", email: "", password: "", role: "operador" as AppRole });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (modo === "senha" && f.password.length < 8) { toast.error("A senha precisa ter ao menos 8 caracteres."); return; }
    setBusy(true);
    try {
      const r = await create({ data: { ...f, password: modo === "senha" ? f.password : "", redirectTo: `${window.location.origin}/auth` } });
      toast.success(r.invited ? `Convite enviado para ${f.email}.` : "Usuário criado. Ele já pode entrar com essa senha.");
      setF({ full_name: "", email: "", password: "", role: "operador" });
      setOpen(false);
      await onDone();
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="dark" size="sm"><UserPlus /> Convidar usuário</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Convidar usuário</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="n">Nome</Label><Input id="n" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="e">E-mail</Label><Input id="e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as AppRole })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HINT[f.role]}</p>
          </div>
          <div className="flex gap-2 text-sm">
            <Button type="button" size="sm" variant={modo === "convite" ? "default" : "outline"} onClick={() => setModo("convite")}>Enviar convite por e-mail</Button>
            <Button type="button" size="sm" variant={modo === "senha" ? "default" : "outline"} onClick={() => setModo("senha")}>Definir senha</Button>
          </div>
          {modo === "senha" && (
            <div className="space-y-2"><Label htmlFor="p">Senha inicial</Label><Input id="p" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          )}
          <Button type="submit" variant="dark" className="w-full" disabled={busy}>{busy ? "Enviando..." : modo === "convite" ? "Enviar convite" : "Criar usuário"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
