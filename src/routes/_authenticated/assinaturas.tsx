import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  EyeOff,
  FileSignature,
  Link2,
  Link2Off,
  PenLine,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe } from "@/lib/session";
import { STATUS_ENVELOPE } from "@/lib/docusign";
import { sugerirClientes, type ClienteBusca } from "@/lib/docusign-match";
import { desvincularEnvelope, ignorarEnvelope, vincularEnvelope } from "@/lib/docusign.functions";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const searchSchema = z.object({
  filtro: z
    .enum(["pendentes", "vinculados", "andamento", "encerrados", "ignorados", "todos"])
    .optional(),
});

export const Route = createFileRoute("/_authenticated/assinaturas")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Assinaturas — ICOM" }] }),
  component: Assinaturas,
});

type Envelope = Database["public"]["Tables"]["docusign_envelopes"]["Row"];
type Signatario = {
  nome: string | null;
  email: string | null;
  status: string | null;
  assinado_em: string | null;
};
type ClienteLinha = ClienteBusca & { onboarding_released_at: string | null };

const dataHora = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
const signatarios = (e: Envelope) =>
  Array.isArray(e.signatarios) ? (e.signatarios as Signatario[]) : [];
const campos = (e: Envelope) =>
  e.campos && typeof e.campos === "object" && !Array.isArray(e.campos)
    ? (e.campos as Record<string, string>)
    : {};

const FILTROS = {
  pendentes: (e: Envelope) => e.status === "completed" && !e.cliente_id && !e.ignorado,
  vinculados: (e: Envelope) => !!e.cliente_id,
  andamento: (e: Envelope) => (e.status === "sent" || e.status === "delivered") && !e.ignorado,
  encerrados: (e: Envelope) => (e.status === "declined" || e.status === "voided") && !e.ignorado,
  ignorados: (e: Envelope) => e.ignorado,
  todos: () => true,
};

function statusBadge(status: string) {
  const key =
    status === "completed"
      ? "concluido"
      : status === "declined"
        ? "atrasado"
        : status === "voided"
          ? "cancelado"
          : "pendente";
  return <StatusBadge status={key} label={STATUS_ENVELOPE[status] ?? status} />;
}

function useEnvelopes() {
  return useQuery({
    queryKey: ["docusign-envelopes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docusign_envelopes")
        .select("*")
        .order("recebido_em", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });
}

function useClientesBusca() {
  return useQuery({
    queryKey: ["clientes-busca"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, clinic_name, legal_name, document, email, codigo_externo, onboarding_released_at",
        )
        .order("clinic_name");
      if (error) throw error;
      return data as ClienteLinha[];
    },
  });
}

function Assinaturas() {
  const { filtro = "pendentes" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: me } = useMe();
  const { data: envelopes = [], isLoading } = useEnvelopes();
  const { data: clientes = [] } = useClientesBusca();
  const qc = useQueryClient();
  const desvincular = useServerFn(desvincularEnvelope);
  const ignorar = useServerFn(ignorarEnvelope);
  const [q, setQ] = useState("");
  const [vinculando, setVinculando] = useState<Envelope | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const linhas = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return envelopes
      .filter(FILTROS[filtro])
      .filter(
        (e) =>
          !termo ||
          [
            e.assunto,
            e.envelope_id,
            ...signatarios(e).flatMap((s) => [s.nome, s.email]),
            clientes.find((c) => c.id === e.cliente_id)?.clinic_name,
          ].some((t) => t?.toLowerCase().includes(termo)),
      );
  }, [envelopes, filtro, q, clientes]);

  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["docusign-envelopes"] }),
      qc.invalidateQueries({ queryKey: ["docusign-pendentes"] }),
      qc.invalidateQueries({ queryKey: ["clients"] }),
      qc.invalidateQueries({ queryKey: ["clientes-busca"] }),
    ]);

  async function acao(e: Envelope, fn: () => Promise<unknown>, ok: string) {
    setOcupado(e.id);
    try {
      await fn();
      await recarregar();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setOcupado(null);
    }
  }

  const kpi = (k: keyof typeof FILTROS) => envelopes.filter(FILTROS[k]).length;
  const KPIS = [
    { k: "pendentes" as const, t: "Aguardando vínculo", icon: Link2, cor: STATUS.em_risco.color },
    { k: "vinculados" as const, t: "Vinculados", icon: CheckCircle2, cor: STATUS.concluido.color },
    {
      k: "andamento" as const,
      t: "Em assinatura",
      icon: Clock,
      cor: STATUS.aguardando_cliente.color,
    },
    {
      k: "encerrados" as const,
      t: "Recusados / cancelados",
      icon: XCircle,
      cor: STATUS.atrasado.color,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assinaturas"
        description="Contratos recebidos do DocuSign. Quando os dados batem com um cliente o vínculo é automático; os demais você vincula aqui."
      />

      {!isLoading && envelopes.length === 0 ? (
        <ComoConfigurar />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {KPIS.map((x) => (
              <KpiCard
                key={x.k}
                title={x.t}
                icon={x.icon}
                color={x.cor}
                value={kpi(x.k)}
                selected={filtro === x.k}
                onClick={() =>
                  navigate({ search: { filtro: filtro === x.k ? "todos" : x.k }, replace: true })
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
                  placeholder="Assunto, signatário ou cliente"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["todos", "ignorados"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filtro === f ? "dark" : "outline"}
                  onClick={() => navigate({ search: { filtro: f }, replace: true })}
                >
                  {f === "todos" ? "Todos" : `Ignorados (${kpi("ignorados")})`}
                </Button>
              ))}
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              {linhas.length} envelope{linhas.length === 1 ? "" : "s"}
            </div>
          </Card>

          {linhas.length === 0 ? (
            <EmptyState
              icon={filtro === "pendentes" ? CheckCircle2 : FileSignature}
              title={
                filtro === "pendentes" ? "Nenhuma assinatura esperando vínculo" : "Nada por aqui"
              }
              description={
                filtro === "pendentes"
                  ? "Todos os contratos assinados já estão ligados a um cliente."
                  : "Nenhum envelope corresponde ao filtro."
              }
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-[#F8FAFC]">
                  <tr>
                    {["Envelope", "Signatários", "Situação", "Assinado em", "Cliente", ""].map(
                      (h) => (
                        <th key={h} className="filter-label px-4 py-2.5 text-left">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((e) => {
                    const cli = clientes.find((c) => c.id === e.cliente_id);
                    return (
                      <tr
                        key={e.id}
                        className={`border-b align-top last:border-0 hover:bg-[#FAFAFC] ${e.ignorado ? "opacity-60" : ""}`}
                      >
                        <td className="max-w-xs px-4 py-3">
                          <div className="font-medium text-[#1F2937]">
                            {e.assunto ?? "Sem assunto"}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {e.envelope_id.slice(0, 8)}… · recebido {dataHora(e.recebido_em)}
                          </div>
                          {e.documentos.length > 0 && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Doc.: {e.documentos.join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {signatarios(e).map((s, i) => (
                            <div key={i} className="leading-tight">
                              <span className="font-medium">{s.nome ?? "—"}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {s.email}
                              </span>
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3">{statusBadge(e.status)}</td>
                        <td className="px-4 py-3 tabular-nums">{dataHora(e.concluido_em)}</td>
                        <td className="px-4 py-3">
                          {cli ? (
                            <div className="leading-tight">
                              <Link
                                to="/clientes/$id"
                                params={{ id: cli.id }}
                                className="font-semibold hover:text-primary hover:underline"
                              >
                                {cli.clinic_name}
                              </Link>
                              <span className="block text-[11px] text-muted-foreground">
                                {e.vinculo === "automatico"
                                  ? `Automático · ${e.vinculo_motivo}`
                                  : "Vinculado manualmente"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {e.ignorado ? "Ignorado" : "Sem vínculo"}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {me?.isAdmin &&
                            (cli ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={ocupado === e.id || !!cli.onboarding_released_at}
                                title={
                                  cli.onboarding_released_at
                                    ? "Cliente já liberado para o onboarding"
                                    : "Desfazer o vínculo"
                                }
                                onClick={() =>
                                  window.confirm(
                                    `Desvincular de ${cli.clinic_name}? A verificação do contrato feita por este envelope será desfeita.`,
                                  ) &&
                                  acao(
                                    e,
                                    () => desvincular({ data: { envelopeId: e.id } }),
                                    "Vínculo desfeito.",
                                  )
                                }
                              >
                                <Link2Off /> Desvincular
                              </Button>
                            ) : e.ignorado ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={ocupado === e.id}
                                onClick={() =>
                                  acao(
                                    e,
                                    () => ignorar({ data: { envelopeId: e.id, ignorado: false } }),
                                    "Envelope restaurado.",
                                  )
                                }
                              >
                                Restaurar
                              </Button>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={ocupado === e.id}
                                  title="Não é contrato de cliente"
                                  onClick={() =>
                                    acao(
                                      e,
                                      () => ignorar({ data: { envelopeId: e.id, ignorado: true } }),
                                      "Envelope ignorado.",
                                    )
                                  }
                                >
                                  <EyeOff />
                                </Button>
                                <Button size="sm" onClick={() => setVinculando(e)}>
                                  <Link2 /> Vincular
                                </Button>
                              </div>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {vinculando && (
        <VincularDialog
          envelope={vinculando}
          clientes={clientes}
          onClose={() => setVinculando(null)}
          onFeito={recarregar}
        />
      )}
    </div>
  );
}

function VincularDialog({
  envelope,
  clientes,
  onClose,
  onFeito,
}: {
  envelope: Envelope;
  clientes: ClienteLinha[];
  onClose: () => void;
  onFeito: () => Promise<unknown>;
}) {
  const vincular = useServerFn(vincularEnvelope);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const sugestoes = useMemo(
    () =>
      sugerirClientes(
        { ...envelope, signatarios: signatarios(envelope), campos: campos(envelope) },
        clientes,
      ),
    [envelope, clientes],
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
          (d.length >= 4 && (c.document ?? "").replace(/\D/g, "").includes(d)),
      )
      .slice(0, 8);
  }, [busca, clientes]);

  async function confirmar() {
    if (!escolhido) return;
    setSalvando(true);
    try {
      const r = await vincular({ data: { envelopeId: envelope.id, clienteId: escolhido } });
      await onFeito();
      toast.success(
        r.assinado
          ? "Vinculado. O contrato do cliente ficou assinado e verificado."
          : "Vinculado. O contrato será verificado quando o envelope for concluído.",
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível vincular.");
      setSalvando(false);
    }
  }

  const Opcao = ({ c, extra }: { c: ClienteLinha; extra?: string | undefined }) => (
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
          <DialogTitle>Vincular assinatura a um cliente</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {envelope.assunto ?? envelope.envelope_id}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md bg-[#F8FAFC] px-3 py-2 text-xs text-muted-foreground">
            {signatarios(envelope)
              .map((s) => [s.nome, s.email].filter(Boolean).join(" · "))
              .join(" | ") || "Sem signatários"}
            {envelope.documentos.length > 0 && <> · Doc.: {envelope.documentos.join(", ")}</>}
          </div>
          {sugestoes.length > 0 && (
            <div className="space-y-1.5">
              <FilterLabel>Sugestões</FilterLabel>
              {sugestoes.map((s) => (
                <Opcao key={s.cliente.id} c={s.cliente as ClienteLinha} extra={s.motivos[0]} />
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <FilterLabel htmlFor="bc">Buscar cliente</FilterLabel>
            <Input
              id="bc"
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

function ComoConfigurar() {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/docusign`
      : "/api/public/docusign";
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
          <PenLine className="h-5 w-5 text-primary" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Nenhuma assinatura recebida ainda</h2>
          <p className="text-sm text-muted-foreground">
            Configure o DocuSign Connect para enviar os envelopes para cá.
          </p>
        </div>
      </div>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          No DocuSign, abra <b>Configurações → Connect → Adicionar configuração → Personalizada</b>.
        </li>
        <li>
          URL de envio: <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs">{url}</code>
        </li>
        <li>
          Formato de dados: <b>JSON</b> (REST v2.1). Eventos de envelope:{" "}
          <b>Enviado, Entregue, Concluído, Recusado e Anulado</b>.
        </li>
        <li>
          Em incluir dados, marque <b>Destinatários, Campos personalizados e Guias (tabs)</b>. Não é
          preciso incluir documentos.
        </li>
        <li>
          Ative <b>Incluir assinatura HMAC</b>, gere a chave e cadastre-a no Netlify como{" "}
          <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs">
            DOCUSIGN_CONNECT_HMAC_KEY
          </code>
          .
        </li>
        <li>
          Para o vínculo automático, use no envelope um campo com o <b>CNPJ/CPF</b> do cliente ou um
          campo personalizado{" "}
          <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-xs">codigo_cliente</code>. Sem
          isso, o sistema tenta pelo e-mail do signatário.
        </li>
      </ol>
    </Card>
  );
}
