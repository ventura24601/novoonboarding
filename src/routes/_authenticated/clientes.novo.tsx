import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSellers } from "@/lib/session";
import { CLIENT_TYPES } from "@/lib/crm";
import { useProdutos } from "@/lib/session";
import { clientBaseSchema } from "@/lib/client-form";
import { formatarDocumento, observacaoDaVenda } from "@/lib/vendas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/novo")({
  validateSearch: z.object({ venda: z.string().uuid().optional() }),
  head: () => ({ meta: [
    { title: "Novo contrato — ICOM" },
    { name: "description", content: "Cadastro de clínicas, produtos contratados e diagnóstico comercial da Icom." },
    { property: "og:title", content: "Novo contrato — ICOM" },
    { property: "og:description", content: "Cadastro de clínicas, produtos contratados e diagnóstico comercial da Icom." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: NewClient,
});

const schema = clientBaseSchema;

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>
  );
}

function NewClient() {
  const { data: me } = useMe();
  const { data: sellers = [] } = useSellers();
  const { data: produtos = [] } = useProdutos();
  const produtoNomes = produtos.filter((p) => p.ativo).map((p) => p.nome);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    clinic_name: "", phone: "", client_type: "nao_aluno", address: "", legal_name: "", specialty: "",
    products: [] as string[], document: "", email: "", seller_id: "", notes: "",
    current_scenario: "", goal: "", pain: "", special_condition: "", value: "",
    whatsapp: "", general_notes: "", has_crc: "", has_marketing_experience: "", has_facebook: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const sellerId = f.seller_id || me?.id || "";

  // Cadastro a partir de uma venda recebida pelo webhook: preenche o formulário uma vez.
  const { venda: vendaId } = Route.useSearch();
  const [pago, setPago] = useState(false);
  const { data: venda } = useQuery({
    queryKey: ["venda", vendaId],
    enabled: !!vendaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendas_recebidas").select("*").eq("id", vendaId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const preenchido = useRef(false);
  useEffect(() => {
    if (!venda || preenchido.current || !sellers.length) return;
    preenchido.current = true;
    const vendedor = venda.vendedor_email ? sellers.find((s) => s.email?.toLowerCase() === venda.vendedor_email) : undefined;
    setF((cur) => ({
      ...cur,
      clinic_name: venda.nome ?? "",
      document: formatarDocumento(venda.cnpj),
      phone: venda.telefone ?? "",
      whatsapp: venda.whatsapp ?? "",
      email: venda.email ?? "",
      special_condition: venda.condicao_pagamento ?? "",
      general_notes: observacaoDaVenda(venda),
      seller_id: vendedor?.id ?? cur.seller_id,
    }));
    setPago(/compra efetuada|pag[oa]|aprovad/i.test(venda.tipo ?? ""));
  }, [venda, sellers]);
  const vendaRevisada = !!venda && venda.status !== "pendente";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ ...f, seller_id: sellerId });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (vendaRevisada) {
      toast.error("Esta venda já foi revisada.");
      return;
    }
    setSaving(true);
    const { data: novo, error } = await supabase.from("clients")
      .insert({ ...parsed.data, value: parsed.data.value ?? 0, created_by: me?.id ?? null, ...(venda ? { paid: pago } : {}) })
      .select("id").single();
    if (error || !novo) {
      setSaving(false);
      toast.error("Erro ao salvar cliente.");
      return;
    }
    if (venda) {
      const { error: e2 } = await supabase.from("vendas_recebidas").update({ status: "aprovada", cliente_id: novo.id }).eq("id", venda.id);
      if (e2) toast.error(`Cliente criado, mas a venda não foi marcada como aprovada: ${e2.message}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["vendas-recebidas"] }), qc.invalidateQueries({ queryKey: ["vendas-pendentes"] })]);
    }
    setSaving(false);
    toast.success(venda ? "Venda aprovada e cliente cadastrado." : "Cliente cadastrado! O tempo de onboarding começou a contar.");
    qc.invalidateQueries({ queryKey: ["clients"] });
    navigate(venda ? { to: "/vendas" } : { to: "/clientes" });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Novo contrato</h1>
        <p className="text-muted-foreground">Preencha os dados da venda para iniciar o onboarding.</p>
      </div>

      {venda && (
        <section className={`flex flex-wrap items-start gap-3 rounded-lg border p-4 ${vendaRevisada ? "border-[#E2E8F0] bg-[#F8FAFC]" : "border-[#FCD34D] bg-[#FFFBEB]"}`}>
          <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">{vendaRevisada ? "Esta venda já foi revisada" : "Revisão de venda recebida automaticamente"}</div>
            <p className="text-muted-foreground">
              {vendaRevisada
                ? "Ela não pode virar outro cliente. Volte para Vendas recebidas."
                : "Os campos foram preenchidos com o que chegou do sistema de vendas. Confira os dados, escolha os produtos e o vendedor, e cadastre: a venda fica aprovada e ligada a este cliente."}
            </p>
            {!vendaRevisada && (
              <label className="mt-2 flex items-center gap-2 font-medium">
                <Checkbox checked={pago} onCheckedChange={(v) => setPago(v === true)} />
                Pagamento confirmado{venda.tipo ? ` (${venda.tipo}${venda.meio_pagamento ? ` · ${venda.meio_pagamento}` : ""})` : ""}
              </label>
            )}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-lg border bg-card p-6 shadow-card">
        <h2 className="font-semibold">Dados da clínica</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="clinic" label="Clínica *"><Input id="clinic" value={f.clinic_name} onChange={set("clinic_name")} /></Field>
          <Field id="legal" label="Razão social"><Input id="legal" value={f.legal_name} onChange={set("legal_name")} /></Field>
          <Field id="phone" label="Telefone"><Input id="phone" value={f.phone} onChange={set("phone")} /></Field>
          <Field id="whatsapp" label="WhatsApp"><Input id="whatsapp" type="tel" value={f.whatsapp} onChange={set("whatsapp")} /></Field>
          <Field id="email" label="E-mail"><Input id="email" type="email" value={f.email} onChange={set("email")} /></Field>
          <Field id="doc" label="Documento (CPF/CNPJ)"><Input id="doc" value={f.document} onChange={set("document")} /></Field>
          <Field id="spec" label="Especialidade"><Input id="spec" value={f.specialty} onChange={set("specialty")} /></Field>
          <div className="md:col-span-2"><Field id="addr" label="Endereço da clínica"><Input id="addr" value={f.address} onChange={set("address")} /></Field></div>
          <Field id="type" label="Tipo de cliente">
            <Select value={f.client_type} onValueChange={(v) => setF({ ...f, client_type: v })}>
              <SelectTrigger id="type"><SelectValue /></SelectTrigger>
              <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="seller" label="Vendedor *">
            <Select value={sellerId} onValueChange={(v) => setF({ ...f, seller_id: v })}>
              <SelectTrigger id="seller"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6 shadow-card">
        <h2 className="font-semibold">Produto contratado *</h2>
        <div className="flex flex-wrap gap-3">
          {produtoNomes.map((p) => {
            const on = f.products.includes(p);
            return (
              <label key={p} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${on ? "border-primary bg-secondary" : "bg-card"}`}>
                <Checkbox checked={on} onCheckedChange={(v) => setF({ ...f, products: v ? [...f.products, p] : f.products.filter((x) => x !== p) })} />
                {p}
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6 shadow-card">
        <h2 className="font-semibold">Diagnóstico</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {([
            { key: "has_crc", label: "Tem CRC" },
            { key: "has_marketing_experience", label: "Já fez Marketing" },
            { key: "has_facebook", label: "Tem Facebook" },
          ] as const).map(({ key, label }) => (
            <Field key={key} id={key} label={label}>
              <Select value={f[key]} onValueChange={(value) => setF((current) => ({ ...current, [key]: value }))}>
                <SelectTrigger id={key}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          ))}
        </div>
        <Field id="scen" label="Cenário do cliente atual"><Textarea id="scen" value={f.current_scenario} onChange={set("current_scenario")} /></Field>
        <Field id="goal" label="Objetivo com a Icom"><Textarea id="goal" value={f.goal} onChange={set("goal")} /></Field>
        <Field id="pain" label="Dor"><Textarea id="pain" value={f.pain} onChange={set("pain")} /></Field>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6 shadow-card">
        <h2 className="font-semibold">Condição comercial</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="cond" label="Condição diferenciada"><Input id="cond" value={f.special_condition} onChange={set("special_condition")} /></Field>
          <Field id="val" label="Valor (R$)"><Input id="val" inputMode="decimal" placeholder="0,00" value={f.value} onChange={set("value")} /></Field>
        </div>
        <Field id="obs" label="Observação"><Textarea id="obs" value={f.notes} onChange={set("notes")} /></Field>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-6 shadow-card">
        <Field id="general_notes" label="Observação geral"><Textarea id="general_notes" value={f.general_notes} onChange={set("general_notes")} /></Field>
      </section>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate(venda ? { to: "/vendas" } : { to: "/clientes" })}>Cancelar</Button>
        <Button type="submit" disabled={saving || vendaRevisada}>{saving ? "Salvando..." : venda ? "Aprovar e cadastrar cliente" : "Cadastrar cliente"}</Button>
      </div>
    </form>
  );
}
