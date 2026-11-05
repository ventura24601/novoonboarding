import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import {
  Activity, AlarmClock, ArrowUpDown, CheckCircle2, Clock, Hourglass, Lock, Rocket,
} from "lucide-react";
import { useOnboardings, useProdutos, type OnboardingResumo } from "@/lib/session";
import { GRAVIDADE, STATUS, type Situacao } from "@/lib/status";
import { Card, ColorBadge, EmptyState, FilterLabel, KpiCard, PageHeader, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const searchSchema = z.object({
  situacao: z.string().optional(),
  produto: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/painel")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Painel de onboarding — ICOM" }] }),
  component: Painel,
});

const dataBR = (d: string | null) => (d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—");

const KPIS: { key: string; title: string; icon: typeof Activity; color: string; match: (o: OnboardingResumo) => boolean }[] = [
  { key: "em_andamento", title: "Em andamento", icon: Activity, color: "#7C3AED", match: (o) => o.status === "em_andamento" },
  { key: "no_prazo", title: "No prazo", icon: Clock, color: STATUS.no_prazo.color, match: (o) => o.situacao === "no_prazo" },
  { key: "em_risco", title: "Em risco", icon: AlarmClock, color: STATUS.em_risco.color, match: (o) => o.situacao === "em_risco" },
  { key: "atrasado", title: "Atrasados", icon: Hourglass, color: STATUS.atrasado.color, match: (o) => o.situacao === "atrasado" },
  { key: "bloqueado", title: "Bloqueados", icon: Lock, color: STATUS.bloqueado.color, match: (o) => o.situacao === "bloqueado" },
  { key: "aguardando_cliente", title: "Aguard. cliente", icon: Clock, color: STATUS.aguardando_cliente.color, match: (o) => o.situacao === "aguardando_cliente" },
  { key: "concluido", title: "Concluídos", icon: CheckCircle2, color: STATUS.concluido.color, match: (o) => o.status === "concluido" },
];

function Painel() {
  const { situacao, produto } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: onbs = [], isLoading } = useOnboardings();
  const { data: produtos = [] } = useProdutos();
  const [q, setQ] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "situacao", desc: false }]);

  const doProduto = useMemo(() => onbs.filter((o) => !produto || o.produto_id === produto), [onbs, produto]);
  const kpi = KPIS.find((k) => k.key === situacao);
  const rows = useMemo(
    () => doProduto.filter((o) => (kpi ? kpi.match(o) : o.status !== "concluido" && o.status !== "cancelado"))
      .filter((o) => !q || (o.cliente_nome ?? "").toLowerCase().includes(q.toLowerCase())),
    [doProduto, kpi, q],
  );

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const columns = useMemo<ColumnDef<OnboardingResumo>[]>(() => [
    {
      id: "cliente", accessorKey: "cliente_nome", header: "Cliente",
      cell: ({ row }) => (
        <Link to="/onboardings/$id" params={{ id: row.original.id! }} className="font-semibold text-[#1F2937] hover:text-primary hover:underline">
          {row.original.cliente_nome}
        </Link>
      ),
    },
    { id: "produto", accessorKey: "produto_nome", header: "Produto", cell: ({ row }) => <ColorBadge color={row.original.produto_cor ?? "#7C3AED"}>{row.original.produto_nome}</ColorBadge> },
    {
      id: "etapa", accessorKey: "etapa_atual_nome", header: "Etapa atual",
      cell: ({ row }) => row.original.etapa_atual_nome ? (
        <div className="leading-tight">
          <div className="font-medium text-gold">{row.original.etapa_atual_nome}</div>
          <div className="text-[11px] text-muted-foreground">{row.original.etapa_atual_fase}</div>
        </div>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "progresso", header: "Progresso", accessorFn: (o) => (o.etapas_total ? (o.etapas_feitas ?? 0) / o.etapas_total : 0),
      cell: ({ row }) => {
        const t = row.original.etapas_total ?? 0, f = row.original.etapas_feitas ?? 0;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#F1F5F9]">
              <div className="h-full rounded-full bg-primary" style={{ width: `${t ? (f / t) * 100 : 0}%` }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{f}/{t}</span>
          </div>
        );
      },
    },
    { id: "prazo", accessorKey: "etapa_atual_prazo", header: "Prazo da etapa", cell: ({ row }) => <span className="tabular-nums">{dataBR(row.original.etapa_atual_prazo)}</span> },
    { id: "previsao", accessorKey: "previsao_termino", header: "Previsão", cell: ({ row }) => <span className="tabular-nums">{dataBR(row.original.status === "concluido" ? row.original.data_termino : row.original.previsao_termino)}</span> },
    {
      id: "situacao", header: "Situação", accessorFn: (o) => GRAVIDADE.indexOf((o.situacao ?? "pendente") as Situacao),
      cell: ({ row }) => <StatusBadge status={row.original.situacao} />,
    },
  ], []);

  const table = useReactTable({
    data: rows, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel"
        description="Onboardings por linha de produto, com a situação de SLA da etapa atual."
        actions={<Button variant="dark" asChild><Link to="/clientes"><Rocket /> Liberar clientes</Link></Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {KPIS.map((k) => (
          <KpiCard key={k.key} title={k.title} icon={k.icon} color={k.color} value={doProduto.filter(k.match).length}
            selected={situacao === k.key} onClick={() => setSearch({ situacao: situacao === k.key ? undefined : k.key })}
            hint="Clique para filtrar" />
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <FilterLabel htmlFor="busca">Cliente</FilterLabel>
            <Input id="busca" placeholder="Buscar cliente..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-56">
            <FilterLabel>Produto</FilterLabel>
            <Select value={produto ?? "all"} onValueChange={(v) => setSearch({ produto: v === "all" ? undefined : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {produtos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(situacao || produto || q) && (
            <Button variant="ghost" onClick={() => { setQ(""); navigate({ search: {}, replace: true }); }}>Limpar filtros</Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">{rows.length} onboarding{rows.length === 1 ? "" : "s"}{!kpi && " ativos"}</div>
        </div>
      </Card>

      {!isLoading && rows.length === 0 ? (
        <EmptyState icon={Rocket} title="Nenhum onboarding por aqui"
          description={onbs.length === 0
            ? "Quando um contrato for pago e verificado, libere o cliente na etapa de Contratos: o onboarding de cada produto contratado começa automaticamente."
            : "Nenhum onboarding corresponde aos filtros selecionados."}
          action={onbs.length === 0 ? <Button asChild><Link to="/clientes">Ir para Contratos</Link></Button> : undefined} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-[#F8FAFC]">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-2.5 text-left">
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className="filter-label inline-flex items-center gap-1 hover:text-foreground">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-[#FAFAFC]"
                  onClick={(ev) => { if (!(ev.target as HTMLElement).closest("a,button")) navigate({ to: "/onboardings/$id", params: { id: r.original.id! } }); }}>
                  {r.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-3 align-middle">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
