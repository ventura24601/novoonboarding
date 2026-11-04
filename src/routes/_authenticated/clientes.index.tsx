import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClients, useSellers, type ClientRow } from "@/lib/session";
import { clientStatus, formatBRL, formatDuration, STATUS_LABEL, type ClientStatus, canReleaseOnboarding } from "@/lib/crm";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PRODUCTS } from "@/lib/crm";
import { notifyClientFinalized } from "@/lib/finalized-webhook.functions";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({ meta: [
    { title: "Clientes — Icom" },
    { name: "description", content: "Clientes, pagamentos e liberação para onboarding da Icom." },
    { property: "og:title", content: "Clientes — Icom" },
    { property: "og:description", content: "Clientes, pagamentos e liberação para onboarding da Icom." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClientsPage,
});

const statusTone: Record<ClientStatus, string> = {
  novo: "bg-secondary text-secondary-foreground",
  aguardando_assinatura: "bg-warning/25 text-warning-foreground",
  em_onboarding: "bg-info/15 text-info",
  finalizado: "bg-success/15 text-success",
};

const COLUMNS = [
  { key: "products", label: "Produtos" }, { key: "value", label: "Valor" },
  { key: "city", label: "Cidade/UF" }, { key: "activation", label: "Status ativação" }, { key: "system", label: "Sistema" },
  { key: "contract", label: "Contrato" }, { key: "paid", label: "Pago R$" }, { key: "time", label: "Tempo" },
  { key: "status", label: "Status" }, { key: "action", label: "Ação" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const DEFAULT_HIDDEN: ColKey[] = ["city", "activation", "system"];

function ClientsPage() {
  const [hidden, setHidden] = useState<ColKey[]>(DEFAULT_HIDDEN);
  useEffect(() => { const v = localStorage.getItem("clientes_hidden_cols"); if (v) setHidden((JSON.parse(v) as string[]).filter((k) => COLUMNS.some((c) => c.key === k)) as ColKey[]); }, []);
  const show = (k: ColKey) => !hidden.includes(k);
  const toggleCol = (k: ColKey) => { const n = show(k) ? [...hidden, k] : hidden.filter((x) => x !== k); setHidden(n); localStorage.setItem("clientes_hidden_cols", JSON.stringify(n)); };
  const [seller, setSeller] = useState("all");
  const [product, setProduct] = useState("all");
  const [paidF, setPaidF] = useState("all");
  const { data: clients = [], isLoading } = useClients();
  const { data: sellers = [] } = useSellers();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const sellerName = (id: string | null) => sellers.find((s) => s.id === id)?.full_name || "—";
  const rows = useMemo(
    () =>
      clients.filter(
        (c) =>
          (status === "all" || clientStatus(c) === status) &&
          (seller === "all" || c.seller_id === seller) &&
          (product === "all" || c.products.includes(product)) &&
          (paidF === "all" || String(c.paid) === paidF) &&
          (c.clinic_name.toLowerCase().includes(q.toLowerCase()) || sellerName(c.seller_id).toLowerCase().includes(q.toLowerCase())),
      ),
    [clients, q, status, sellers, seller, product, paidF],
  );

  async function toggle(c: ClientRow, value: boolean) {
    setSaving(c.id);
    const { error } = await supabase.from("clients").update({ paid: value }).eq("id", c.id);
    if (error) toast.error("Não foi possível salvar.");
    else if (value && c.contract_signed) {
      try {
        const r = await notifyClientFinalized({ data: { clientId: c.id } });
        if (r.sent) toast.success("Ficha do cliente enviada ao n8n.");
      } catch { toast.error("Falha ao enviar a ficha ao n8n."); }
    }
    await qc.invalidateQueries({ queryKey: ["clients"] });
    setSaving(null);
  }

  async function release(c: ClientRow) {
    if (!canReleaseOnboarding(c)) return;
    setSaving(c.id);
    const { data, error } = await supabase.from("clients").update({ onboarding_released_at: new Date().toISOString() })
      .eq("id", c.id).eq("paid", true).eq("contract_signed", true).not("contract_verified_at", "is", null)
      .is("onboarding_released_at", null).select("id");
    if (error || !data?.length) toast.error("Não foi possível liberar. Confira o pagamento e a assinatura verificada.");
    else toast.success("Cliente liberado para onboarding.");
    await qc.invalidateQueries({ queryKey: ["clients"] });
    setSaving(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Clientes</h1>
        </div>
        <Button asChild>
          <Link to="/clientes/novo">Novo cliente</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Buscar clínica ou vendedor..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs bg-card" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={seller} onValueChange={setSeller}>
          <SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos vendedores</SelectItem>{sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={product} onValueChange={setProduct}>
          <SelectTrigger className="w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos produtos</SelectItem>{PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={paidF} onValueChange={setPaidF}>
          <SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Pago: todos</SelectItem><SelectItem value="true">Pago</SelectItem><SelectItem value="false">Não pago</SelectItem></SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" className="ml-auto bg-card">Colunas</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Mostrar colunas</DropdownMenuLabel>
            {COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem key={col.key} checked={show(col.key)} onCheckedChange={() => toggleCol(col.key)} onSelect={(e) => e.preventDefault()}>{col.label}</DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Vendedor</TableHead>
              {show("products") && <TableHead>Produtos</TableHead>}
              {show("value") && <TableHead className="text-right">Valor</TableHead>}
              {show("city") && <TableHead>Cidade/UF</TableHead>}
              {show("activation") && <TableHead>Status ativação</TableHead>}
              {show("system") && <TableHead>Sistema</TableHead>}
              {show("contract") && <TableHead className="whitespace-nowrap text-center">Contrato</TableHead>}
              {show("paid") && <TableHead className="whitespace-nowrap text-center">Pago R$</TableHead>}
              {show("time") && <TableHead>Tempo</TableHead>}
              {show("status") && <TableHead>Status</TableHead>}
              {show("action") && <TableHead className="text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const st = clientStatus(c);
              const end = c.onboarding_completed_at ? new Date(c.onboarding_completed_at).getTime() : now;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link to="/clientes/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.clinic_name}</Link>
                    <div className="text-xs text-muted-foreground">{c.phone} {c.client_type === "aluno" ? "· Aluno" : "· Não aluno"}</div>
                  </TableCell>
                  <TableCell>{sellerName(c.seller_id)}</TableCell>
                  {show("products") && (<TableCell className="max-w-48 text-xs">{c.products.join(", ")}</TableCell>)}
                  {show("value") && (<TableCell className="text-right tabular-nums">{formatBRL(c.value)}</TableCell>)}
                  {show("city") && <TableCell className="text-sm">{[c.city, c.state].filter(Boolean).join("/") || "—"}</TableCell>}
                  {show("activation") && <TableCell className="text-sm">{c.activation_status || "—"}</TableCell>}
                  {show("system") && <TableCell className="text-sm capitalize">{c.billing_system || "—"}</TableCell>}
                  {show("contract") && (<TableCell className="text-center">
                    <Checkbox checked={c.contract_signed && Boolean(c.contract_verified_at)} disabled aria-label={`Contrato assinado verificado — ${c.clinic_name}`} />
                  </TableCell>)}
                  {show("paid") && (<TableCell className="text-center">
                    <Checkbox checked={c.paid} disabled={saving === c.id || Boolean(c.onboarding_released_at)} onCheckedChange={(v) => toggle(c, v === true)} aria-label={`Pago — ${c.clinic_name}`} />
                  </TableCell>)}
                  {show("time") && (<TableCell className={`tabular-nums text-sm ${c.onboarding_completed_at ? "text-success font-medium" : ""}`}>
                    {formatDuration(end - new Date(c.started_at).getTime())}
                  </TableCell>)}
                  {show("status") && (<TableCell>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[st]}`}>{STATUS_LABEL[st]}</span>
                  </TableCell>)}
                  {show("action") && (<TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/clientes/$id" params={{ id: c.id }}>Editar</Link>
                      </Button>
                      <span title={c.onboarding_released_at ? "Cliente já liberado" : !c.contract_verified_at ? "Aguardando integração de verificação da assinatura" : !c.paid ? "Aguardando pagamento" : "Liberar cliente"}>
                        <Button size="sm" disabled={!canReleaseOnboarding(c) || saving === c.id} onClick={() => release(c)}>
                          {c.onboarding_released_at ? "Liberado para Onboarding" : saving === c.id ? "Salvando…" : "Liberar para Onboarding"}
                        </Button>
                      </span>
                    </div>
                  </TableCell>)}
                </TableRow>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">Nenhum cliente encontrado.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
