import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createTeamUser, listTeamUsers, resetTeamUserPassword } from "@/lib/users.functions";
import { useMe } from "@/lib/session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Icom" }] }),
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", vendedor: "Vendedor", cs: "CS" };

function UsersPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const list = useServerFn(listTeamUsers);
  const create = useServerFn(createTeamUser);
  const reset = useServerFn(resetTeamUserPassword);
  const { data: users = [] } = useQuery({ queryKey: ["team"], queryFn: () => list(), enabled: !!me?.isAdmin });
  const [f, setF] = useState({ full_name: "", email: "", password: "", confirm: "", role: "vendedor" as "admin" | "vendedor" | "cs" });
  const [busy, setBusy] = useState(false);

  if (me && !me.isAdmin) return <p className="text-muted-foreground">Apenas administradores acessam esta página.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password.length < 8) { toast.error("A senha precisa ter ao menos 8 caracteres."); return; }
    if (f.password !== f.confirm) { toast.error("As senhas não conferem."); return; }
    setBusy(true);
    try {
      await create({ data: { full_name: f.full_name, email: f.email, password: f.password, role: f.role } });
      toast.success("Usuário criado. Ele já pode entrar com essa senha.");
      setF({ full_name: "", email: "", password: "", confirm: "", role: "vendedor" });
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["sellers"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(id: string) {
    const pw = window.prompt("Nova senha (mínimo 8 caracteres):");
    if (!pw) return;
    if (pw.length < 8) { toast.error("Senha muito curta."); return; }
    try {
      await reset({ data: { userId: id, password: pw } });
      toast.success("Senha alterada.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={submit} className="h-fit space-y-4 rounded-xl bg-card p-6 shadow-card">
        <div>
          <h1 className="text-2xl font-semibold">Novo usuário</h1>
          <p className="text-sm text-muted-foreground">Defina a senha de acesso do colaborador.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="n">Nome</Label><Input id="n" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="e">E-mail</Label><Input id="e" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="space-y-2">
          <Label>Função</Label>
          <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v as typeof f.role })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label htmlFor="p">Senha</Label><Input id="p" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="c">Confirmar senha</Label><Input id="c" type="password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar usuário"}</Button>
      </form>
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Função</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "—"}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => changePassword(u.id)}>Alterar senha</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
