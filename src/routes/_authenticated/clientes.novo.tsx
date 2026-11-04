import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSellers } from "@/lib/session";
import { CLIENT_TYPES, PRODUCTS } from "@/lib/crm";
import { clientBaseSchema } from "@/lib/client-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/novo")({
  head: () => ({ meta: [
    { title: "Novo cliente — Icom" },
    { name: "description", content: "Cadastro de clínicas, produtos contratados e diagnóstico comercial da Icom." },
    { property: "og:title", content: "Novo cliente — Icom" },
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ ...f, seller_id: sellerId });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("clients").insert({ ...parsed.data, value: parsed.data.value ?? 0, created_by: me?.id ?? null });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar cliente.");
      return;
    }
    toast.success("Cliente cadastrado! O tempo de onboarding começou a contar.");
    qc.invalidateQueries({ queryKey: ["clients"] });
    navigate({ to: "/clientes" });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Novo cliente</h1>
        <p className="text-muted-foreground">Preencha os dados da venda para iniciar o onboarding.</p>
      </div>

      <section className="space-y-4 rounded-xl bg-card p-6 shadow-card">
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

      <section className="space-y-4 rounded-xl bg-card p-6 shadow-card">
        <h2 className="font-semibold">Produto contratado *</h2>
        <div className="flex flex-wrap gap-3">
          {PRODUCTS.map((p) => {
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

      <section className="space-y-4 rounded-xl bg-card p-6 shadow-card">
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

      <section className="space-y-4 rounded-xl bg-card p-6 shadow-card">
        <h2 className="font-semibold">Condição comercial</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="cond" label="Condição diferenciada"><Input id="cond" value={f.special_condition} onChange={set("special_condition")} /></Field>
          <Field id="val" label="Valor (R$)"><Input id="val" inputMode="decimal" placeholder="0,00" value={f.value} onChange={set("value")} /></Field>
        </div>
        <Field id="obs" label="Observação"><Textarea id="obs" value={f.notes} onChange={set("notes")} /></Field>
      </section>

      <section className="space-y-4 rounded-xl bg-card p-6 shadow-card">
        <Field id="general_notes" label="Observação geral"><Textarea id="general_notes" value={f.general_notes} onChange={set("general_notes")} /></Field>
      </section>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/clientes" })}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar cliente"}</Button>
      </div>
    </form>
  );
}
