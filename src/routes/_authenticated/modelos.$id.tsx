import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CopyPlus,
  GripVertical,
  ListChecks,
  Lock,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useMe, useProdutos } from "@/lib/session";
import { statusModelo, ordemDasEtapas, type ItemOrdem } from "@/lib/modelos";
import { Card, ColorBadge, FilterLabel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/modelos/$id")({
  head: () => ({ meta: [{ title: "Modelo de onboarding — ICOM" }] }),
  component: EditorModelo,
});

type Etapa = Database["public"]["Tables"]["modelo_etapas"]["Row"];
type Fase = Database["public"]["Tables"]["modelo_fases"]["Row"];
type ItemChecklist = Database["public"]["Tables"]["modelo_checklist"]["Row"];

const SEM_PAPEL = "__nenhum__";

function useModelo(id: string) {
  return useQuery({
    queryKey: ["modelo", id],
    queryFn: async () => {
      const { data: modelo, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!modelo) return null;
      const [f, e, p, irmaos] = await Promise.all([
        supabase.from("modelo_fases").select("*").eq("modelo_id", id).order("ordem"),
        supabase.from("modelo_etapas").select("*").eq("modelo_id", id).order("ordem"),
        supabase.from("papeis").select("*").order("nome"),
        supabase
          .from("modelos")
          .select("id, versao, status")
          .eq("produto_id", modelo.produto_id)
          .order("versao", { ascending: false }),
      ]);
      const etapaIds = (e.data ?? []).map((x) => x.id);
      const c = etapaIds.length
        ? await supabase
            .from("modelo_checklist")
            .select("*")
            .in("etapa_id", etapaIds)
            .order("ordem")
        : { data: [] as ItemChecklist[] };
      return {
        modelo,
        fases: f.data ?? [],
        etapas: e.data ?? [],
        papeis: p.data ?? [],
        checklist: c.data ?? [],
        versoes: irmaos.data ?? [],
      };
    },
  });
}

/** Erro do Postgres/PostgREST → mensagem em português (os triggers já falam pt-BR). */
function erro(e: { message: string } | null | undefined, padrao = "Não foi possível salvar.") {
  if (e) toast.error(e.message || padrao);
  return !!e;
}

function EditorModelo() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const { data: produtos = [] } = useProdutos();
  const { data, isLoading } = useModelo(id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [etapaAberta, setEtapaAberta] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | "publicar" | "excluir">(null);
  const [itens, setItens] = useState<ItemOrdem[]>([]);

  const modelo = data?.modelo;
  const fases = data?.fases ?? [];
  const etapas = data?.etapas ?? [];
  const produto = produtos.find((p) => p.id === modelo?.produto_id);
  const podeGerir =
    !!me &&
    !!modelo &&
    (me.isAdmin || (me.isGestor && me.produtosGeridos.includes(modelo.produto_id)));
  const editavel = podeGerir && modelo?.status === "rascunho";
  const rascunhoExistente = data?.versoes.find((v) => v.status === "rascunho" && v.id !== id);

  // Lista plana para o arrastar-e-soltar: cabeçalho da fase seguido das etapas dela.
  useEffect(() => {
    if (!data) return;
    const out: ItemOrdem[] = [];
    for (const f of data.fases) {
      out.push({ tipo: "fase", id: f.id });
      for (const e of data.etapas.filter((x) => x.fase_id === f.id))
        out.push({ tipo: "etapa", id: e.id });
    }
    for (const e of data.etapas.filter(
      (x) => !x.fase_id || !data.fases.some((f) => f.id === x.fase_id),
    ))
      out.push({ tipo: "etapa", id: e.id });
    setItens(out);
  }, [data]);

  const recarregar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["modelo", id] }),
      qc.invalidateQueries({ queryKey: ["modelos-resumo"] }),
    ]);

  async function salvarOrdem(novos: ItemOrdem[]) {
    setItens(novos);
    const { error } = await supabase.rpc("ordenar_etapas_modelo", {
      _modelo_id: id,
      _etapas: ordemDasEtapas(novos),
    });
    erro(error);
    await recarregar();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const de = itens.findIndex((i) => i.id === active.id);
    let para = itens.findIndex((i) => i.id === over.id);
    if (de < 0 || para < 0) return;
    // Soltar sobre o primeiro cabeçalho: a etapa vai para o início da primeira fase.
    if (para === 0 && itens[0]?.tipo === "fase") para = 1;
    void salvarOrdem(arrayMove(itens, de, para));
  }

  async function atualizarModelo(
    patch: Partial<Database["public"]["Tables"]["modelos"]["Update"]>,
  ) {
    const { error } = await supabase.from("modelos").update(patch).eq("id", id);
    erro(error);
    await recarregar();
  }

  async function adicionarEtapa(faseId: string) {
    const ordem = etapas.length + 1;
    const { data: nova, error } = await supabase
      .from("modelo_etapas")
      .insert({ modelo_id: id, fase_id: faseId, nome: "Nova etapa", sla_dias: 1, ordem })
      .select("id")
      .single();
    if (erro(error) || !nova) return;
    // Coloca a etapa no fim da fase escolhida.
    const idx = itens.findIndex((i) => i.tipo === "fase" && i.id === faseId);
    let fim = idx + 1;
    while (fim < itens.length && itens[fim]!.tipo === "etapa") fim++;
    const novos = [
      ...itens.slice(0, fim),
      { tipo: "etapa" as const, id: nova.id },
      ...itens.slice(fim),
    ];
    await salvarOrdem(novos);
    setEtapaAberta(nova.id);
  }

  async function adicionarFase() {
    const ordem = Math.max(0, ...fases.map((f) => f.ordem)) + 1;
    const { error } = await supabase
      .from("modelo_fases")
      .insert({ modelo_id: id, nome: "Nova fase", ordem, cor: "#64748B" });
    erro(error);
    await recarregar();
  }

  async function moverFase(f: Fase, dir: -1 | 1) {
    const i = fases.findIndex((x) => x.id === f.id);
    const outra = fases[i + dir];
    if (!outra) return;
    const r = await Promise.all([
      supabase.from("modelo_fases").update({ ordem: outra.ordem }).eq("id", f.id),
      supabase.from("modelo_fases").update({ ordem: f.ordem }).eq("id", outra.id),
    ]);
    if (r.some((x) => erro(x.error))) return;
    // Renumera as etapas na nova ordem das fases.
    const blocos = new Map<string, ItemOrdem[]>();
    let atual = "";
    for (const it of itens) {
      if (it.tipo === "fase") atual = it.id;
      blocos.set(atual, [...(blocos.get(atual) ?? []), it]);
    }
    const novaOrdem = [...fases];
    [novaOrdem[i], novaOrdem[i + dir]] = [novaOrdem[i + dir]!, novaOrdem[i]!];
    await salvarOrdem(novaOrdem.flatMap((x) => blocos.get(x.id) ?? []));
  }

  async function excluirFase(f: Fase) {
    if (etapas.some((e) => e.fase_id === f.id)) {
      toast.error("Mova ou exclua as etapas desta fase antes de excluí-la.");
      return;
    }
    if (fases.length === 1) {
      toast.error("O modelo precisa de ao menos uma fase.");
      return;
    }
    const { error } = await supabase.from("modelo_fases").delete().eq("id", f.id);
    erro(error);
    await recarregar();
  }

  async function publicar() {
    const { error } = await supabase.rpc("publicar_modelo", { _modelo_id: id });
    if (erro(error)) return;
    toast.success("Modelo publicado. Os próximos onboardings deste produto usam esta versão.");
    await Promise.all([recarregar(), qc.invalidateQueries({ queryKey: ["modelo"] })]);
  }

  async function novaVersao() {
    const { data: novo, error } = await supabase.rpc("duplicar_modelo", { _modelo_id: id });
    if (erro(error) || !novo) return;
    await recarregar();
    toast.success("Nova versão criada em rascunho.");
    navigate({ to: "/modelos/$id", params: { id: novo } });
  }

  async function excluirRascunho() {
    const { error } = await supabase.from("modelos").delete().eq("id", id);
    if (erro(error)) return;
    await recarregar();
    toast.success("Rascunho excluído.");
    navigate({ to: "/modelos" });
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!modelo) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Modelo não encontrado.</p>
        <Button variant="outline" asChild>
          <Link to="/modelos">
            <ArrowLeft /> Voltar aos modelos
          </Link>
        </Button>
      </div>
    );
  }

  const st = statusModelo(modelo.status);
  const slaTotal = etapas.reduce((s, e) => s + e.sla_dias, 0);
  const slaPrincipal = etapas.filter((e) => e.principal).reduce((s, e) => s + e.sla_dias, 0);
  const etapa = etapas.find((e) => e.id === etapaAberta) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/modelos"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Modelos
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {produto && <ColorBadge color={produto.cor}>{produto.nome}</ColorBadge>}
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${st.cls}`}>
                {st.label}
              </span>
              <span className="text-xs text-muted-foreground">Versão {modelo.versao}</span>
            </div>
            {editavel ? (
              <Input
                key={modelo.nome}
                defaultValue={modelo.nome}
                aria-label="Nome do modelo"
                className="mt-2 h-auto max-w-xl border-transparent bg-transparent px-1 text-2xl font-semibold md:text-2xl shadow-none hover:border-border focus-visible:bg-card"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== modelo.nome) void atualizarModelo({ nome: v });
                }}
              />
            ) : (
              <h1 className="mt-2 text-2xl font-semibold">{modelo.nome}</h1>
            )}
          </div>
          {podeGerir && (
            <div className="flex items-center gap-2">
              {modelo.status === "rascunho" ? (
                <>
                  <Button
                    variant="ghost"
                    className="text-[#B91C1C] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                    onClick={() => setConfirmar("excluir")}
                  >
                    <Trash2 /> Excluir rascunho
                  </Button>
                  <Button onClick={() => setConfirmar("publicar")}>
                    <Rocket /> Publicar
                  </Button>
                </>
              ) : rascunhoExistente ? (
                <Button variant="dark" asChild>
                  <Link to="/modelos/$id" params={{ id: rascunhoExistente.id }}>
                    Abrir rascunho (v{rascunhoExistente.versao})
                  </Link>
                </Button>
              ) : (
                <Button variant="dark" onClick={novaVersao}>
                  <CopyPlus /> Criar nova versão
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {modelo.status !== "rascunho" && (
        <div className="flex items-center gap-2 rounded-lg border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3 text-sm text-[#075985]">
          <Lock className="h-4 w-4 shrink-0" />
          {modelo.status === "publicado"
            ? "Este modelo está publicado e não pode ser alterado: os onboardings em andamento seguem a versão em que começaram. Para mudar, crie uma nova versão, edite e publique."
            : "Versão arquivada, mantida como histórico."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Fases e etapas</h2>
            {editavel && (
              <span className="text-xs text-muted-foreground">
                Arraste as etapas para reordenar ou trocar de fase
              </span>
            )}
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={itens.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {itens.map((it) => {
                  if (it.tipo === "fase") {
                    const f = fases.find((x) => x.id === it.id);
                    if (!f) return null;
                    const fi = fases.findIndex((x) => x.id === f.id);
                    return (
                      <CabecalhoFase
                        key={f.id}
                        fase={f}
                        editavel={editavel}
                        primeira={fi === 0}
                        ultima={fi === fases.length - 1}
                        onRenomear={async (nome, cor) => {
                          const { error } = await supabase
                            .from("modelo_fases")
                            .update({ nome, cor })
                            .eq("id", f.id);
                          erro(error);
                          await recarregar();
                        }}
                        onMover={(d) => moverFase(f, d)}
                        onExcluir={() => excluirFase(f)}
                        onAdicionarEtapa={() => adicionarEtapa(f.id)}
                      />
                    );
                  }
                  const e = etapas.find((x) => x.id === it.id);
                  if (!e) return null;
                  return (
                    <LinhaEtapa
                      key={e.id}
                      etapa={e}
                      editavel={editavel}
                      papel={data?.papeis.find((p) => p.id === e.papel_id)}
                      itensChecklist={
                        data?.checklist.filter((c) => c.etapa_id === e.id).length ?? 0
                      }
                      onAbrir={() => setEtapaAberta(e.id)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {editavel && (
            <Button variant="outline" size="sm" className="mt-4" onClick={adicionarFase}>
              <Plus /> Adicionar fase
            </Button>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <h2 className="text-base font-semibold">Configurações</h2>
            <div>
              <FilterLabel>Contagem de prazo</FilterLabel>
              <Select
                value={modelo.calendario}
                disabled={!editavel}
                onValueChange={(v) => atualizarModelo({ calendario: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uteis">Dias úteis (pula fins de semana e feriados)</SelectItem>
                  <SelectItem value="corridos">Dias corridos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel htmlFor="limiar">Em risco a partir de</FilterLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="limiar"
                  key={modelo.limiar_risco_pct}
                  type="number"
                  min={1}
                  max={100}
                  disabled={!editavel}
                  defaultValue={modelo.limiar_risco_pct}
                  className="w-24"
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (v >= 1 && v <= 100 && v !== modelo.limiar_risco_pct)
                      void atualizarModelo({ limiar_risco_pct: v });
                  }}
                />
                <span className="text-sm text-muted-foreground">% do SLA da etapa</span>
              </div>
            </div>
          </Card>
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="text-base font-semibold">Resumo</h2>
            <Resumo rotulo="Fases" valor={fases.length} />
            <Resumo rotulo="Etapas" valor={etapas.length} />
            <Resumo rotulo="SLA total" valor={`${slaTotal} dias`} />
            <Resumo rotulo="SLA do caminho principal" valor={`${slaPrincipal} dias`} />
            <Resumo rotulo="Itens de checklist" valor={data?.checklist.length ?? 0} />
          </Card>
          {(data?.versoes.length ?? 0) > 1 && (
            <Card className="space-y-1.5 p-5 text-sm">
              <h2 className="mb-1 text-base font-semibold">Versões</h2>
              {data!.versoes.map((v) => {
                const s = statusModelo(v.status);
                return (
                  <Link
                    key={v.id}
                    to="/modelos/$id"
                    params={{ id: v.id }}
                    className={`flex items-center justify-between rounded-md px-2 py-1 hover:bg-[#F8FAFC] ${v.id === id ? "bg-accent font-semibold" : ""}`}
                  >
                    <span>Versão {v.versao}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
                      {s.label}
                    </span>
                  </Link>
                );
              })}
            </Card>
          )}
        </div>
      </div>

      {etapa && data && (
        <EditorEtapa
          key={etapa.id}
          etapa={etapa}
          fases={fases}
          papeis={data.papeis}
          editavel={editavel}
          checklist={data.checklist.filter((c) => c.etapa_id === etapa.id)}
          onFechar={() => setEtapaAberta(null)}
          recarregar={recarregar}
          onMudarFase={async (faseId) => {
            const semEla = itens.filter((i) => i.id !== etapa.id);
            const idx = semEla.findIndex((i) => i.tipo === "fase" && i.id === faseId);
            let fim = idx + 1;
            while (fim < semEla.length && semEla[fim]!.tipo === "etapa") fim++;
            await salvarOrdem([
              ...semEla.slice(0, fim),
              { tipo: "etapa", id: etapa.id },
              ...semEla.slice(fim),
            ]);
          }}
          onExcluir={async () => {
            const { error } = await supabase.from("modelo_etapas").delete().eq("id", etapa.id);
            if (erro(error)) return;
            setEtapaAberta(null);
            await salvarOrdem(itens.filter((i) => i.id !== etapa.id));
          }}
        />
      )}

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "publicar" ? "Publicar este modelo?" : "Excluir este rascunho?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "publicar"
                ? `Os próximos clientes liberados com ${produto?.nome ?? "este produto"} vão seguir esta versão. ${data?.versoes.some((v) => v.status === "publicado") ? "A versão publicada hoje será arquivada; " : ""}os onboardings em andamento não mudam. Depois de publicado, o modelo não pode mais ser editado.`
                : "As fases, etapas e checklists deste rascunho serão apagados. Os modelos publicados não são afetados."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void (confirmar === "publicar" ? publicar() : excluirRascunho())}
              className={confirmar === "excluir" ? "bg-[#DC2626] hover:bg-[#B91C1C]" : undefined}
            >
              {confirmar === "publicar" ? "Publicar" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="font-medium tabular-nums">{valor}</span>
    </div>
  );
}

function CabecalhoFase({
  fase,
  editavel,
  primeira,
  ultima,
  onRenomear,
  onMover,
  onExcluir,
  onAdicionarEtapa,
}: {
  fase: Fase;
  editavel: boolean;
  primeira: boolean;
  ultima: boolean;
  onRenomear: (nome: string, cor: string) => void;
  onMover: (d: -1 | 1) => void;
  onExcluir: () => void;
  onAdicionarEtapa: () => void;
}) {
  const { setNodeRef } = useSortable({ id: fase.id, disabled: true });
  return (
    <div ref={setNodeRef} className="group/fase flex items-center gap-2 pb-1 pt-4 first:pt-0">
      {editavel ? (
        <>
          <input
            type="color"
            value={fase.cor}
            aria-label="Cor da fase"
            onChange={(e) => onRenomear(fase.nome, e.target.value)}
            className="h-4 w-4 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0"
          />
          <Input
            key={fase.nome}
            defaultValue={fase.nome}
            aria-label="Nome da fase"
            className="h-7 w-56 border-transparent bg-transparent px-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[#64748B] shadow-none hover:border-border"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== fase.nome) onRenomear(v, fase.cor);
            }}
          />
          <div className="ml-auto flex items-center gap-0.5 opacity-60 transition group-hover/fase:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onAdicionarEtapa}
            >
              <Plus className="h-3.5 w-3.5" /> Etapa
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={primeira}
              onClick={() => onMover(-1)}
              aria-label="Subir fase"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={ultima}
              onClick={() => onMover(1)}
              aria-label="Descer fase"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:text-[#B91C1C]"
              onClick={onExcluir}
              aria-label="Excluir fase"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <div className="filter-label flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: fase.cor }} />
          {fase.nome}
        </div>
      )}
    </div>
  );
}

function LinhaEtapa({
  etapa,
  editavel,
  papel,
  itensChecklist,
  onAbrir,
}: {
  etapa: Etapa;
  editavel: boolean;
  papel: { nome: string; cor: string } | undefined;
  itensChecklist: number;
  onAbrir: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: etapa.id,
    disabled: !editavel,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border border-transparent bg-[#F8FAFC] px-2 py-1.5 text-sm transition hover:border-border ${isDragging ? "relative z-10 shadow-lg" : ""}`}
    >
      {editavel && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Arrastar etapa"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onAbrir}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {etapa.ordem}.
        </span>
        <span className={`truncate ${etapa.principal ? "font-medium" : "text-muted-foreground"}`}>
          {etapa.nome}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {papel && <ColorBadge color={papel.cor}>{papel.nome}</ColorBadge>}
          {!etapa.obrigatoria && (
            <span className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[11px] font-bold text-[#64748B]">
              Opcional
            </span>
          )}
          {itensChecklist > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <ListChecks className="h-3 w-3" />
              {itensChecklist}
            </span>
          )}
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {etapa.sla_dias}d
          </span>
        </span>
      </button>
    </div>
  );
}

function EditorEtapa({
  etapa,
  fases,
  papeis,
  checklist,
  editavel,
  onFechar,
  recarregar,
  onMudarFase,
  onExcluir,
}: {
  etapa: Etapa;
  fases: Fase[];
  papeis: { id: string; nome: string; cor: string }[];
  checklist: ItemChecklist[];
  editavel: boolean;
  onFechar: () => void;
  recarregar: () => Promise<unknown>;
  onMudarFase: (faseId: string) => Promise<void>;
  onExcluir: () => Promise<void>;
}) {
  const [f, setF] = useState({
    nome: etapa.nome,
    descricao: etapa.descricao ?? "",
    sla_dias: etapa.sla_dias,
    papel_id: etapa.papel_id,
    principal: etapa.principal,
    obrigatoria: etapa.obrigatoria,
    pausa_sla_aguardando_cliente: etapa.pausa_sla_aguardando_cliente,
    exige_checklist: etapa.exige_checklist,
  });
  const [novoItem, setNovoItem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const mudou = useMemo(
    () =>
      (Object.keys(f) as (keyof typeof f)[]).some(
        (k) => (k === "descricao" ? (etapa.descricao ?? "") : etapa[k]) !== f[k],
      ),
    [f, etapa],
  );

  async function salvar() {
    if (!f.nome.trim()) {
      toast.error("Informe o nome da etapa.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("modelo_etapas")
      .update({
        ...f,
        nome: f.nome.trim(),
        descricao: f.descricao.trim() || null,
        sla_dias: Math.max(0, Math.round(f.sla_dias)),
      })
      .eq("id", etapa.id);
    setSalvando(false);
    if (erro(error)) return;
    await recarregar();
    toast.success("Etapa salva.");
    onFechar();
  }

  async function adicionarItem() {
    const texto = novoItem.trim();
    if (!texto) return;
    const { error } = await supabase
      .from("modelo_checklist")
      .insert({ etapa_id: etapa.id, texto, ordem: checklist.length + 1 });
    if (erro(error)) return;
    setNovoItem("");
    await recarregar();
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <Sheet open onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle>{editavel ? "Editar etapa" : etapa.nome}</SheetTitle>
          <SheetDescription>
            Etapa {etapa.ordem} do modelo. Cada onboarding copia esta configuração quando começa.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <FilterLabel htmlFor="en">Nome</FilterLabel>
            <Input
              id="en"
              value={f.nome}
              disabled={!editavel}
              onChange={(e) => set("nome", e.target.value)}
            />
          </div>
          <div>
            <FilterLabel htmlFor="ed">Descrição / instruções</FilterLabel>
            <Textarea
              id="ed"
              rows={3}
              value={f.descricao}
              disabled={!editavel}
              placeholder="O que precisa ser feito nesta etapa"
              onChange={(e) => set("descricao", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FilterLabel>Fase</FilterLabel>
              <Select
                value={etapa.fase_id ?? ""}
                disabled={!editavel}
                onValueChange={(v) => void onMudarFase(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem fase" />
                </SelectTrigger>
                <SelectContent>
                  {fases.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel htmlFor="es">SLA (dias)</FilterLabel>
              <Input
                id="es"
                type="number"
                min={0}
                value={f.sla_dias}
                disabled={!editavel}
                onChange={(e) => set("sla_dias", Number(e.target.value))}
              />
            </div>
          </div>
          <div>
            <FilterLabel>Papel responsável</FilterLabel>
            <Select
              value={f.papel_id ?? SEM_PAPEL}
              disabled={!editavel}
              onValueChange={(v) => set("papel_id", v === SEM_PAPEL ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PAPEL}>Sem papel definido</SelectItem>
                {papeis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <Opcao
              id="op-pr"
              label="Caminho principal"
              ajuda="Conta no progresso e no prazo previsto do onboarding."
              checked={f.principal}
              disabled={!editavel}
              onChange={(v) => set("principal", v)}
            />
            <Opcao
              id="op-ob"
              label="Obrigatória"
              ajuda="Só um gestor pode pular uma etapa obrigatória."
              checked={f.obrigatoria}
              disabled={!editavel}
              onChange={(v) => set("obrigatoria", v)}
            />
            <Opcao
              id="op-pa"
              label="Pausar SLA aguardando o cliente"
              ajuda="Enquanto aguarda o cliente, os dias não contam no prazo."
              checked={f.pausa_sla_aguardando_cliente}
              disabled={!editavel}
              onChange={(v) => set("pausa_sla_aguardando_cliente", v)}
            />
            <Opcao
              id="op-ck"
              label="Exige checklist completo"
              ajuda="A etapa só pode ser concluída com os itens obrigatórios marcados."
              checked={f.exige_checklist}
              disabled={!editavel}
              onChange={(v) => set("exige_checklist", v)}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <FilterLabel>Checklist</FilterLabel>
              <span className="text-[11px] text-muted-foreground">
                Marque os itens obrigatórios
              </span>
            </div>
            <div className="space-y-1.5">
              {checklist.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-md bg-[#F8FAFC] px-2 py-1.5"
                >
                  <Checkbox
                    checked={c.obrigatorio}
                    disabled={!editavel}
                    aria-label="Obrigatório"
                    onCheckedChange={async (v) => {
                      const { error } = await supabase
                        .from("modelo_checklist")
                        .update({ obrigatorio: v === true })
                        .eq("id", c.id);
                      erro(error);
                      await recarregar();
                    }}
                  />
                  {editavel ? (
                    <Input
                      key={c.texto}
                      defaultValue={c.texto}
                      className="h-7 flex-1 border-transparent bg-transparent px-1 shadow-none hover:border-border"
                      onBlur={async (e) => {
                        const v = e.target.value.trim();
                        if (!v || v === c.texto) return;
                        const { error } = await supabase
                          .from("modelo_checklist")
                          .update({ texto: v })
                          .eq("id", c.id);
                        erro(error);
                        await recarregar();
                      }}
                    />
                  ) : (
                    <span className="flex-1 text-sm">{c.texto}</span>
                  )}
                  {!c.obrigatorio && (
                    <span className="text-[11px] text-muted-foreground">opcional</span>
                  )}
                  {editavel && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-[#B91C1C]"
                      aria-label="Remover item"
                      onClick={async () => {
                        const { error } = await supabase
                          .from("modelo_checklist")
                          .delete()
                          .eq("id", c.id);
                        erro(error);
                        await recarregar();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {checklist.length === 0 && !editavel && (
                <p className="text-sm text-muted-foreground">Sem checklist.</p>
              )}
              {editavel && (
                <div className="flex gap-2">
                  <Input
                    value={novoItem}
                    placeholder="Novo item do checklist"
                    onChange={(e) => setNovoItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void adicionarItem();
                      }
                    }}
                  />
                  <Button variant="outline" onClick={adicionarItem} disabled={!novoItem.trim()}>
                    <Plus /> Adicionar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        {editavel && (
          <SheetFooter className="flex-row items-center justify-between gap-2 border-t p-4 sm:justify-between">
            <Button
              variant="ghost"
              className="text-[#B91C1C] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
              onClick={() => void onExcluir()}
            >
              <Trash2 /> Excluir etapa
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando || !mudou}>
                Salvar etapa
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Opcao({
  id,
  label,
  ajuda,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  ajuda: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{ajuda}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
