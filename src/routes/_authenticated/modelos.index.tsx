import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useProdutos } from "@/lib/session";
import { Card, ColorBadge, EmptyState, FilterLabel, PageHeader } from "@/components/app/ui";
import { statusModelo } from "@/lib/modelos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/modelos/")({
  head: () => ({ meta: [{ title: "Modelos de onboarding — ICOM" }] }),
  component: Modelos,
});

function useModelosResumo() {
  return useQuery({
    queryKey: ["modelos-resumo"],
    queryFn: async () => {
      const [m, e, f] = await Promise.all([
        supabase.from("modelos").select("*").order("versao", { ascending: false }),
        supabase
          .from("modelo_etapas")
          .select("id, modelo_id, fase_id, nome, ordem, sla_dias, principal")
          .order("ordem"),
        supabase.from("modelo_fases").select("*").order("ordem"),
      ]);
      if (m.error) throw m.error;
      return { modelos: m.data, etapas: e.data ?? [], fases: f.data ?? [] };
    },
  });
}

function Modelos() {
  const { data: me } = useMe();
  const { data: produtos = [] } = useProdutos();
  const { data, isLoading } = useModelosResumo();
  const [arquivados, setArquivados] = useState(false);
  const [novo, setNovo] = useState<{ produtoId?: string } | null>(null);
  const todos = data?.modelos ?? [];
  const modelos = todos
    .filter((m) => arquivados || m.status !== "arquivado")
    .sort((a, b) => {
      const pa = produtos.find((p) => p.id === a.produto_id)?.nome ?? "";
      const pb = produtos.find((p) => p.id === b.produto_id)?.nome ?? "";
      return pa.localeCompare(pb, "pt-BR") || b.versao - a.versao;
    });
  const podeGerir = (produtoId: string) =>
    !!me && (me.isAdmin || (me.isGestor && me.produtosGeridos.includes(produtoId)));
  const semModelo = produtos.filter(
    (p) => p.ativo && !todos.some((m) => m.produto_id === p.id && m.status !== "arquivado"),
  );
  const podeCriar = !!me && (me.isAdmin || me.produtosGeridos.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modelos de onboarding"
        description="O passo a passo de cada linha de produto. Cada onboarding copia o modelo publicado no momento em que começa."
        actions={
          podeCriar ? (
            <Button onClick={() => setNovo({})}>
              <Plus /> Novo modelo
            </Button>
          ) : undefined
        }
      />

      {semModelo.length > 0 && podeCriar && (
        <Card className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Produtos sem modelo (não geram onboarding na liberação):
          </span>
          {semModelo.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!podeGerir(p.id)}
              onClick={() => setNovo({ produtoId: p.id })}
              className="rounded transition enabled:hover:opacity-80 disabled:cursor-default"
              title={podeGerir(p.id) ? "Criar modelo" : undefined}
            >
              <ColorBadge color={p.cor}>
                {p.nome}
                {podeGerir(p.id) && " +"}
              </ColorBadge>
            </button>
          ))}
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Switch id="arq" checked={arquivados} onCheckedChange={setArquivados} />
        <Label htmlFor="arq" className="text-sm text-muted-foreground">
          Mostrar versões arquivadas
        </Label>
      </div>

      {!isLoading && modelos.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="Nenhum modelo criado"
          description="Crie o primeiro modelo para definir as fases, etapas, SLAs e checklists de um produto."
          action={
            podeCriar ? (
              <Button onClick={() => setNovo({})}>
                <Plus /> Novo modelo
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {modelos.map((m) => {
            const p = produtos.find((x) => x.id === m.produto_id);
            const etapas = (data?.etapas ?? []).filter((e) => e.modelo_id === m.id);
            const fases = (data?.fases ?? []).filter((f) => f.modelo_id === m.id);
            const st = statusModelo(m.status);
            return (
              <Link key={m.id} to="/modelos/$id" params={{ id: m.id }} className="group block">
                <Card
                  className={`flex h-full flex-col p-5 transition group-hover:border-primary/40 group-hover:shadow-md ${m.status === "arquivado" ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {p && <ColorBadge color={p.cor}>{p.nome}</ColorBadge>}
                      <h2 className="mt-2 text-base font-semibold group-hover:text-primary">
                        {m.nome}
                      </h2>
                      <div className="text-xs text-muted-foreground">
                        Versão {m.versao} · dias {m.calendario === "uteis" ? "úteis" : "corridos"} ·
                        risco a partir de {m.limiar_risco_pct}% do SLA
                      </div>
                    </div>
                    <span
                      className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {fases.map((f) => (
                      <div key={f.id}>
                        <div className="filter-label mb-1.5 flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: f.cor }}
                          />
                          {f.nome}
                        </div>
                        <ol className="space-y-1">
                          {etapas
                            .filter((e) => e.fase_id === f.id)
                            .map((e) => (
                              <li
                                key={e.id}
                                className="flex items-center justify-between rounded-md bg-[#F8FAFC] px-2.5 py-1.5 text-sm"
                              >
                                <span
                                  className={e.principal ? "font-medium" : "text-muted-foreground"}
                                >
                                  {e.ordem}. {e.nome}
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  {e.sla_dias}d
                                </span>
                              </li>
                            ))}
                          {etapas.every((e) => e.fase_id !== f.id) && (
                            <li className="px-2.5 text-xs text-muted-foreground">Sem etapas</li>
                          )}
                        </ol>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto pt-4 text-xs text-muted-foreground">
                    {etapas.length} etapas · SLA total {etapas.reduce((s, e) => s + e.sla_dias, 0)}{" "}
                    dias
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {novo && <NovoModeloDialog produtoInicial={novo.produtoId} onClose={() => setNovo(null)} />}
    </div>
  );
}

const NOVO_PRODUTO = "__novo__";
const CORES = [
  "#7C3AED",
  "#0284C7",
  "#DB2777",
  "#059669",
  "#D97706",
  "#DC2626",
  "#4F46E5",
  "#0F766E",
  "#64748B",
];

function NovoModeloDialog({
  produtoInicial,
  onClose,
}: {
  produtoInicial: string | undefined;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const { data: produtos = [] } = useProdutos();
  const { data } = useModelosResumo();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [produtoId, setProdutoId] = useState(produtoInicial ?? "");
  const [nomeProduto, setNomeProduto] = useState("");
  const [cor, setCor] = useState(CORES[0]!);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  const disponiveis = useMemo(
    () => produtos.filter((p) => p.ativo && (me?.isAdmin || me?.produtosGeridos.includes(p.id))),
    [produtos, me],
  );
  const produto = produtos.find((p) => p.id === produtoId);
  const rascunho = (data?.modelos ?? []).find(
    (m) => m.produto_id === produtoId && m.status === "rascunho",
  );
  const publicado = (data?.modelos ?? []).find(
    (m) => m.produto_id === produtoId && m.status === "publicado",
  );
  const nomeSugerido =
    `Onboarding ${produtoId === NOVO_PRODUTO ? nomeProduto.trim() : (produto?.nome ?? "")}`.trim();

  async function criar() {
    setSalvando(true);
    try {
      let pid = produtoId;
      if (pid === NOVO_PRODUTO) {
        const n = nomeProduto.trim();
        if (!n) throw new Error("Informe o nome do produto.");
        const { data: p, error } = await supabase
          .from("produtos")
          .insert({ nome: n, cor })
          .select("id")
          .single();
        if (error)
          throw new Error(
            error.code === "23505" ? "Já existe um produto com esse nome." : error.message,
          );
        pid = p.id;
        await qc.invalidateQueries({ queryKey: ["produtos"] });
      }
      if (!pid) throw new Error("Escolha o produto.");
      const { data: id, error } = await supabase.rpc("criar_modelo", {
        _produto_id: pid,
        _nome: nome.trim() || nomeSugerido,
      });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["modelos-resumo"] });
      toast.success("Rascunho criado. Monte as etapas e publique quando estiver pronto.");
      navigate({ to: "/modelos/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o modelo.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo modelo de onboarding</DialogTitle>
          <DialogDescription>
            O modelo começa em rascunho, com as fases Implantação, Ativação e Acompanhamento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <FilterLabel>Produto</FilterLabel>
            <Select value={produtoId} onValueChange={setProdutoId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o produto" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
                {me?.isAdmin && (
                  <SelectItem value={NOVO_PRODUTO}>+ Cadastrar novo produto</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {produtoId === NOVO_PRODUTO && (
            <div className="space-y-3 rounded-lg border bg-[#F8FAFC] p-3">
              <div>
                <FilterLabel htmlFor="np">Nome do produto</FilterLabel>
                <Input
                  id="np"
                  value={nomeProduto}
                  onChange={(e) => setNomeProduto(e.target.value)}
                  placeholder="Ex.: Gestão de tráfego"
                  autoFocus
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Aparece na lista de produtos do contrato.
                </p>
              </div>
              <div>
                <FilterLabel>Cor</FilterLabel>
                <div className="flex flex-wrap gap-1.5">
                  {CORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCor(c)}
                      aria-label={c}
                      className={`h-6 w-6 rounded-full ring-offset-2 transition ${cor === c ? "ring-2 ring-[#111827]" : ""}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          {rascunho ? (
            <div className="rounded-md bg-[#FEF3C7] px-3 py-2 text-sm text-[#B45309]">
              Este produto já tem um rascunho (versão {rascunho.versao}).{" "}
              <Link
                to="/modelos/$id"
                params={{ id: rascunho.id }}
                className="font-semibold underline"
              >
                Abrir rascunho
              </Link>
            </div>
          ) : publicado ? (
            <div className="rounded-md bg-[#E0F2FE] px-3 py-2 text-sm text-[#075985]">
              Este produto já tem um modelo publicado. Para alterá-lo, abra o modelo e crie uma nova
              versão.{" "}
              <Link
                to="/modelos/$id"
                params={{ id: publicado.id }}
                className="font-semibold underline"
              >
                Abrir modelo
              </Link>
            </div>
          ) : (
            <div>
              <FilterLabel htmlFor="nm">Nome do modelo</FilterLabel>
              <Input
                id="nm"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={nomeSugerido || "Onboarding ..."}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={criar} disabled={salvando || !produtoId || !!rascunho || !!publicado}>
            Criar rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
