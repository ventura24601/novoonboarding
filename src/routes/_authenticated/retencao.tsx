import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlarmClock,
  AlertTriangle,
  Clock,
  Columns3,
  Hourglass,
  LayoutList,
  MessageCircle,
  Phone,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  TrendingDown,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe } from "@/lib/session";
import {
  CANAIS,
  RESULTADOS,
  STATUS_RETENCAO,
  TAGS_SUGERIDAS,
  contagem,
  linkWhatsapp,
  metricas,
  porSemana,
  resultadoRotulo,
  soDigitos,
  statusRetencao,
  type StatusRetencao,
} from "@/lib/retencao";
import { sincronizarRetencaoAgora } from "@/lib/retencao.functions";
import { usePessoasAtivas } from "@/components/app/onboarding-edicao";
import { EmptyState, FilterLabel, KpiCard } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const searchSchema = z.object({
  visao: z.enum(["kanban", "tabela"]).optional(),
  status: z.string().optional(),
  tag: z.string().optional(),
  motivo: z.string().optional(),
  resp: z.string().optional(),
  atrasados: z.boolean().optional(),
  periodo: z.enum(["30", "90", "tudo"]).optional(),
});

export const Route = createFileRoute("/_authenticated/retencao")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Retenção — ICOM" }] }),
  component: Retencao,
});

type Caso = Database["public"]["Views"]["retencao_casos_situacao"]["Row"];
type CasoOk = Caso & { id: string; status: string; data_solicitacao: string; tags: string[] };
const TODOS = "__todos__";
const servicosDe = (c: { servicos?: unknown }) =>
  (Array.isArray(c.servicos) ? c.servicos : []) as { nome: string; cancelado: boolean }[];
const dataHora = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
const dataBR = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

function useCasos() {
  return useQuery({
    queryKey: ["retencao"],
    queryFn: async () => {
      const [c, s] = await Promise.all([
        supabase
          .from("retencao_casos_situacao")
          .select("*")
          .order("data_solicitacao", { ascending: false }),
        supabase
          .from("retencao_sincronizacoes")
          .select("*")
          .order("iniciado_em", { ascending: false })
          .limit(1),
      ]);
      if (c.error) throw c.error;
      return { casos: (c.data ?? []) as CasoOk[], ultima: s.data?.[0] ?? null };
    },
    refetchInterval: 60_000,
  });
}

function Retencao() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: me } = useMe();
  const { data, isLoading } = useCasos();
  const { data: pessoas = [] } = usePessoasAtivas();
  const qc = useQueryClient();
  const sincronizar = useServerFn(sincronizarRetencaoAgora);
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [contatoDe, setContatoDe] = useState<CasoOk | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const visao = busca.visao ?? "kanban";
  const set = (p: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...p }), replace: true });

  const casos = useMemo(() => data?.casos ?? [], [data]);
  const doPeriodo = useMemo(() => {
    if (!busca.periodo || busca.periodo === "tudo") return casos;
    const lim = Date.now() - Number(busca.periodo) * 86400_000;
    return casos.filter((c) => new Date(c.data_solicitacao).getTime() >= lim);
  }, [casos, busca.periodo]);
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = soDigitos(t);
    return doPeriodo.filter((c) => {
      if (busca.status && c.status !== busca.status) return false;
      if (busca.tag && !c.tags.includes(busca.tag)) return false;
      if (busca.motivo && c.motivo_api !== busca.motivo) return false;
      if (busca.resp && (busca.resp === "sem" ? c.responsavel_id : c.responsavel_id !== busca.resp))
        return false;
      if (busca.atrasados && contagem(c).nivel !== "atrasado") return false;
      if (!t) return true;
      return (
        [c.id_appcrc, c.cliente_nome, c.email, c.solicitante].some((x) =>
          x?.toLowerCase().includes(t),
        ) ||
        (d.length >= 3 && soDigitos(c.telefone).includes(d))
      );
    });
  }, [doPeriodo, q, busca]);
  const m = useMemo(() => metricas(doPeriodo), [doPeriodo]);
  const semanas = useMemo(() => porSemana(doPeriodo, 8), [doPeriodo]);
  const todosMotivos = useMemo(
    () =>
      [...new Set(casos.map((c) => c.motivo_api).filter((x): x is string => !!x))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [casos],
  );
  const todasTags = useMemo(
    () =>
      [...new Set([...TAGS_SUGERIDAS, ...casos.flatMap((c) => c.tags)])].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [casos],
  );
  const nomePessoa = (id: string | null) => {
    const p = pessoas.find((x) => x.id === id);
    return p ? p.full_name || p.email : null;
  };
  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["retencao"] }),
      qc.invalidateQueries({ queryKey: ["retencao-alerta"] }),
    ]);

  async function mudarStatus(c: CasoOk, status: StatusRetencao) {
    if (c.status === status) return;
    const patch: Database["public"]["Tables"]["retencao_casos"]["Update"] = { status };
    if (!c.responsavel_id && me) patch.responsavel_id = me.id;
    const { error } = await supabase.from("retencao_casos").update(patch).eq("id", c.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await recarregar();
    toast.success(`${c.id_appcrc ?? c.cliente_nome ?? "Caso"} → ${statusRetencao(status).rotulo}`);
  }

  async function sincronizarAgora() {
    setSincronizando(true);
    try {
      const r = await sincronizar();
      if (r.ok)
        toast.success(
          `Coleta concluída: ${r.novos} novo${r.novos === 1 ? "" : "s"}, ${r.atualizados} atualizado${r.atualizados === 1 ? "" : "s"}.`,
        );
      else toast.error(`A coleta falhou: ${r.erro}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setSincronizando(false);
    await recarregar();
  }

  if (me && !me.podeOperar) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Sem acesso à retenção"
        description="A retenção é usada por administradores, gestores, operadores e CS."
      />
    );
  }
  const ultima = data?.ultima;
  const caso = casos.find((c) => c.id === aberto) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Retenção</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedidos de cancelamento coletados da gestão 2x por dia.{" "}
            {ultima ? (
              <span className={ultima.ok ? "" : "font-medium text-[#B91C1C]"}>
                Última coleta{" "}
                {formatDistanceToNow(parseISO(ultima.iniciado_em), {
                  addSuffix: true,
                  locale: ptBR,
                })}
                {ultima.ok ? "" : " falhou"}.
              </span>
            ) : (
              "Nenhuma coleta ainda."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border bg-white p-0.5">
            <button
              type="button"
              onClick={() => set({ visao: "kanban" })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${visao === "kanban" ? "bg-[#111827] text-white" : "text-muted-foreground"}`}
            >
              <Columns3 className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => set({ visao: "tabela" })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${visao === "tabela" ? "bg-[#111827] text-white" : "text-muted-foreground"}`}
            >
              <LayoutList className="h-3.5 w-3.5" /> Tabela
            </button>
          </div>
          <Button variant="outline" onClick={sincronizarAgora} disabled={sincronizando}>
            <RefreshCw className={sincronizando ? "animate-spin" : ""} /> Sincronizar agora
          </Button>
        </div>
      </div>

      {ultima && !ultima.ok && (
        <div className="flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>A última coleta da API falhou</b> ({dataHora(ultima.iniciado_em)}): {ultima.erro}
          </span>
        </div>
      )}
      {m.contatoAtrasado > 0 && (
        <button
          type="button"
          onClick={() => set({ atrasados: true, status: undefined })}
          className="flex w-full items-center gap-3 rounded-lg border border-[#FECACA] bg-gradient-to-r from-[#FEF2F2] to-white px-4 py-3 text-left text-sm transition hover:shadow-sm"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FEE2E2] text-[#B91C1C]">
            <AlarmClock className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <b className="text-[#B91C1C]">
              {m.contatoAtrasado} cliente{m.contatoAtrasado === 1 ? "" : "s"} sem 1º contato há mais
              de 48h.
            </b>{" "}
            <span className="text-muted-foreground">Clique para ver.</span>
          </span>
        </button>
      )}

      {/* Dash */}
      <section className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Em aberto"
            value={m.abertos}
            icon={Hourglass}
            color="#0284C7"
            hint="Não iniciados, pendentes e em andamento"
            selected={false}
            onClick={() => set({ status: undefined, atrasados: undefined })}
          />
          <KpiCard
            title="Contato atrasado (48h)"
            value={m.contatoAtrasado}
            icon={AlarmClock}
            color="#EF4444"
            selected={!!busca.atrasados}
            onClick={() => set({ atrasados: busca.atrasados ? undefined : true })}
          />
          <KpiCard
            title="Taxa de retenção"
            value={m.taxaRetencao == null ? "—" : `${Math.round(m.taxaRetencao * 100)}%`}
            icon={ShieldCheck}
            color="#10B981"
            hint="(Revertidos + downgrades) ÷ casos encerrados"
          />
          <KpiCard
            title="1º contato em média"
            value={m.mediaHorasContato == null ? "—" : `${Math.round(m.mediaHorasContato)}h`}
            icon={PhoneCall}
            color="#7C3AED"
            hint={
              m.contatoNoPrazo == null
                ? undefined
                : `${Math.round(m.contatoNoPrazo * 100)}% dentro das 48h`
            }
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="rounded-lg border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="filter-label">Pedidos por semana</div>
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-[#10B981]" />
                  Retidos
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-[#EF4444]" />
                  Cancelados
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-[#CBD5E1]" />
                  Em aberto
                </span>
              </div>
            </div>
            <div className="mt-3 flex h-32 items-stretch gap-2">
              {semanas.map((s) => {
                const max = Math.max(1, ...semanas.map((x) => x.total));
                const abertos = s.total - s.retidos - s.perdidos;
                return (
                  <div
                    key={s.inicio.toISOString()}
                    className="flex h-full flex-1 flex-col items-center gap-1"
                    title={`Semana de ${format(s.inicio, "dd/MM")}: ${s.total} pedidos`}
                  >
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="flex w-full flex-col-reverse overflow-hidden rounded-md bg-[#F1F5F9]"
                        style={{ height: `${Math.max(4, (s.total / max) * 100)}%` }}
                      >
                        <span className="bg-[#10B981]" style={{ flexGrow: s.retidos }} />
                        <span className="bg-[#EF4444]" style={{ flexGrow: s.perdidos }} />
                        <span className="bg-[#CBD5E1]" style={{ flexGrow: abertos }} />
                      </div>
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {format(s.inicio, "dd/MM")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-card">
            <div className="filter-label">Por status</div>
            <div className="mt-3 space-y-1.5">
              {STATUS_RETENCAO.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => set({ status: busca.status === s.id ? undefined : s.id })}
                  className={`flex w-full items-center gap-2 rounded px-1 text-left text-xs hover:bg-[#F8FAFC] ${busca.status === s.id ? "bg-[#F8FAFC] font-semibold" : ""}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.cor }} />
                  <span className="w-24 truncate">{s.rotulo}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${m.total ? (m.porStatus[s.id] / m.total) * 100 : 0}%`,
                        backgroundColor: s.cor,
                      }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums">{m.porStatus[s.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-card">
            <div className="filter-label">Motivos do cancelamento</div>
            <div className="mt-3 space-y-1.5">
              {m.motivos.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem motivos informados.</p>
              )}
              {m.motivos.slice(0, 6).map(([t, n]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set({ motivo: busca.motivo === t ? undefined : t })}
                  className={`flex w-full items-center gap-2 rounded px-1 text-left text-xs hover:bg-[#F8FAFC] ${busca.motivo === t ? "bg-[#F8FAFC] font-semibold" : ""}`}
                  title={t}
                >
                  <span className="w-40 truncate">{t}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                    <span
                      className="block h-full rounded-full bg-[#F59E0B]"
                      style={{ width: `${(n / Math.max(1, m.motivos[0]![1])) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums">{n}</span>
                </button>
              ))}
            </div>
            {m.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                {m.tags.map(([t, n]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set({ tag: busca.tag === t ? undefined : t })}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${busca.tag === t ? "border-transparent bg-[#111827] text-white" : "bg-white hover:border-[#CBD5E1]"}`}
                  >
                    <Tag className="h-3 w-3" />
                    {t} <b className="tabular-nums">{n}</b>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-[#F8FAFC] p-2">
                <div className="text-muted-foreground">Revertidos</div>
                <div className="text-base font-bold text-[#065F46]">{m.porStatus.revertido}</div>
              </div>
              <div className="rounded-md bg-[#F8FAFC] p-2">
                <div className="text-muted-foreground">Downgrades</div>
                <div className="text-base font-bold text-[#5B21B6]">{m.porStatus.downgrade}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-card">
        <div className="w-64">
          <FilterLabel htmlFor="br">Buscar</FilterLabel>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="br"
              className="pl-8"
              placeholder="ID AppCRC, telefone, clínica ou solicitante"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <Filtro
          rotulo="Motivo"
          valor={busca.motivo}
          onChange={(v) => set({ motivo: v })}
          opcoes={todosMotivos.map((t) => ({ v: t, r: t }))}
        />
        <Filtro
          rotulo="Status"
          valor={busca.status}
          onChange={(v) => set({ status: v })}
          opcoes={STATUS_RETENCAO.map((s) => ({ v: s.id, r: s.rotulo }))}
        />
        <Filtro
          rotulo="Tag"
          valor={busca.tag}
          onChange={(v) => set({ tag: v })}
          opcoes={todasTags.map((t) => ({ v: t, r: t }))}
        />
        <Filtro
          rotulo="Responsável"
          valor={busca.resp}
          onChange={(v) => set({ resp: v })}
          opcoes={[
            { v: "sem", r: "Sem responsável" },
            ...pessoas.map((p) => ({ v: p.id, r: p.full_name || p.email || "" })),
          ]}
        />
        <Filtro
          rotulo="Solicitado"
          valor={busca.periodo === "tudo" ? undefined : busca.periodo}
          onChange={(v) => set({ periodo: (v as "30" | "90" | undefined) ?? "tudo" })}
          opcoes={[
            { v: "30", r: "Últimos 30 dias" },
            { v: "90", r: "Últimos 90 dias" },
          ]}
          todos="Todo o período"
        />
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Switch
            checked={!!busca.atrasados}
            onCheckedChange={(v) => set({ atrasados: v || undefined })}
          />{" "}
          Só atrasados
        </label>
        {(busca.status || busca.tag || busca.motivo || busca.resp || busca.atrasados || q) && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => {
              setQ("");
              navigate({ search: { visao, periodo: busca.periodo }, replace: true });
            }}
          >
            <X /> Limpar
          </Button>
        )}
        <span className="ml-auto pb-2 text-xs text-muted-foreground">
          {filtrados.length} caso{filtrados.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : casos.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title="Nenhum pedido de cancelamento ainda"
          description="Os pedidos chegam da API de gestão às 8h e às 14h. Use “Sincronizar agora” para buscar já."
        />
      ) : visao === "kanban" ? (
        <Kanban
          casos={filtrados}
          statusFiltro={busca.status}
          nomePessoa={nomePessoa}
          onAbrir={setAberto}
          onMover={mudarStatus}
          onContato={setContatoDe}
        />
      ) : (
        <Tabela
          casos={filtrados}
          nomePessoa={nomePessoa}
          onAbrir={setAberto}
          onStatus={mudarStatus}
          onContato={setContatoDe}
        />
      )}

      {caso && (
        <PainelCaso
          caso={caso}
          pessoas={pessoas}
          todasTags={todasTags}
          onClose={() => setAberto(null)}
          onContato={() => setContatoDe(caso)}
          onStatus={(s) => mudarStatus(caso, s)}
          recarregar={recarregar}
        />
      )}
      {contatoDe && (
        <ContatoDialog
          caso={contatoDe}
          meId={me?.id ?? null}
          onClose={() => setContatoDe(null)}
          recarregar={recarregar}
        />
      )}
    </div>
  );
}

function Filtro({
  rotulo,
  valor,
  onChange,
  opcoes,
  todos = "Todos",
}: {
  rotulo: string;
  valor: string | undefined;
  onChange: (v: string | undefined) => void;
  opcoes: { v: string; r: string }[];
  todos?: string;
}) {
  return (
    <div className="w-44">
      <FilterLabel>{rotulo}</FilterLabel>
      <Select value={valor ?? TODOS} onValueChange={(v) => onChange(v === TODOS ? undefined : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{todos}</SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o.v} value={o.v}>
              {o.r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BadgeStatus({ status }: { status: string }) {
  const s = statusRetencao(status);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: s.bg, color: s.texto }}
    >
      {s.rotulo}
    </span>
  );
}

function Prazo({ caso, compacto }: { caso: CasoOk; compacto?: boolean }) {
  const k = contagem(caso);
  const cls =
    k.nivel === "atrasado"
      ? "bg-[#FEE2E2] text-[#B91C1C]"
      : k.nivel === "alerta"
        ? "bg-[#FEF3C7] text-[#B45309]"
        : k.nivel === "ok"
          ? "bg-[#E0F2FE] text-[#075985]"
          : "bg-[#F1F5F9] text-[#64748B]";
  const Icone = k.nivel === "atrasado" ? AlarmClock : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-semibold ${compacto ? "text-[10px]" : "text-[11px]"} ${cls}`}
      title={
        k.tipo === "contato"
          ? "1º contato em até 48h da solicitação"
          : k.tipo === "resolucao"
            ? "Resolver em até 5 dias úteis"
            : undefined
      }
    >
      <Icone className="h-3 w-3" />
      {k.texto}
    </span>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-semibold text-[#475569]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function Kanban({
  casos,
  statusFiltro,
  nomePessoa,
  onAbrir,
  onMover,
  onContato,
}: {
  casos: CasoOk[];
  statusFiltro: string | undefined;
  nomePessoa: (id: string | null) => string | null;
  onAbrir: (id: string) => void;
  onMover: (c: CasoOk, s: StatusRetencao) => void;
  onContato: (c: CasoOk) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const colunas = STATUS_RETENCAO.filter((s) => !statusFiltro || s.id === statusFiltro);
  function fim(e: DragEndEvent) {
    const c = casos.find((x) => x.id === e.active.id);
    if (c && e.over) onMover(c, e.over.id as StatusRetencao);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={fim}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((s) => (
          <Coluna key={s.id} status={s.id}>
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#475569]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.cor }} />
                {s.rotulo}
              </span>
              <span className="rounded-full bg-white px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                {casos.filter((c) => c.status === s.id).length}
              </span>
            </div>
            <div className="space-y-2">
              {casos
                .filter((c) => c.status === s.id)
                .map((c) => (
                  <CartaoCaso
                    key={c.id}
                    caso={c}
                    responsavel={nomePessoa(c.responsavel_id)}
                    onAbrir={() => onAbrir(c.id)}
                    onContato={() => onContato(c)}
                  />
                ))}
              {casos.every((c) => c.status !== s.id) && (
                <p className="px-1 py-4 text-center text-xs text-muted-foreground">{s.ajuda}</p>
              )}
            </div>
          </Coluna>
        ))}
      </div>
    </DndContext>
  );
}

function Coluna({ status, children }: { status: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-xl border p-2 transition ${isOver ? "border-primary/40 bg-[#F5F3FF]" : "border-transparent bg-[#EEF1F6]"}`}
    >
      {children}
    </div>
  );
}

function CartaoCaso({
  caso,
  responsavel,
  onAbrir,
  onContato,
}: {
  caso: CasoOk;
  responsavel: string | null;
  onAbrir: () => void;
  onContato: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: caso.id,
  });
  const wa = linkWhatsapp(caso.telefone);
  const k = contagem(caso);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={`cursor-grab rounded-lg border bg-white p-3 shadow-sm transition active:cursor-grabbing ${isDragging ? "z-20 rotate-1 shadow-lg" : "hover:shadow-md"} ${k.nivel === "atrasado" ? "border-l-4 border-l-[#EF4444]" : ""}`}
    >
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold text-[#111827]">
            {caso.id_appcrc ? `AppCRC ${caso.id_appcrc}` : "Sem ID AppCRC"}
          </span>
          {responsavel && (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-primary"
              title={responsavel}
            >
              {responsavel
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
        </div>
        {caso.cliente_nome && (
          <div className="truncate text-xs text-[#334155]">{caso.cliente_nome}</div>
        )}
        {caso.motivo_api && (
          <div
            className="mt-1 truncate text-[11px] font-medium text-[#B45309]"
            title={caso.motivo_api}
          >
            {caso.motivo_api}
          </div>
        )}
        <div className="mt-1 text-[11px] text-muted-foreground">
          Solicitado {dataHora(caso.data_solicitacao)}
        </div>
        {servicosDe(caso).length > 0 && (
          <div
            className="mt-1 truncate text-[10px] text-muted-foreground"
            title={servicosDe(caso)
              .map((x) => x.nome)
              .join(", ")}
          >
            {servicosDe(caso)
              .map((x) => x.nome)
              .join(" · ")}
          </div>
        )}
        <div className="mt-2">
          <Prazo caso={caso} compacto />
        </div>
        {caso.tags.length > 0 && (
          <div className="mt-2">
            <Tags tags={caso.tags} />
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center gap-1 border-t pt-2">
        {caso.telefone && (
          <span className="flex-1 truncate text-[11px] tabular-nums text-muted-foreground">
            <Phone className="mr-1 inline h-3 w-3" />
            {caso.telefone}
          </span>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-[#16A34A] hover:bg-[#DCFCE7]"
            title="Abrir WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={onContato}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-primary hover:bg-accent"
        >
          Registrar contato
        </button>
      </div>
    </div>
  );
}

function Tabela({
  casos,
  nomePessoa,
  onAbrir,
  onStatus,
  onContato,
}: {
  casos: CasoOk[];
  nomePessoa: (id: string | null) => string | null;
  onAbrir: (id: string) => void;
  onStatus: (c: CasoOk, s: StatusRetencao) => void;
  onContato: (c: CasoOk) => void;
}) {
  if (!casos.length)
    return (
      <EmptyState
        icon={Search}
        title="Nenhum caso com esses filtros"
        description="Ajuste ou limpe os filtros."
      />
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-[#F8FAFC]">
          <tr>
            {[
              "ID AppCRC",
              "Telefone",
              "Solicitado em",
              "Motivo",
              "Status",
              "Prazo",
              "1º contato",
              "Tags",
              "Responsável",
            ].map((h) => (
              <th key={h} className="filter-label whitespace-nowrap px-3 py-2.5 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {casos.map((c) => {
            const wa = linkWhatsapp(c.telefone);
            return (
              <tr
                key={c.id}
                className={`border-b last:border-0 hover:bg-[#FAFAFC] ${contagem(c).nivel === "atrasado" ? "bg-[#FFF7F7]" : ""}`}
              >
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onAbrir(c.id)}
                    className="text-left font-semibold text-[#111827] hover:text-primary hover:underline"
                  >
                    {c.id_appcrc ?? "—"}
                  </button>
                  {c.cliente_nome && (
                    <div className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                      {c.cliente_nome}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                  {c.telefone ?? "—"}
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1.5 inline-flex rounded p-0.5 align-middle text-[#16A34A] hover:bg-[#DCFCE7]"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                  {dataHora(c.data_solicitacao)}
                </td>
                <td className="max-w-[200px] px-3 py-2.5">
                  <div className="truncate text-xs" title={c.motivo_api ?? ""}>
                    {c.motivo_api ?? "—"}
                  </div>
                  {servicosDe(c).length > 0 && (
                    <div className="truncate text-[10px] text-muted-foreground">
                      {servicosDe(c)
                        .map((x) => x.nome)
                        .join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Select value={c.status} onValueChange={(v) => onStatus(c, v as StatusRetencao)}>
                    <SelectTrigger className="h-8 w-36 border-transparent bg-transparent px-1 hover:border-border">
                      <BadgeStatus status={c.status} />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_RETENCAO.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2.5">
                  <Prazo caso={c} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {c.contato_feito_em ? (
                    <span
                      className="text-xs text-muted-foreground"
                      title={
                        c.primeiro_contato_em ? "Registrado na Central" : "1ª anotação na gestão"
                      }
                    >
                      <b className="text-[#065F46]">✓</b> {dataHora(c.contato_feito_em)}
                    </span>
                  ) : c.status === "pendente" ? (
                    <span className="text-xs text-muted-foreground">Aguarda formulário</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => onContato(c)}
                    >
                      <PhoneCall className="h-3 w-3" /> Entrei em contato
                    </Button>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Tags tags={c.tags} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                  {nomePessoa(c.responsavel_id) ?? <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Registro rápido: canal + como foi + nota. O resultado pode mudar o status. */
function ContatoDialog({
  caso,
  meId,
  onClose,
  recarregar,
}: {
  caso: CasoOk;
  meId: string | null;
  onClose: () => void;
  recarregar: () => Promise<unknown>;
}) {
  const [canal, setCanal] = useState<string>("whatsapp");
  const [resultado, setResultado] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const r = RESULTADOS.find((x) => x.id === resultado);
  async function salvar() {
    if (!resultado || !meId) return;
    setSalvando(true);
    const { error } = await supabase.from("retencao_atividades").insert({
      caso_id: caso.id,
      tipo: "contato",
      canal,
      resultado,
      texto: nota.trim() || null,
      user_id: meId,
    });
    if (error) {
      toast.error(error.message);
      setSalvando(false);
      return;
    }
    const patch: Database["public"]["Tables"]["retencao_casos"]["Update"] = {};
    if (r?.status && r.status !== caso.status) patch.status = r.status;
    if (!caso.responsavel_id) patch.responsavel_id = meId;
    if (Object.keys(patch).length) {
      const { error: e2 } = await supabase.from("retencao_casos").update(patch).eq("id", caso.id);
      if (e2) toast.error(e2.message);
    }
    await recarregar();
    setSalvando(false);
    toast.success(
      r?.status && r.status !== caso.status
        ? `Contato registrado · ${statusRetencao(r.status).rotulo}`
        : "Contato registrado.",
    );
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
          <DialogDescription>
            {caso.id_appcrc ? `AppCRC ${caso.id_appcrc}` : caso.cliente_nome} ·{" "}
            {caso.telefone ?? "sem telefone"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <FilterLabel>Canal</FilterLabel>
            <div className="flex flex-wrap gap-1.5">
              {CANAIS.map((c) => (
                <Button
                  key={c.id}
                  size="sm"
                  variant={canal === c.id ? "dark" : "outline"}
                  onClick={() => setCanal(c.id)}
                >
                  {c.rotulo}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <FilterLabel>Como foi?</FilterLabel>
            <div className="grid gap-1.5">
              {RESULTADOS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setResultado(x.id)}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${resultado === x.id ? "border-primary bg-accent font-semibold" : "hover:bg-[#F8FAFC]"}`}
                >
                  {x.rotulo}
                  {x.status && <BadgeStatus status={x.status} />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FilterLabel htmlFor="nota">Observação (opcional)</FilterLabel>
            <Textarea
              id="nota"
              rows={2}
              maxLength={2000}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ex.: pediu desconto, retornar na quinta"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!resultado || salvando}>
            Salvar contato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PainelCaso({
  caso,
  pessoas,
  todasTags,
  onClose,
  onContato,
  onStatus,
  recarregar,
}: {
  caso: CasoOk;
  pessoas: { id: string; full_name: string | null; email: string | null }[];
  todasTags: string[];
  onClose: () => void;
  onContato: () => void;
  onStatus: (s: StatusRetencao) => void;
  recarregar: () => Promise<unknown>;
}) {
  const [obs, setObs] = useState(caso.observacao ?? "");
  const [novaTag, setNovaTag] = useState("");
  const { data: atividades = [] } = useQuery({
    queryKey: ["retencao-atividades", caso.id, caso.updated_at, caso.primeiro_contato_em],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retencao_atividades")
        .select("*")
        .eq("caso_id", caso.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const nome = (id: string | null) => {
    const p = pessoas.find((x) => x.id === id);
    return p ? p.full_name || p.email : "Sistema";
  };
  async function salvar(
    patch: Database["public"]["Tables"]["retencao_casos"]["Update"],
    ok?: string,
  ) {
    const { error } = await supabase.from("retencao_casos").update(patch).eq("id", caso.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await recarregar();
    if (ok) toast.success(ok);
  }
  const addTag = (t: string) => {
    const v = t.trim();
    if (!v || caso.tags.includes(v)) return;
    void salvar({ tags: [...caso.tags, v] });
    setNovaTag("");
  };
  const wa = linkWhatsapp(caso.telefone);
  const servicos = servicosDe(caso);
  const notasGestao = (Array.isArray(caso.anotacoes) ? caso.anotacoes : []) as {
    nome: string | null;
    data: string | null;
    texto: string;
  }[];
  type Item = { chave: string; quando: string; no: React.ReactNode };
  const historico: Item[] = [
    ...notasGestao.map((n, i) => ({
      chave: `g${i}`,
      quando: n.data ?? "",
      no: (
        <li key={`g${i}`} className="flex gap-2.5 text-sm">
          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#B45309]">
            <MessageCircle className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <div className="whitespace-pre-line break-words">{n.texto}</div>
            <div className="text-[11px] text-muted-foreground">
              Anotação na gestão · {n.nome ?? "—"} · {dataHora(n.data)}
            </div>
          </div>
        </li>
      ),
    })),
  ];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2">
            {caso.id_appcrc ? `AppCRC ${caso.id_appcrc}` : "Sem ID AppCRC"}{" "}
            <BadgeStatus status={caso.status} />
          </SheetTitle>
          <SheetDescription>
            {caso.cliente_nome ?? "Cliente"} · solicitado em {dataHora(caso.data_solicitacao)}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Prazo caso={caso} />
            {caso.prazo_resolucao && caso.status === "em_andamento" && (
              <span className="text-xs text-muted-foreground">
                até {dataBR(caso.prazo_resolucao)}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info rotulo="Telefone">
              {caso.telefone ?? "—"}
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 text-xs font-semibold text-[#16A34A] hover:underline"
                >
                  WhatsApp
                </a>
              )}
            </Info>
            <Info rotulo="Solicitante">{caso.solicitante ?? "—"}</Info>
            <Info rotulo="Formulário">
              {caso.data_preenchimento
                ? `Preenchido em ${dataHora(caso.data_preenchimento)}`
                : "Não preenchido"}
            </Info>
            <Info rotulo="1º contato">
              {caso.contato_feito_em ? (
                <>
                  {dataHora(caso.contato_feito_em)}
                  <span className="block text-[11px] text-muted-foreground">
                    {caso.primeiro_contato_em ? "registrado na Central" : "1ª anotação na gestão"}
                  </span>
                </>
              ) : caso.status === "pendente" ? (
                "Aguardando formulário"
              ) : (
                <span className="text-[#B91C1C]">Ainda não</span>
              )}
            </Info>
            {caso.criado_por_nome && <Info rotulo="Aberto por">{caso.criado_por_nome}</Info>}
            {caso.finalizado_por_nome && (
              <Info rotulo="Finalizado por">
                {caso.finalizado_por_nome} · {dataHora(caso.data_finalizacao)}
              </Info>
            )}
            {caso.motivo_api && (
              <div className="col-span-2">
                <Info rotulo="Motivo">{caso.motivo_api}</Info>
                {caso.motivo_detalhe && (
                  <p className="mt-1 whitespace-pre-line rounded-md bg-[#F8FAFC] p-2 text-xs text-[#334155]">
                    {caso.motivo_detalhe}
                  </p>
                )}
              </div>
            )}
            {servicos.length > 0 && (
              <div className="col-span-2">
                <Info rotulo="Serviços no pedido">
                  <div className="mt-1 flex flex-wrap gap-1">
                    {servicos.map((x) => (
                      <span
                        key={x.nome}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${x.cancelado ? "bg-[#FEE2E2] text-[#B91C1C] line-through" : "bg-[#F1F5F9] text-[#475569]"}`}
                        title={x.cancelado ? "Cancelado" : "Mantido / em análise"}
                      >
                        {x.nome}
                      </span>
                    ))}
                  </div>
                </Info>
                {caso.servicos_restantes && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ficou com: <b className="text-foreground">{caso.servicos_restantes}</b>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onContato}>
              <PhoneCall /> Registrar contato
            </Button>
            {caso.link && (
              <Button variant="outline" asChild>
                <a href={caso.link} target="_blank" rel="noreferrer">
                  Abrir na gestão
                </a>
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FilterLabel>Status</FilterLabel>
              <Select value={caso.status} onValueChange={(v) => onStatus(v as StatusRetencao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_RETENCAO.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Responsável</FilterLabel>
              <Select
                value={caso.responsavel_id ?? "__sem__"}
                onValueChange={(v) =>
                  salvar({ responsavel_id: v === "__sem__" ? null : v }, "Responsável salvo.")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__sem__">Sem responsável</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <FilterLabel>Tags</FilterLabel>
            <div className="flex flex-wrap gap-1.5">
              {caso.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-[#111827] px-2 py-0.5 text-xs font-semibold text-white"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remover ${t}`}
                    onClick={() => salvar({ tags: caso.tags.filter((x) => x !== t) })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {todasTags
                .filter((t) => !caso.tags.includes(t))
                .slice(0, 10)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addTag(t)}
                    className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:border-solid hover:text-foreground"
                  >
                    + {t}
                  </button>
                ))}
            </div>
            <Input
              className="mt-2 h-8"
              placeholder="Nova tag e Enter"
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(novaTag);
                }
              }}
              maxLength={40}
            />
          </div>
          <div>
            <FilterLabel htmlFor="obs">Observação</FilterLabel>
            <Textarea
              id="obs"
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              onBlur={() => {
                if (obs !== (caso.observacao ?? ""))
                  void salvar({ observacao: obs.trim() || null }, "Observação salva.");
              }}
            />
          </div>
          <div>
            <FilterLabel>Histórico</FilterLabel>
            <ul className="space-y-2.5">
              {atividades.length + notasGestao.length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhum contato registrado ainda.</li>
              )}
              {[
                ...historico,
                ...atividades.map((a) => ({
                  chave: a.id,
                  quando: a.created_at,
                  no: (
                    <li key={a.id} className="flex gap-2.5 text-sm">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[#64748B]">
                        {a.tipo === "contato" ? (
                          <PhoneCall className="h-3 w-3" />
                        ) : a.tipo === "status" ? (
                          <RefreshCw className="h-3 w-3" />
                        ) : (
                          <UserRound className="h-3 w-3" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div>
                          {a.tipo === "contato" && (
                            <>
                              <b>Contato</b> por{" "}
                              {CANAIS.find((c) => c.id === a.canal)?.rotulo ?? a.canal}:{" "}
                              {resultadoRotulo(a.resultado)}
                            </>
                          )}
                          {a.tipo === "status" && (
                            <>
                              {statusRetencao(a.de ?? "").rotulo} →{" "}
                              <b>{statusRetencao(a.para ?? "").rotulo}</b>
                            </>
                          )}
                          {a.tipo === "nota" && a.texto}
                        </div>
                        {a.tipo === "contato" && a.texto && (
                          <div className="text-xs text-[#475569]">“{a.texto}”</div>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          {a.user_id ? nome(a.user_id) : "Coleta da API"} · {dataHora(a.created_at)}
                        </div>
                      </div>
                    </li>
                  ),
                })),
              ]
                .sort((x, y) => y.quando.localeCompare(x.quando))
                .map((x) => x.no)}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="filter-label">{rotulo}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
