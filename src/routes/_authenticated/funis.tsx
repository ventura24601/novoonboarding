import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowRight, ChevronRight, Download, Filter, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProdutos } from "@/lib/session";
import {
  calcular,
  formatarNumero,
  maiorVazamento,
  montarFunis,
  pct,
  periodoAnterior,
  periodoDeDias,
  quebraPorSegmento,
  segmentos as listarSegmentos,
  type DadosFunis,
  type Funil,
  type Resultado,
} from "@/lib/funis";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/app/ui";

const PERIODOS = [
  { id: "30", rotulo: "30 dias", dias: 30 },
  { id: "90", rotulo: "90 dias", dias: 90 },
  { id: "180", rotulo: "6 meses", dias: 180 },
  { id: "365", rotulo: "12 meses", dias: 365 },
  { id: "tudo", rotulo: "Tudo", dias: null },
] as const;

const searchSchema = z.object({
  funil: z.string().optional(),
  periodo: z.enum(["30", "90", "180", "365", "tudo"]).optional(),
  segmento: z.string().optional(),
  passo: z.number().int().min(0).optional(),
});

export const Route = createFileRoute("/_authenticated/funis")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Funis — ICOM" }] }),
  component: Funis,
});

const CORES = [
  "#7C3AED",
  "#0EA5E9",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#14B8A6",
  "#6366F1",
];

function useDadosFunis() {
  const { data: produtos = [] } = useProdutos();
  const q = useQuery({
    queryKey: ["funis-dados"],
    queryFn: async () => {
      const [c, v, o, e, p] = await Promise.all([
        supabase
          .from("clients")
          .select(
            "id, created_at, products, seller_id, contract_signed, contract_verified_at, paid, onboarding_released_at, onboarding_completed_at",
          ),
        supabase
          .from("vendas_recebidas")
          .select("id, recebido_em, status, meio_pagamento, cliente_id"),
        supabase.from("onboardings").select("id, cliente_id, produto_id, data_inicio, status"),
        supabase.from("onboarding_etapas").select("onboarding_id, ordem, nome, status"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (c.error) throw c.error;
      return {
        clientes: c.data,
        vendas: v.data ?? [],
        onboardings: o.data ?? [],
        etapas: e.data ?? [],
        pessoas: p.data ?? [],
      };
    },
    refetchInterval: 5 * 60_000,
  });
  const funis = useMemo(
    () => (q.data ? montarFunis({ ...q.data, produtos } as DadosFunis) : []),
    [q.data, produtos],
  );
  return { funis, isLoading: q.isLoading };
}

function Funis() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { funis, isLoading } = useDadosFunis();
  const [comparar, setComparar] = useState(true);

  const periodoId = busca.periodo ?? "90";
  const cfgPeriodo = PERIODOS.find((p) => p.id === periodoId) ?? PERIODOS[1];
  const periodo = useMemo(() => periodoDeDias(cfgPeriodo.dias), [cfgPeriodo.dias]);
  const anterior = useMemo(() => periodoAnterior(periodo), [periodo]);
  const funil = funis.find((f) => f.id === busca.funil) ?? funis[0];
  const segmento = busca.segmento ?? null;

  const set = (patch: Partial<z.infer<typeof searchSchema>>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const resumos = useMemo(
    () =>
      funis.map((f) => ({
        f,
        atual: calcular(f, periodo),
        antes: anterior ? calcular(f, anterior) : null,
      })),
    [funis, periodo, anterior],
  );

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando funis...</div>;
  if (!funil) {
    return (
      <EmptyState
        icon={Filter}
        title="Ainda não há dados para os funis"
        description="Os funis aparecem assim que houver clientes cadastrados."
      />
    );
  }

  const r = calcular(funil, periodo, segmento);
  const rAnteriorBruto = anterior ? calcular(funil, anterior, segmento) : null;
  const semAnterior = !!anterior && !rAnteriorBruto?.total;
  const rAntes = comparar && rAnteriorBruto?.total ? rAnteriorBruto : null;
  const passoSel = Math.min(busca.passo ?? 1, funil.passos.length - 1);
  const vaz = maiorVazamento(r);
  const segs = listarSegmentos(funil, periodo);
  const corSeg = (s: string) =>
    CORES[segs.findIndex((x) => x.nome === s) % CORES.length] ?? CORES[0]!;
  const principal = resumos.find((x) => x.f.id === funil.id)!;

  function exportar() {
    const linhas = [["Passo", "Quantidade", "% do início", "Conversão do passo anterior"]];
    r.contagens.forEach((c, i) =>
      linhas.push([
        funil!.passos[i]!.nome,
        String(c),
        pct(r.contagens[0] ? c / r.contagens[0] : null),
        pct(r.conversoes[i]),
      ]),
    );
    const csv = linhas.map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `funil-${funil!.id}-${periodoId}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            Análises <ChevronRight className="h-3 w-3" />{" "}
            <span className="font-medium text-foreground">Funis</span>
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight">Funis</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {funis.length} funis · {funil.nome} converte{" "}
            <b className="text-foreground">{pct(principal.atual.geral)}</b> em{" "}
            {cfgPeriodo.dias ? `${cfgPeriodo.rotulo}` : "todo o período"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border bg-white p-1 shadow-sm">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ periodo: p.id })}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${p.id === periodoId ? "bg-[#111827] text-white shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <Button variant="outline" className="rounded-xl bg-white" onClick={exportar}>
            <Download /> Exportar
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        {/* Funis salvos */}
        <aside className="h-fit rounded-2xl border bg-white/80 p-3 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)] backdrop-blur">
          <div className="px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Funis
          </div>
          <div className="space-y-1.5">
            {resumos.map(({ f, atual, antes }) => {
              const sel = f.id === funil.id;
              const delta =
                antes?.geral != null && atual.geral != null ? atual.geral - antes.geral : null;
              const max = Math.max(1, atual.contagens[0] ?? 0);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set({ funil: f.id, segmento: undefined, passo: undefined })}
                  className={`w-full rounded-xl border p-3 text-left transition ${sel ? "border-primary/30 bg-gradient-to-br from-[#F5F3FF] to-white shadow-sm ring-1 ring-primary/20" : "border-transparent hover:border-border hover:bg-[#F8FAFC]"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={`truncate text-sm font-semibold ${sel ? "text-primary" : "text-[#1F2937]"}`}
                      >
                        {f.nome}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.passos.length} passos · {atual.total} no período
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold tabular-nums text-[#1F2937]">
                        {pct(atual.geral, 0)}
                      </div>
                      {delta != null && Math.abs(delta) >= 0.0005 && (
                        <span
                          className={`mt-0.5 inline-flex items-center gap-0.5 rounded-md px-1 text-[10px] font-bold ${delta > 0 ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEE2E2] text-[#B91C1C]"}`}
                        >
                          {delta > 0 ? (
                            <TrendingUp className="h-2.5 w-2.5" />
                          ) : (
                            <TrendingDown className="h-2.5 w-2.5" />
                          )}
                          {pct(Math.abs(delta))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2.5 flex h-7 items-end gap-1">
                    {atual.contagens.map((c, i) => (
                      <span
                        key={i}
                        className={`flex-1 rounded-sm ${sel ? "bg-gradient-to-t from-[#7C3AED] to-[#A78BFA]" : "bg-[#CBD5E1]"}`}
                        style={{
                          height: `${Math.max(6, (c / max) * 100)}%`,
                          opacity: sel ? 1 - i * 0.08 : 1,
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Funil selecionado */}
        <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">{funil.nome}</h2>
              <p className="text-sm text-muted-foreground">{funil.descricao}</p>
            </div>
            {anterior && (
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Switch checked={comparar} onCheckedChange={setComparar} /> Período anterior
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip ativo={!segmento} onClick={() => set({ segmento: undefined })}>
              Todos
            </Chip>
            {segs.slice(0, 12).map((s) => (
              <Chip
                key={s.nome}
                ativo={segmento === s.nome}
                cor={corSeg(s.nome)}
                onClick={() => set({ segmento: segmento === s.nome ? undefined : s.nome })}
              >
                {s.nome} <span className="opacity-60">{s.n}</span>
              </Chip>
            ))}
          </div>

          {r.total === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nada entrou neste funil no período. Tente um período maior.
            </div>
          ) : (
            <>
              <Barras
                funil={funil}
                r={r}
                rAntes={rAntes}
                passoSel={passoSel}
                onPasso={(i) => set({ passo: i })}
              />
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-[#F8FAFC] px-4 py-2.5 text-xs text-muted-foreground">
                <span>
                  Geral <b className="ml-1 text-sm text-foreground">{pct(r.geral)}</b>
                </span>
                {rAntes && (
                  <span>
                    Período anterior <b className="text-foreground">{pct(rAntes.geral)}</b>
                  </span>
                )}
                {comparar && semAnterior && (
                  <span>Sem dados no período anterior para comparar</span>
                )}
                {rAntes && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-4 border-t-2 border-dashed border-[#94A3B8]" /> período
                    anterior
                  </span>
                )}
                <span className="ml-auto">Clique num passo para ver o detalhe</span>
              </div>
            </>
          )}
        </section>
      </div>

      {r.total > 0 && (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <Detalhe funil={funil} periodo={periodo} passo={passoSel} r={r} corSeg={corSeg} />
          <Vazamento funil={funil} vaz={vaz} segmento={segmento} onVer={(i) => set({ passo: i })} />
        </div>
      )}
    </div>
  );
}

function Chip({
  ativo,
  cor,
  onClick,
  children,
}: {
  ativo: boolean;
  cor?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${ativo ? "border-transparent bg-[#111827] text-white shadow-sm" : "bg-white text-[#475569] hover:border-[#CBD5E1] hover:text-foreground"}`}
    >
      {cor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />}
      {children}
    </button>
  );
}

function Barras({
  funil,
  r,
  rAntes,
  passoSel,
  onPasso,
}: {
  funil: Funil;
  r: Resultado;
  rAntes: Resultado | null;
  passoSel: number;
  onPasso: (i: number) => void;
}) {
  const base = Math.max(1, r.contagens[0] ?? 0);
  const baseAntes = Math.max(1, rAntes?.contagens[0] ?? 0);
  return (
    <div className="mt-5 overflow-x-auto">
      <div
        className="grid min-w-[640px] gap-3"
        style={{ gridTemplateColumns: `repeat(${funil.passos.length}, minmax(0, 1fr))` }}
      >
        {funil.passos.map((p, i) => (
          <div key={i} className="min-w-0">
            <div
              className="truncate text-xs font-medium text-muted-foreground"
              title={p.ajuda ?? p.nome}
            >
              {i + 1}. {p.nome}
            </div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight text-[#111827]">
              {formatarNumero(r.contagens[i] ?? 0)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {pct((r.contagens[i] ?? 0) / base, 0)} do início
            </div>
          </div>
        ))}
        {funil.passos.map((p, i) => {
          const h = ((r.contagens[i] ?? 0) / base) * 100;
          const hAnt = i > 0 ? ((r.contagens[i - 1] ?? 0) / base) * 100 : h;
          const hPeriodo = rAntes ? ((rAntes.contagens[i] ?? 0) / baseAntes) * 100 : null;
          const sel = i === passoSel;
          return (
            <button
              key={`b${i}`}
              type="button"
              onClick={() => onPasso(i)}
              aria-label={`Ver detalhe de ${p.nome}`}
              className={`group relative h-64 overflow-visible rounded-xl border bg-[#F8FAFC] transition ${sel ? "border-primary/50 ring-2 ring-primary/25" : "border-[#EEF2F7] hover:border-[#CBD5E1]"}`}
            >
              {/* perda em relação ao passo anterior (hachurado) */}
              {i > 0 && hAnt > h && (
                <span
                  className="absolute inset-x-1.5 rounded-t-lg"
                  style={{
                    bottom: `${h}%`,
                    height: `${hAnt - h}%`,
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(148,163,184,.28) 0 6px, transparent 6px 12px)",
                  }}
                />
              )}
              <span
                className={`absolute inset-x-1.5 bottom-1.5 rounded-lg bg-gradient-to-t shadow-sm transition ${sel ? "from-[#6D28D9] to-[#A78BFA]" : "from-[#7C3AED] to-[#C4B5FD] group-hover:to-[#A78BFA]"}`}
                style={{ height: `calc(${Math.max(h, 1.5)}% - 6px)` }}
              />
              {hPeriodo != null && (
                <span
                  className="absolute inset-x-1 border-t-2 border-dashed border-[#94A3B8]"
                  style={{ bottom: `${hPeriodo}%` }}
                  title={`Período anterior: ${pct(hPeriodo / 100, 0)} do início`}
                />
              )}
              {i > 0 && (
                <span className="absolute -left-[22px] top-1/2 z-10 -translate-y-1/2 rounded-full border bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[#111827] shadow-sm">
                  {pct(r.conversoes[i])}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Detalhe({
  funil,
  periodo,
  passo,
  r,
  corSeg,
}: {
  funil: Funil;
  periodo: ReturnType<typeof periodoDeDias>;
  passo: number;
  r: Resultado;
  corSeg: (s: string) => string;
}) {
  const linhas = quebraPorSegmento(funil, periodo, passo);
  const max = Math.max(1, ...linhas.map((l) => l.chegou));
  const anterior = passo > 0 ? funil.passos[passo - 1]!.nome : null;
  const restaram = r.contagens[passo] ?? 0;
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)]">
      <h3 className="text-base font-semibold">
        {passo + 1}. {funil.passos[passo]!.nome}
      </h3>
      <p className="text-sm text-muted-foreground">
        {formatarNumero(restaram)} chegaram
        {anterior ? (
          <>
            {" "}
            · {pct(r.conversoes[passo])} de quem passou por "{anterior}"
          </>
        ) : null}{" "}
        · por {funil.dimensao.toLowerCase()}
      </p>
      <div className="mt-4 space-y-3">
        {linhas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sem dados por {funil.dimensao.toLowerCase()} neste passo.
          </p>
        )}
        {linhas.map((l) => (
          <div
            key={l.segmento}
            className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: corSeg(l.segmento) }}
                />
                {l.segmento}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {passo > 0 ? `${pct(l.manteve, 0)} manteve` : `${l.chegou} no início`}
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#F1F5F9]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(l.chegou / max) * 100}%`,
                  background: `linear-gradient(90deg, ${corSeg(l.segmento)}, ${corSeg(l.segmento)}99)`,
                }}
              />
            </div>
            <div className="w-12 text-right text-sm font-semibold tabular-nums">
              {formatarNumero(l.chegou)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Vazamento({
  funil,
  vaz,
  segmento,
  onVer,
}: {
  funil: Funil;
  vaz: ReturnType<typeof maiorVazamento>;
  segmento: string | null;
  onVer: (i: number) => void;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-[#FEF3C7]/60 p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEF3C7] text-[#B45309]">
        <TrendingDown className="h-5 w-5" />
      </span>
      <div className="mt-4 text-xs font-medium text-muted-foreground">
        Maior vazamento{segmento ? ` · ${segmento}` : ""}
      </div>
      {vaz ? (
        <>
          <button
            type="button"
            onClick={() => onVer(vaz.passo)}
            className="mt-1 flex flex-wrap items-center gap-1.5 text-left text-lg font-semibold hover:text-primary"
          >
            {funil.passos[vaz.passo - 1]!.nome} <ArrowRight className="h-4 w-4" />{" "}
            {funil.passos[vaz.passo]!.nome}
          </button>
          <p className="mt-2 text-sm text-[#475569]">
            <b className="text-foreground">{formatarNumero(vaz.perdidos)}</b> ficam pelo caminho
            aqui — só <b className="text-foreground">{pct(vaz.conversao)}</b> seguem.
            {vaz.ganhoNoFim > 0 ? (
              <>
                {" "}
                Subir 5 pontos nesta passagem traria cerca de{" "}
                <b className="text-foreground">{vaz.ganhoNoFim}</b> a mais no fim do funil.
              </>
            ) : (
              <> Melhorar esta passagem é o que mais aumenta o resultado final.</>
            )}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma perda entre os passos no período.
        </p>
      )}
    </section>
  );
}
