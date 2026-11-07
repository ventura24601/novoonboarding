import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Inbox,
  Link2,
  RotateCcw,
  Search,
  UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe } from "@/lib/session";
import { formatarDocumento } from "@/lib/vendas";
import { sugerirClientes, type ClienteBusca } from "@/lib/docusign-match";
import {
  Card,
  EmptyState,
  FilterLabel,
  KpiCard,
  PageHeader,
  StatusBadge,
} from "@/components/app/ui";
import { STATUS } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const searchSchema = z.object({
  filtro: z.enum(["pendente", "aprovada", "descartada", "todas"]).optional(),
});

export const Route = createFileRoute("/_authenticated/vendas")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Vendas recebidas — ICOM" }] }),
  component: Vendas,
});

type Venda = Database["public"]["Tables"]["vendas_recebidas"]["Row"];
type Cliente = ClienteBusca;

const dataHora = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
const dig = (s: string | null) => (s ?? "").replace(/\D/g, "");

/** Cliente já cadastrado com o mesmo CNPJ ou e-mail (alerta de duplicidade). */
function clienteExistente(v: Venda, clientes: Cliente[]) {
  const doc = dig(v.cnpj);
  return clientes.find(
    (c) =>
      (doc && dig(c.document) === doc) || (v.email && c.email?.toLowerCase().trim() === v.email),
  );
}

function Vendas() {
  const { filtro = "pendente" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useMe();
  const qc = useQueryClient();
  const podeRevisar = !!me && (me.isAdmin || me.roles.includes("vendedor"));
  const [q, setQ] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<Venda | null>(null);
  const [descartando, setDescartando] = useState<Venda | null>(null);

  const { data: vendas = [], isLoading } = useQuery({
    queryKey: ["vendas-recebidas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas_recebidas")
        .select("*")
        .order("recebido_em", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-busca"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, clinic_name, legal_name, document, email, codigo_externo, onboarding_released_at",
        )
        .order("clinic_name");
      if (error) throw error;
      return data as (Cliente & { onboarding_released_at: string | null })[];
    },
  });

  const contagem = (s: Venda["status"]) => vendas.filter((v) => v.status === s).length;
  const linhas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = t.replace(/\D/g, "");
    return vendas
      .filter((v) => filtro === "todas" || v.status === filtro)
      .filter(
        (v) =>
          !t ||
          [v.nome, v.email, v.telefone, v.condicao_pagamento, v.vendedor].some((x) =>
            x?.toLowerCase().includes(t),
          ) ||
          (d.length >= 4 && dig(v.cnpj).includes(d)),
      );
  }, [vendas, filtro, q]);

  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["vendas-recebidas"] }),
      qc.invalidateQueries({ queryKey: ["vendas-pendentes"] }),
      qc.invalidateQueries({ queryKey: ["clients"] }),
    ]);

  async function reabrir(v: Venda) {
    const { error } = await supabase
      .from("vendas_recebidas")
      .update({ status: "pendente" })
      .eq("id", v.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Venda voltou para revisão.");
    await recarregar();
  }

  const KPIS = [
    { k: "pendente" as const, t: "Aguardando revisão", icon: Inbox, cor: STATUS.em_risco.color },
    { k: "aprovada" as const, t: "Aprovadas", icon: CheckCircle2, cor: STATUS.concluido.color },
    { k: "descartada" as const, t: "Descartadas", icon: Ban, cor: STATUS.pendente.color },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas recebidas"
        description="Vendas que chegam automaticamente do sistema de vendas. Revise cada uma para virar cliente (ou vincule a um cliente que já existe)."
      />

      {!isLoading && vendas.length === 0 ? (
        <ComoConfigurar />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {KPIS.map((x) => (
              <KpiCard
                key={x.k}
                title={x.t}
                icon={x.icon}
                color={x.cor}
                value={contagem(x.k)}
                selected={filtro === x.k}
                onClick={() =>
                  navigate({ search: { filtro: filtro === x.k ? "todas" : x.k }, replace: true })
                }
              />
            ))}
          </div>

          <Card className="flex flex-wrap items-end gap-4 p-4">
            <div className="w-72">
              <FilterLabel htmlFor="busca">Buscar</FilterLabel>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="busca"
                  className="pl-8"
                  placeholder="Nome, CNPJ, e-mail ou telefone"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            <Button
              size="sm"
              variant={filtro === "todas" ? "dark" : "outline"}
              onClick={() => navigate({ search: { filtro: "todas" }, replace: true })}
            >
              Todas
            </Button>
            <div className="ml-auto text-xs text-muted-foreground">
              {linhas.length} venda{linhas.length === 1 ? "" : "s"}
            </div>
          </Card>

          {linhas.length === 0 ? (
            <EmptyState
              icon={filtro === "pendente" ? CheckCircle2 : Inbox}
              title={filtro === "pendente" ? "Nenhuma venda aguardando revisão" : "Nada por aqui"}
              description={
                filtro === "pendente"
                  ? "Todas as vendas recebidas já foram revisadas."
                  : "Nenhuma venda corresponde ao filtro."
              }
            />
          ) : (
            <Card className="divide-y">
              {linhas.map((v) => {
                const existente = clienteExistente(v, clientes);
                const cliente = clientes.find((c) => c.id === v.cliente_id);
                const duplicadas = vendas.filter(
                  (o) =>
                    o.id !== v.id &&
                    o.status !== "descartada" &&
                    dig(o.cnpj) &&
                    dig(o.cnpj) === dig(v.cnpj),
                ).length;
                const exp = aberta === v.id;
                return (
                  <div key={v.id}>
                    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setAberta(exp ? null : v.id)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        aria-expanded={exp}
                      >
                        <ChevronDown
                          className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${exp ? "rotate-180" : ""}`}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-[#1F2937]">
                            {v.nome ?? "Sem nome"}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {[formatarDocumento(v.cnpj), v.email, v.whatsapp ?? v.telefone]
                              .filter(Boolean)
                              .join(" · ") || "Sem contato"}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>Recebida {dataHora(v.recebido_em)}</span>
                            {v.tipo && (
                              <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 font-bold text-[#475569]">
                                {v.tipo}
                              </span>
                            )}
                            {v.meio_pagamento && <span>· {v.meio_pagamento}</span>}
                            {v.condicao_pagamento && <span>· {v.condicao_pagamento}</span>}
                          </span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {v.status === "pendente" && existente && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[11px] font-bold text-[#B45309]"
                            title="Mesmo CNPJ ou e-mail de um cliente já cadastrado"
                          >
                            <AlertTriangle className="h-3 w-3" /> Já cadastrado:{" "}
                            {existente.clinic_name}
                          </span>
                        )}
                        {v.status === "pendente" && duplicadas > 0 && (
                          <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[11px] font-bold text-[#B45309]">
                            Possível duplicada
                          </span>
                        )}
                        {v.status === "aprovada" && (
                          <span className="text-sm">
                            <StatusBadge status="concluido" label="Aprovada" />{" "}
                            {cliente && (
                              <Link
                                to="/clientes/$id"
                                params={{ id: cliente.id }}
                                className="font-medium hover:text-primary hover:underline"
                              >
                                {cliente.clinic_name}
                              </Link>
                            )}
                          </span>
                        )}
                        {v.status === "descartada" && (
                          <StatusBadge status="cancelado" label="Descartada" />
                        )}
                        {podeRevisar && v.status === "pendente" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setDescartando(v)}>
                              <Ban /> Descartar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setVinculando(v)}>
                              <Link2 /> Vincular a existente
                            </Button>
                            <Button size="sm" asChild>
                              <Link to="/clientes/novo" search={{ venda: v.id }}>
                                <UserPlus /> Revisar e cadastrar
                              </Link>
                            </Button>
                          </>
                        )}
                        {podeRevisar &&
                          (v.status === "descartada" ||
                            (v.status === "aprovada" && me?.isAdmin)) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => reabrir(v)}
                              title="Voltar para revisão"
                            >
                              <RotateCcw /> Reabrir
                            </Button>
                          )}
                      </div>
                    </div>
                    {exp && <Detalhes v={v} />}
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      {vinculando && (
        <VincularDialog
          venda={vinculando}
          clientes={clientes}
          onClose={() => setVinculando(null)}
          onFeito={recarregar}
        />
      )}
      {descartando && (
        <DescartarDialog
          venda={descartando}
          onClose={() => setDescartando(null)}
          onFeito={recarregar}
        />
      )}
    </div>
  );
}

function Detalhes({ v }: { v: Venda }) {
  const payload = (
    v.payload && typeof v.payload === "object" && !Array.isArray(v.payload) ? v.payload : {}
  ) as Record<string, string | null>;
  return (
    <div className="border-t bg-[#F8FAFC] px-5 py-4 pl-12">
      {v.status !== "pendente" && (
        <p className="mb-3 text-xs text-muted-foreground">
          {v.status === "aprovada" ? "Aprovada" : "Descartada"} em {dataHora(v.revisado_em)}
          {v.motivo_descarte && (
            <>
              {" "}
              · Motivo: <b className="text-foreground">{v.motivo_descarte}</b>
            </>
          )}
        </p>
      )}
      <div className="filter-label mb-2">Dados recebidos</div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(payload).map(([k, val]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">{k}:</dt>
            <dd
              className={`truncate ${val == null ? "text-muted-foreground" : ""}`}
              title={val ?? ""}
            >
              {val ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function VincularDialog({
  venda,
  clientes,
  onClose,
  onFeito,
}: {
  venda: Venda;
  clientes: Cliente[];
  onClose: () => void;
  onFeito: () => Promise<unknown>;
}) {
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const sugestoes = useMemo(
    () =>
      sugerirClientes(
        {
          assunto: venda.nome,
          signatarios: [{ nome: venda.nome, email: venda.email }],
          documentos: venda.cnpj ? [venda.cnpj] : [],
          campos: {},
        },
        clientes,
      ),
    [venda, clientes],
  );
  const resultados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return [];
    const d = t.replace(/\D/g, "");
    return clientes
      .filter(
        (c) =>
          c.clinic_name.toLowerCase().includes(t) ||
          c.legal_name?.toLowerCase().includes(t) ||
          c.email?.toLowerCase().includes(t) ||
          (d.length >= 4 && dig(c.document).includes(d)),
      )
      .slice(0, 8);
  }, [busca, clientes]);

  async function confirmar() {
    if (!escolhido) return;
    setSalvando(true);
    const { error } = await supabase
      .from("vendas_recebidas")
      .update({ status: "aprovada", cliente_id: escolhido })
      .eq("id", venda.id);
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Venda vinculada ao cliente existente.");
    await onFeito();
    onClose();
  }

  const Opcao = ({ c, extra }: { c: Cliente; extra?: string | undefined }) => (
    <button
      type="button"
      onClick={() => setEscolhido(c.id)}
      className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition ${escolhido === c.id ? "border-primary bg-accent" : "hover:bg-[#F8FAFC]"}`}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{c.clinic_name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[c.legal_name, c.document, c.email].filter(Boolean).join(" · ") ||
            "Sem documento ou e-mail"}
        </span>
      </span>
      {extra && (
        <span className="shrink-0 rounded bg-[#D1FAE5] px-1.5 py-0.5 text-[11px] font-bold text-[#065F46]">
          {extra}
        </span>
      )}
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular venda a um cliente existente</DialogTitle>
          <DialogDescription>
            {[venda.nome, formatarDocumento(venda.cnpj), venda.email].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {sugestoes.length > 0 && (
            <div className="space-y-1.5">
              <FilterLabel>Sugestões</FilterLabel>
              {sugestoes.map((s) => (
                <Opcao
                  key={s.cliente.id}
                  c={s.cliente}
                  extra={s.motivos[0]?.replace("E-mail do signatário", "E-mail igual")}
                />
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <FilterLabel htmlFor="bcv">Buscar cliente</FilterLabel>
            <Input
              id="bcv"
              placeholder="Nome, razão social, e-mail ou CPF/CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {resultados.map((c) => (
              <Opcao key={c.id} c={c} />
            ))}
            {busca.trim() && resultados.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Os dados do cliente não são alterados; a venda só fica registrada como deste cliente.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!escolhido || salvando}>
            <Link2 /> Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MOTIVOS = ["Venda duplicada", "Teste", "Cancelada pelo cliente", "Dados inválidos"];

function DescartarDialog({
  venda,
  onClose,
  onFeito,
}: {
  venda: Venda;
  onClose: () => void;
  onFeito: () => Promise<unknown>;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function confirmar() {
    setSalvando(true);
    const { error } = await supabase
      .from("vendas_recebidas")
      .update({ status: "descartada", motivo_descarte: motivo.trim() })
      .eq("id", venda.id);
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Venda descartada.");
    await onFeito();
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descartar venda</DialogTitle>
          <DialogDescription>
            {venda.nome ?? "Venda"} não vai virar cliente. Dá para reabrir depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={motivo === m ? "dark" : "outline"}
                onClick={() => setMotivo(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <Textarea
            rows={2}
            placeholder="Motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={confirmar} disabled={!motivo.trim() || salvando}>
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComoConfigurar() {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/vendas`
      : "/api/public/vendas";
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
          <Inbox className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Nenhuma venda recebida ainda</h2>
          <p className="text-sm text-muted-foreground">
            Configure o sistema de vendas para enviar cada compra para cá.
          </p>
        </div>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          Método <b>POST</b> para{" "}
          <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs">{url}</code>
        </li>
        <li>Não precisa de token: as vendas recebidas sempre entram como aguardando revisão.</li>
        <li>
          Corpo em JSON com os campos da venda (nome, cnpj, email, telefone, whatsapp,
          meio_pagamento, condicao_pagamento, vendedor_email...). Também aceita formulário ou linhas{" "}
          <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs">campo:valor</code>.
        </li>
      </ol>
    </Card>
  );
}
