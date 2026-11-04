import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSellers, useProdutos, useOnboardings } from "@/lib/session";
import { ColorBadge, StatusBadge } from "@/components/app/ui";
import { CLIENT_TYPES, STATUS_LABEL, CLIENT_STATUS_TOKEN, clientStatus, formatBRL } from "@/lib/crm";
import {
  ACTIVATION_STATUSES, BILLING_SYSTEMS, PAYMENT_METHODS, clientEditSchema, clientFormFromRow,
  clientUpdatePayload, missingClientFields, type ClientForm,
} from "@/lib/client-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  head: () => ({ meta: [
    { title: "Ficha do cliente — ICOM" },
    { name: "description", content: "Dados de ativação, financeiro e pagamento do cliente Icom." },
    { property: "og:title", content: "Ficha do cliente — ICOM" },
    { property: "og:description", content: "Dados de ativação, financeiro e pagamento do cliente Icom." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ClientSheet,
});

const NONE = "__none__";

function F({ id: fid, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={fid}>{label}</Label>{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-6 shadow-card">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value === null || value === undefined || value === "" ? <span className="text-muted-foreground">—</span> : value}</span>
    </div>
  );
}

function Sel({ id, value, onChange, options, clearable }: { id: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; clearable?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id}><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>
        {clearable && <SelectItem value={NONE}>— Nenhum —</SelectItem>}
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ClientSheet() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: sellers = [] } = useSellers();
  const { data: produtos = [] } = useProdutos();
  const { data: onbs = [] } = useOnboardings();
  const produtoNomes = produtos.filter((p) => p.ativo).map((p) => p.nome);
  const { data: c, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<ClientForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    if (c) setF(clientFormFromRow(c as Record<string, unknown>));
  }, [c]);

  if (isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (!c || !f) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  const set = (k: keyof ClientForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const setV = (k: keyof ClientForm) => (v: string) => setF({ ...f, [k]: v });
  const sellerName = sellers.find((s) => s.id === c.seller_id)?.full_name || sellers.find((s) => s.id === c.seller_id)?.email || null;
  const missing = missingClientFields(c as Record<string, unknown>);
  const st = clientStatus(c);

  async function lookupCep(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (j.erro) toast.error("CEP não encontrado.");
      else setF((cur) => cur && { ...cur, city: j.localidade ?? "", state: j.uf ?? "" });
    } catch { toast.error("Não foi possível consultar o CEP."); }
    setCepLoading(false);
  }

  function startEdit() {
    setF(clientFormFromRow(c as Record<string, unknown>));
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = clientEditSchema.safeParse(f);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("clients").update(clientUpdatePayload(parsed.data)).eq("id", id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar."); return; }
    toast.success("Ficha atualizada.");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["client", id] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/clientes" className="text-sm text-muted-foreground hover:underline">← Clientes</Link>
          <h1 className="text-2xl font-semibold">{c.clinic_name}</h1>
          <p className="text-muted-foreground">{c.products.join(", ")} · {formatBRL(Number(c.value))} · Vendedor: {sellerName || "—"}</p>
        </div>
        {editing ? (
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar ficha"}</Button>
          </div>
        ) : (
          <Button type="button" onClick={startEdit}><Pencil className="mr-2 h-4 w-4" />Editar dados</Button>
        )}
      </div>

      {!editing && missing.length > 0 && (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium">Faltam {missing.length} {missing.length === 1 ? "dado" : "dados"} na ficha</p>
          <p className="mt-1 text-sm text-muted-foreground">{missing.join(", ")}</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={startEdit}>Preencher agora</Button>
        </section>
      )}

      {editing ? (
        <>
          <Section title="Dados da clínica">
            <div className="grid gap-4 md:grid-cols-2">
              <F id="clinic" label="Clínica *"><Input id="clinic" value={f.clinic_name} onChange={set("clinic_name")} /></F>
              <F id="legal" label="Razão social"><Input id="legal" value={f.legal_name} onChange={set("legal_name")} /></F>
              <F id="phone" label="Telefone"><Input id="phone" value={f.phone} onChange={set("phone")} /></F>
              <F id="whatsapp" label="WhatsApp"><Input id="whatsapp" type="tel" value={f.whatsapp} onChange={set("whatsapp")} /></F>
              <F id="doc" label="Documento (CPF/CNPJ)"><Input id="doc" value={f.document} onChange={set("document")} /></F>
              <F id="spec" label="Especialidade"><Input id="spec" value={f.specialty} onChange={set("specialty")} /></F>
              <div className="md:col-span-2"><F id="addr" label="Endereço da clínica"><Input id="addr" value={f.address} onChange={set("address")} /></F></div>
              <F id="type" label="Tipo de cliente">
                <Sel id="type" value={f.client_type} onChange={setV("client_type")} options={CLIENT_TYPES.map((t2) => ({ v: t2.value, l: t2.label }))} />
              </F>
              <F id="seller" label="Vendedor">
                <Sel id="seller" value={f.seller_id} onChange={setV("seller_id")} clearable options={sellers.map((s) => ({ v: s.id, l: s.full_name || s.email }))} />
              </F>
            </div>
          </Section>

          <Section title="Produto contratado *">
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
          </Section>

          <Section title="Diagnóstico">
            <div className="grid gap-4 md:grid-cols-3">
              {([
                { key: "has_crc", label: "Tem CRC" },
                { key: "has_marketing_experience", label: "Já fez Marketing" },
                { key: "has_facebook", label: "Tem Facebook" },
              ] as const).map(({ key, label }) => (
                <F key={key} id={key} label={label}>
                  <Sel id={key} value={f[key]} onChange={setV(key)} clearable options={[{ v: "sim", l: "Sim" }, { v: "nao", l: "Não" }]} />
                </F>
              ))}
            </div>
            <F id="scen" label="Cenário do cliente atual"><Textarea id="scen" value={f.current_scenario} onChange={set("current_scenario")} /></F>
            <F id="goal" label="Objetivo com a Icom"><Textarea id="goal" value={f.goal} onChange={set("goal")} /></F>
            <F id="pain" label="Dor"><Textarea id="pain" value={f.pain} onChange={set("pain")} /></F>
          </Section>

          <Section title="Condição comercial">
            <div className="grid gap-4 md:grid-cols-2">
              <F id="cond" label="Condição diferenciada"><Input id="cond" value={f.special_condition} onChange={set("special_condition")} /></F>
              <F id="val" label="Valor do contrato (R$)"><Input id="val" inputMode="decimal" placeholder="0,00" value={f.value} onChange={set("value")} /></F>
            </div>
            <F id="obs" label="Observação"><Textarea id="obs" value={f.notes} onChange={set("notes")} /></F>
            <F id="general_notes" label="Observação geral"><Textarea id="general_notes" value={f.general_notes} onChange={set("general_notes")} /></F>
          </Section>

          <Section title="Ativação">
            <div className="grid gap-4 md:grid-cols-2">
              <F id="activation_status" label="Status ativação">
                <Sel id="activation_status" value={f.activation_status} onChange={setV("activation_status")} clearable options={ACTIVATION_STATUSES.map((s) => ({ v: s, l: s }))} />
              </F>
              <F id="ic_id" label="ID/IC"><Input id="ic_id" value={f.ic_id} onChange={set("ic_id")} /></F>
              <F id="email" label="E-mail"><Input id="email" type="email" value={f.email} onChange={set("email")} /></F>
              <F id="financial_id" label="ID Financeiro"><Input id="financial_id" value={f.financial_id} onChange={set("financial_id")} /></F>
              <F id="contract_id" label="ID Contrato"><Input id="contract_id" value={f.contract_id} onChange={set("contract_id")} /></F>
            </div>
          </Section>

          <Section title="Localização">
            <div className="grid gap-4 md:grid-cols-3">
              <F id="cep" label={cepLoading ? "CEP (buscando…)" : "CEP"}>
                <Input id="cep" inputMode="numeric" placeholder="00000-000" value={f.cep} onChange={(e) => { setF({ ...f, cep: e.target.value }); lookupCep(e.target.value); }} />
              </F>
              <F id="city" label="Cidade"><Input id="city" value={f.city} onChange={set("city")} /></F>
              <F id="state" label="Estado"><Input id="state" value={f.state} onChange={set("state")} /></F>
            </div>
          </Section>

          <Section title="Pagamento">
            <div className="grid gap-4 md:grid-cols-2">
              <F id="billing_system" label="Sistema">
                <Sel id="billing_system" value={f.billing_system} onChange={setV("billing_system")} clearable options={BILLING_SYSTEMS.map((s) => ({ v: s.value, l: s.label }))} />
              </F>
              <F id="payment_method" label="Forma de pagamento">
                <Sel id="payment_method" value={f.payment_method} onChange={setV("payment_method")} clearable options={PAYMENT_METHODS.map((s) => ({ v: s.value, l: s.label }))} />
              </F>
              <F id="payment_value" label="Valor pago (R$)"><Input id="payment_value" inputMode="decimal" placeholder="0,00" value={f.payment_value} onChange={set("payment_value")} /></F>
              <F id="payment_modality" label="Modalidade"><Input id="payment_modality" value={f.payment_modality} onChange={set("payment_modality")} /></F>
              <F id="payment_date" label="Data pagamento"><Input id="payment_date" type="date" value={f.payment_date} onChange={set("payment_date")} /></F>
            </div>
          </Section>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar ficha"}</Button>
          </div>
        </>
      ) : (
        <>
          <Section title="Situação">
            <div className="space-y-0">
              <Row label="Status" value={<StatusBadge status={CLIENT_STATUS_TOKEN[st]} label={STATUS_LABEL[st]} />} />
              <Row label="Contrato assinado" value={c.contract_verified_at ? `Sim (verificado${c.contract_verification_source === "manual" ? " manualmente" : ""})` : c.contract_signed ? "Marcado, sem verificação" : "Não"} />
              <Row label="Pago" value={c.paid ? "Sim" : "Não"} />
              <Row label="Liberado para onboarding" value={c.onboarding_released_at ? "Sim" : "Não"} />
            </div>
          </Section>

          <Section title="Onboarding">
            {onbs.filter((o) => o.cliente_id === c.id).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {c.onboarding_released_at
                  ? "Nenhum dos produtos contratados tem modelo de onboarding publicado."
                  : "O onboarding começa quando o cliente for liberado (pago e contrato verificado)."}
              </p>
            ) : (
              <div className="divide-y">
                {onbs.filter((o) => o.cliente_id === c.id).map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <ColorBadge color={o.produto_cor ?? "#7C3AED"}>{o.produto_nome}</ColorBadge>
                      <span className="text-sm">
                        {o.etapa_atual_nome ? <>Etapa atual: <b className="text-gold">{o.etapa_atual_nome}</b></> : "Todas as etapas concluídas"}
                        <span className="ml-2 text-xs text-muted-foreground">{o.etapas_feitas}/{o.etapas_total}</span>
                      </span>
                    </div>
                    <StatusBadge status={o.situacao} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Dados da clínica">
            <div className="space-y-0">
              <Row label="Razão social" value={c.legal_name} />
              <Row label="Tipo de cliente" value={c.client_type === "aluno" ? "Aluno" : "Não aluno"} />
              <Row label="Telefone" value={c.phone} />
              <Row label="WhatsApp" value={c.whatsapp} />
              <Row label="Documento" value={c.document} />
              <Row label="Especialidade" value={c.specialty} />
              <Row label="Endereço" value={c.address} />
              <Row label="Cidade/UF" value={[c.city, c.state].filter(Boolean).join("/") || null} />
              <Row label="Vendedor" value={sellerName} />
            </div>
          </Section>

          <Section title="Produtos contratados">
            <Row label="Produtos" value={c.products.join(", ")} />
          </Section>

          <Section title="Diagnóstico">
            <div className="space-y-0">
              <Row label="Tem CRC" value={c.has_crc == null ? null : c.has_crc ? "Sim" : "Não"} />
              <Row label="Já fez Marketing" value={c.has_marketing_experience == null ? null : c.has_marketing_experience ? "Sim" : "Não"} />
              <Row label="Tem Facebook" value={c.has_facebook == null ? null : c.has_facebook ? "Sim" : "Não"} />
              <Row label="Cenário atual" value={c.current_scenario} />
              <Row label="Objetivo com a Icom" value={c.goal} />
              <Row label="Dor" value={c.pain} />
            </div>
          </Section>

          <Section title="Condição comercial">
            <div className="space-y-0">
              <Row label="Condição diferenciada" value={c.special_condition} />
              <Row label="Valor do contrato" value={formatBRL(Number(c.value))} />
              <Row label="Observação" value={c.notes} />
              <Row label="Observação geral" value={c.general_notes} />
            </div>
          </Section>

          <Section title="Ativação">
            <div className="space-y-0">
              <Row label="Status ativação" value={c.activation_status} />
              <Row label="ID/IC" value={c.ic_id} />
              <Row label="E-mail" value={c.email} />
              <Row label="ID Financeiro" value={c.financial_id} />
              <Row label="ID Contrato" value={c.contract_id} />
            </div>
          </Section>

          <Section title="Localização">
            <div className="space-y-0">
              <Row label="CEP" value={c.cep} />
              <Row label="Cidade" value={c.city} />
              <Row label="Estado" value={c.state} />
            </div>
          </Section>

          <Section title="Pagamento">
            <div className="space-y-0">
              <Row label="Sistema" value={c.billing_system === "vindi" ? "Vindi" : c.billing_system === "bambuno" ? "Bambuno" : c.billing_system} />
              <Row label="Forma de pagamento" value={PAYMENT_METHODS.find((m) => m.value === c.payment_method)?.label ?? c.payment_method} />
              <Row label="Valor pago" value={c.payment_value == null ? null : formatBRL(Number(c.payment_value))} />
              <Row label="Modalidade" value={c.payment_modality} />
              <Row label="Data pagamento" value={c.payment_date} />
            </div>
          </Section>

          <div className="flex justify-end">
            <Button type="button" onClick={startEdit}><Pencil className="mr-2 h-4 w-4" />Editar dados</Button>
          </div>
        </>
      )}
    </form>
  );
}
