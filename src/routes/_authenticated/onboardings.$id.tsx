import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDashed,
  Flag,
  History,
  ListChecks,
  Lock,
  MessageSquare,
  Send,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe, useSellers } from "@/lib/session";
import { ETAPA_STATUS_LABEL, statusToken } from "@/lib/status";
import { Card, ColorBadge, StatusBadge } from "@/components/app/ui";
import {
  AcoesEtapa,
  EditarOnboarding,
  marcarItem,
  useRecarregarOnboarding,
} from "@/components/app/onboarding-edicao";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const searchSchema = z.object({ etapa: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/onboardings/$id")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Onboarding — ICOM" }] }),
  component: DetalheOnboarding,
});

type Etapa = Database["public"]["Views"]["onboarding_etapas_situacao"]["Row"];
type Nota = Database["public"]["Tables"]["onboarding_notas"]["Row"];
type Evento = Database["public"]["Tables"]["onboarding_eventos"]["Row"];
type ItemChecklist = Database["public"]["Tables"]["onboarding_checklist"]["Row"];

const dataBR = (d: string | null | undefined) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";
const dataHora = (d: string) => format(parseISO(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
const iniciais = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

const STATUS_ONB: Record<string, string> = {
  em_andamento: "Em andamento",
  concluido: "Concluído",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

function useOnboarding(id: string) {
  return useQuery({
    queryKey: ["onboarding", id],
    queryFn: async () => {
      const [r, e, ev] = await Promise.all([
        supabase.from("onboardings_resumo").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("onboarding_etapas_situacao")
          .select("*")
          .eq("onboarding_id", id)
          .order("ordem"),
        supabase
          .from("onboarding_eventos")
          .select("*")
          .eq("onboarding_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (r.error) throw r.error;
      const ids = (e.data ?? []).map((x) => x.id!).filter(Boolean);
      const c = ids.length
        ? await supabase
            .from("onboarding_checklist")
            .select("*")
            .in("onboarding_etapa_id", ids)
            .order("ordem")
        : { data: [] as ItemChecklist[] };
      return {
        resumo: r.data,
        etapas: e.data ?? [],
        eventos: ev.data ?? [],
        checklist: c.data ?? [],
      };
    },
  });
}

function useNotas(id: string) {
  return useQuery({
    queryKey: ["onboarding-notas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_notas")
        .select("*")
        .eq("onboarding_id", id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

function DetalheOnboarding() {
  const { id } = Route.useParams();
  const { etapa: etapaUrl } = Route.useSearch();
  const { data, isLoading } = useOnboarding(id);
  const { data: notas = [] } = useNotas(id);
  const { data: pessoas = [] } = useSellers();
  const { data: me } = useMe();
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const iniciou = useRef(false);

  const r = data?.resumo;
  const etapas = useMemo(() => data?.etapas ?? [], [data]);
  const nomePessoa = (uid: string | null | undefined) => {
    const p = pessoas.find((x) => x.id === uid);
    return p ? p.full_name || p.email : null;
  };

  // Abre a etapa do link (Minhas etapas) ou a etapa atual.
  useEffect(() => {
    if (iniciou.current || !r) return;
    iniciou.current = true;
    const alvo = etapaUrl ?? r.etapa_atual_id;
    if (alvo) {
      setAbertas(new Set([alvo]));
      setTimeout(
        () =>
          document
            .getElementById(`etapa-${alvo}`)
            ?.scrollIntoView({ block: "center", behavior: "smooth" }),
        150,
      );
    }
  }, [r, etapaUrl]);

  const fases = useMemo(() => {
    const out: { nome: string; cor: string; etapas: Etapa[] }[] = [];
    for (const e of etapas) {
      const nome = e.fase_nome ?? "Etapas";
      const ult = out[out.length - 1];
      if (ult && ult.nome === nome) ult.etapas.push(e);
      else out.push({ nome, cor: e.fase_cor ?? "#64748B", etapas: [e] });
    }
    return out;
  }, [etapas]);

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!r) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Onboarding não encontrado.</p>
        <Button variant="outline" asChild>
          <Link to="/painel">
            <ArrowLeft /> Voltar ao painel
          </Link>
        </Button>
      </div>
    );
  }

  const podeOperar = !!me?.podeOperar;
  const gestor =
    !!me &&
    (me.isAdmin ||
      (me.roles.includes("gestor") && me.produtosGeridos.includes(r.produto_id ?? "")));
  const encerrado = r.status === "cancelado" || r.status === "pausado";
  const total = r.etapas_total ?? 0;
  const feitas = r.etapas_feitas ?? 0;
  const pct = total ? Math.round((feitas / total) * 100) : 0;
  const gerais = notas.filter((n) => !n.onboarding_etapa_id);
  const alternar = (eid: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(eid)) n.delete(eid);
      else n.add(eid);
      return n;
    });

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/painel"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Painel
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ColorBadge color={r.produto_cor ?? "#7C3AED"}>{r.produto_nome}</ColorBadge>
              <StatusBadge status={r.situacao} />
              {r.status &&
                r.status !== "em_andamento" &&
                r.status !== "concluido" &&
                r.situacao !== r.status && (
                  <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[11px] font-bold text-[#475569]">
                    {STATUS_ONB[r.status] ?? r.status}
                  </span>
                )}
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{r.cliente_nome}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Onboarding de {r.produto_nome} · modelo v{r.modelo_versao ?? 1} · prazos em dias{" "}
              {r.calendario === "corridos" ? "corridos" : "úteis"}
              {r.motivo && (r.status === "pausado" || r.status === "cancelado") && (
                <>
                  {" "}
                  · {r.status === "pausado" ? "pausado" : "cancelado"}: {r.motivo}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EditarOnboarding resumo={r} podeOperar={podeOperar} gestor={gestor} />
            <Button variant="outline" asChild>
              <Link to="/clientes/$id" params={{ id: r.cliente_id! }}>
                <Building2 /> Abrir cliente
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="filter-label">Progresso</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[28px] font-bold leading-none tabular-nums text-[#1F2937]">
              {pct}%
            </span>
            <span className="text-sm text-muted-foreground">
              {feitas} de {total} etapas
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F1F5F9]">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>
        <Resumo
          icon={Flag}
          titulo="Etapa atual"
          valor={r.etapa_atual_nome ?? (r.status === "concluido" ? "Todas concluídas" : "—")}
          sub={
            r.etapa_atual_nome
              ? `${r.etapa_atual_fase ?? ""}${r.etapa_atual_prazo ? ` · prazo ${dataBR(r.etapa_atual_prazo)}` : ""}`
              : undefined
          }
          destaque={!!r.etapa_atual_nome}
        />
        <Resumo icon={CalendarDays} titulo="Início" valor={dataBR(r.data_inicio)} />
        <Resumo
          icon={CalendarClock}
          titulo={r.status === "concluido" ? "Concluído em" : "Previsão de término"}
          valor={dataBR(r.status === "concluido" ? r.data_termino : r.previsao_termino)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Etapas</h2>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() =>
                setAbertas(abertas.size ? new Set() : new Set(etapas.map((e) => e.id!)))
              }
            >
              {abertas.size ? "Recolher todas" : "Expandir todas"}
            </button>
          </div>
          <div className="space-y-5">
            {fases.map((f, fi) => (
              <div key={`${f.nome}-${fi}`}>
                <div className="filter-label mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.cor }} />
                  {f.nome}
                </div>
                <ol className="space-y-1.5">
                  {f.etapas.map((e) => (
                    <LinhaEtapa
                      key={e.id}
                      etapa={e}
                      atual={e.id === r.etapa_atual_id}
                      aberta={abertas.has(e.id!)}
                      onAlternar={() => alternar(e.id!)}
                      responsavel={nomePessoa(e.responsavel_id)}
                      concluidaPor={nomePessoa(e.concluida_por)}
                      notas={notas.filter((n) => n.onboarding_etapa_id === e.id)}
                      checklist={(data?.checklist ?? []).filter(
                        (c) => c.onboarding_etapa_id === e.id,
                      )}
                      eventos={(data?.eventos ?? []).filter(
                        (ev) => ev.onboarding_etapa_id === e.id,
                      )}
                      onboardingId={id}
                      nomePessoa={nomePessoa}
                      podeOperar={podeOperar}
                      gestor={gestor}
                      encerrado={encerrado}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <MessageSquare className="h-4 w-4" /> Comentários gerais
            </h2>
            <Comentarios
              notas={gerais}
              onboardingId={id}
              etapaId={null}
              nomePessoa={nomePessoa}
              vazio="Sem comentários gerais. Use para recados que valem para o onboarding inteiro."
            />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <History className="h-4 w-4" /> Histórico
            </h2>
            <Historico
              eventos={(data?.eventos ?? []).slice(0, 15)}
              etapas={etapas}
              nomePessoa={nomePessoa}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Resumo({
  icon: Icon,
  titulo,
  valor,
  sub,
  destaque,
}: {
  icon: typeof Flag;
  titulo: string;
  valor: string;
  sub?: string | undefined;
  destaque?: boolean;
}) {
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="filter-label">{titulo}</div>
        <div
          className={`mt-1.5 truncate text-lg font-semibold ${destaque ? "text-gold" : "text-[#1F2937]"}`}
        >
          {valor}
        </div>
        {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
        <Icon className="h-4 w-4" />
      </span>
    </Card>
  );
}

function Marcador({ etapa, atual }: { etapa: Etapa; atual: boolean }) {
  if (etapa.status === "concluida")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#10B981] text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  if (etapa.status === "bloqueada")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FEE2E2] text-[#B91C1C]">
        <Lock className="h-3 w-3" />
      </span>
    );
  if (etapa.status === "pulada")
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F1F5F9] text-[#94A3B8]">
        <CircleDashed className="h-3.5 w-3.5" />
      </span>
    );
  if (atual)
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gold bg-[#FBF6EC] text-[11px] font-bold text-gold">
        {etapa.ordem}
      </span>
    );
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[11px] font-semibold text-[#94A3B8]">
      {etapa.ordem}
    </span>
  );
}

function LinhaEtapa({
  etapa,
  atual,
  aberta,
  onAlternar,
  responsavel,
  concluidaPor,
  notas,
  checklist,
  eventos,
  onboardingId,
  nomePessoa,
  podeOperar,
  gestor,
  encerrado,
}: {
  podeOperar: boolean;
  gestor: boolean;
  encerrado: boolean;
  etapa: Etapa;
  atual: boolean;
  aberta: boolean;
  onAlternar: () => void;
  responsavel: string | null;
  concluidaPor: string | null;
  notas: Nota[];
  checklist: ItemChecklist[];
  eventos: Evento[];
  onboardingId: string;
  nomePessoa: (id: string | null | undefined) => string | null;
}) {
  const feitos = checklist.filter((c) => c.feito).length;
  const pendentesObrigatorios = checklist.filter((c) => c.obrigatorio && !c.feito).length;
  const recarregar = useRecarregarOnboarding(onboardingId);
  const marcavel =
    podeOperar && !encerrado && etapa.status !== "concluida" && etapa.status !== "pulada";
  const prazoTexto =
    etapa.status === "concluida"
      ? `Concluída em ${dataBR(etapa.concluida_em)}`
      : etapa.prazo_em
        ? `Prazo ${dataBR(etapa.prazo_em)}`
        : etapa.status === "pendente"
          ? `SLA ${etapa.sla_dias} dia${etapa.sla_dias === 1 ? "" : "s"}`
          : "";
  return (
    <li
      id={`etapa-${etapa.id}`}
      className={`rounded-lg border transition ${atual ? "border-gold/50 bg-[#FFFDF8]" : "border-transparent bg-[#F8FAFC]"} ${aberta ? "shadow-sm" : ""}`}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberta}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <Marcador etapa={etapa} atual={atual} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${atual ? "font-semibold text-gold" : etapa.status === "pulada" ? "text-muted-foreground line-through" : "font-medium text-[#1F2937]"}`}
          >
            {etapa.nome}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {[
              responsavel ?? "Sem responsável",
              prazoTexto,
              checklist.length ? `checklist ${feitos}/${checklist.length}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        {notas.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title="Comentários"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {notas.length}
          </span>
        )}
        {etapa.status !== "pendente" && <StatusBadge status={etapa.situacao} />}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${aberta ? "rotate-180" : ""}`}
        />
      </button>
      {aberta && (
        <div className="space-y-4 border-t px-3 pb-3 pt-3 sm:pl-12">
          <AcoesEtapa
            etapa={etapa}
            onboardingId={onboardingId}
            podeOperar={podeOperar}
            gestor={gestor}
            encerrado={encerrado}
            checklistPendente={pendentesObrigatorios}
          />
          <div className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>
              Status:{" "}
              <b className="text-foreground">
                {ETAPA_STATUS_LABEL[etapa.status ?? ""] ?? etapa.status}
              </b>
            </span>
            <span>
              SLA:{" "}
              <b className="text-foreground">
                {etapa.sla_dias} dia{etapa.sla_dias === 1 ? "" : "s"}
              </b>
              {etapa.dias_decorridos != null && etapa.iniciada_em && etapa.status !== "concluida"
                ? ` · ${etapa.dias_decorridos} decorrido${etapa.dias_decorridos === 1 ? "" : "s"}`
                : ""}
            </span>
            {etapa.iniciada_em && <span>Iniciada em {dataBR(etapa.iniciada_em)}</span>}
            {etapa.concluida_em && (
              <span>
                Concluída em {dataBR(etapa.concluida_em)}
                {concluidaPor ? ` por ${concluidaPor}` : ""}
              </span>
            )}
          </div>
          {etapa.motivo &&
            (etapa.status === "bloqueada" ||
              etapa.status === "pulada" ||
              etapa.status === "aguardando_cliente") && (
              <div
                className="rounded-md px-3 py-2 text-sm"
                style={{
                  backgroundColor: statusToken(etapa.situacao).bg,
                  color: statusToken(etapa.situacao).text,
                }}
              >
                <b>Motivo:</b> {etapa.motivo}
              </div>
            )}
          {etapa.descricao && (
            <p className="whitespace-pre-line text-sm text-[#334155]">{etapa.descricao}</p>
          )}
          {checklist.length > 0 && (
            <div>
              <div className="filter-label mb-1.5 flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" /> Checklist
              </div>
              <ul className="space-y-1">
                {checklist.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      disabled={!marcavel}
                      onClick={() => marcarItem(c.id, !c.feito, recarregar)}
                      aria-label={c.feito ? `Desmarcar ${c.texto}` : `Marcar ${c.texto}`}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition enabled:cursor-pointer enabled:hover:border-primary ${c.feito ? "border-[#10B981] bg-[#10B981] text-white" : "border-[#CBD5E1] bg-white"}`}
                    >
                      {c.feito && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                    <span className={c.feito ? "text-muted-foreground line-through" : ""}>
                      {c.texto}
                    </span>
                    {!c.obrigatorio && (
                      <span className="text-[11px] text-muted-foreground">opcional</span>
                    )}
                    {c.feito && c.feito_em && (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {nomePessoa(c.feito_por) ?? ""} {dataBR(c.feito_em)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="filter-label mb-2 flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> Comentários da etapa
            </div>
            <Comentarios
              notas={notas}
              onboardingId={onboardingId}
              etapaId={etapa.id!}
              nomePessoa={nomePessoa}
              vazio="Nenhum comentário nesta etapa."
            />
          </div>
          {eventos.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Histórico da etapa ({eventos.length})
              </summary>
              <ul className="mt-1.5 space-y-1 pl-1">
                {eventos.map((ev) => (
                  <li key={ev.id}>
                    {dataHora(ev.created_at)} · {textoEvento(ev, nomePessoa)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

function Comentarios({
  notas,
  onboardingId,
  etapaId,
  nomePessoa,
  vazio,
}: {
  notas: Nota[];
  onboardingId: string;
  etapaId: string | null;
  nomePessoa: (id: string | null | undefined) => string | null;
  vazio: string;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const t = texto.trim();
    if (!t || !me) return;
    setEnviando(true);
    const { error } = await supabase.from("onboarding_notas").insert({
      onboarding_id: onboardingId,
      onboarding_etapa_id: etapaId,
      texto: t,
      user_id: me.id,
    });
    setEnviando(false);
    if (error) {
      toast.error(
        error.message.includes("row-level")
          ? "Seu perfil não pode comentar."
          : "Não foi possível enviar o comentário.",
      );
      return;
    }
    setTexto("");
    await qc.invalidateQueries({ queryKey: ["onboarding-notas", onboardingId] });
  }

  async function excluir(n: Nota) {
    if (!window.confirm("Excluir este comentário?")) return;
    const { error } = await supabase.from("onboarding_notas").delete().eq("id", n.id);
    if (error) {
      toast.error("Não foi possível excluir.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["onboarding-notas", onboardingId] });
  }

  return (
    <div className="space-y-3">
      {notas.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="space-y-3">
          {notas.map((n) => {
            const autor = n.user_id ? (nomePessoa(n.user_id) ?? "Usuário removido") : "Sistema";
            return (
              <li key={n.id} className="group flex gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-primary">
                  {iniciais(autor)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">{autor}</span>
                    <span
                      className="text-[11px] text-muted-foreground"
                      title={dataHora(n.created_at)}
                    >
                      {formatDistanceToNow(parseISO(n.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    {me && (n.user_id === me.id || me.isAdmin) && (
                      <button
                        type="button"
                        onClick={() => excluir(n)}
                        aria-label="Excluir comentário"
                        className="ml-auto text-muted-foreground opacity-0 transition hover:text-[#B91C1C] focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-line break-words text-sm text-[#334155]">
                    {n.texto}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {me?.podeOperar && (
        <div className="space-y-1.5">
          <Textarea
            rows={2}
            value={texto}
            maxLength={5000}
            placeholder="Escreva um comentário..."
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void enviar();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Ctrl/⌘ + Enter para enviar</span>
            <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}>
              <Send /> Comentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function textoEvento(ev: Evento, nomePessoa: (id: string | null | undefined) => string | null) {
  const quem = nomePessoa(ev.user_id);
  const rot = (s: string | null) => (s ? (ETAPA_STATUS_LABEL[s] ?? STATUS_ONB[s] ?? s) : "—");
  let t: string;
  if (ev.tipo === "etapa_status") t = `${rot(ev.de)} → ${rot(ev.para)}`;
  else if (ev.tipo === "onboarding_status") t = `Onboarding: ${rot(ev.de)} → ${rot(ev.para)}`;
  else t = ev.detalhe ?? ev.tipo;
  if (ev.detalhe && ev.tipo !== "criado" && ev.tipo.endsWith("status")) t += ` (${ev.detalhe})`;
  return quem ? `${t} · ${quem}` : t;
}

function Historico({
  eventos,
  etapas,
  nomePessoa,
}: {
  eventos: Evento[];
  etapas: Etapa[];
  nomePessoa: (id: string | null | undefined) => string | null;
}) {
  if (!eventos.length)
    return <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>;
  return (
    <ul className="space-y-2.5">
      {eventos.map((ev) => {
        const et = etapas.find((e) => e.id === ev.onboarding_etapa_id);
        return (
          <li key={ev.id} className="text-xs">
            <div className="text-[#334155]">
              {et && <b>{et.nome}: </b>}
              {textoEvento(ev, nomePessoa)}
            </div>
            <div className="text-[11px] text-muted-foreground">{dataHora(ev.created_at)}</div>
          </li>
        );
      })}
    </ul>
  );
}
