/** Análises da retenção (view de dash): semana a semana, mês a mês, churn por produto e tendência. */
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";
import {
  churnPorProduto,
  porMesAnalise,
  porPeriodoAnalise,
  porSemanaAnalise,
  resumoRelatorio,
  tendencia,
  type Bucket,
  type CasoAnalise,
} from "@/lib/retencao";

const pct = (v: number | null | undefined, casas = 0) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(casas).replace(".", ",")}%`;

function Variacao({ v, inverso }: { v: number | null; inverso?: boolean }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(v) < 0.005) return <span className="text-muted-foreground">0%</span>;
  // Para cancelamentos, subir é ruim (vermelho).
  const ruim = inverso ? v > 0 : v < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${ruim ? "text-[#B91C1C]" : "text-[#047857]"}`}
    >
      {v > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {pct(Math.abs(v))}
    </span>
  );
}

function Cartao({
  titulo,
  ajuda,
  children,
  acoes,
}: {
  titulo: string;
  ajuda?: string;
  children: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{titulo}</h3>
          {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
}

const DicaGrafico = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}:{" "}
          <b>
            {p.dataKey === "taxa"
              ? pct(p.value / 100)
              : p.dataKey === "movel"
                ? p.value?.toFixed(1).replace(".", ",")
                : p.value}
          </b>
        </div>
      ))}
    </div>
  );
};

function Comparativo({ buckets, unidade }: { buckets: Bucket[]; unidade: "semana" | "mês" }) {
  const dados = buckets.map((b) => ({
    ...b,
    taxa: b.taxaCancelamento == null ? null : Math.round(b.taxaCancelamento * 1000) / 10,
  }));
  return (
    <>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dados} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 11, fill: "#64748B" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="q"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#64748B" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="p"
              orientation="right"
              unit="%"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#64748B" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<DicaGrafico />} cursor={{ fill: "#F8FAFC" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            <Bar yAxisId="q" dataKey="cancelados" name="Cancelados" stackId="a" fill="#EF4444" />
            <Bar
              yAxisId="q"
              dataKey="retidos"
              name="Retidos (revertido + downgrade)"
              stackId="a"
              fill="#10B981"
            />
            <Bar
              yAxisId="q"
              dataKey="abertos"
              name="Em aberto"
              stackId="a"
              fill="#CBD5E1"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="p"
              type="monotone"
              dataKey="taxa"
              name="Taxa de cancelamento"
              stroke="#7C3AED"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              {[
                unidade === "semana" ? "Semana de" : "Mês",
                "Pedidos",
                `vs. ${unidade} anterior`,
                "Cancelados",
                `vs. ${unidade} anterior`,
                "Revertidos",
                "Downgrades",
                "Em aberto",
                "Taxa de cancelamento",
              ].map((h, i) => (
                <th key={i} className="filter-label whitespace-nowrap px-2 py-2 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((b) => (
              <tr key={b.chave} className="border-b last:border-0">
                <td className="whitespace-nowrap px-2 py-2 font-medium">{b.rotulo}</td>
                <td className="px-2 py-2 tabular-nums">{b.pedidos}</td>
                <td className="px-2 py-2 text-xs">
                  <Variacao v={b.varPedidos} inverso />
                </td>
                <td className="px-2 py-2 tabular-nums">{b.cancelados}</td>
                <td className="px-2 py-2 text-xs">
                  <Variacao v={b.varCancelados} inverso />
                </td>
                <td className="px-2 py-2 tabular-nums text-[#065F46]">{b.revertidos}</td>
                <td className="px-2 py-2 tabular-nums text-[#5B21B6]">{b.downgrades}</td>
                <td className="px-2 py-2 tabular-nums text-muted-foreground">{b.abertos}</td>
                <td className="px-2 py-2 font-semibold tabular-nums">{pct(b.taxaCancelamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RetencaoAnalises({
  casos,
  inicio,
  fim,
  linha,
}: {
  casos: (CasoAnalise & { motivo_api?: string | null })[];
  inicio: Date | null;
  fim: Date | null;
  linha: string | null; // rótulo da linha (Redes, Black) quando há recorte
}) {
  const [granularidade, setGranularidade] = useState<"semana" | "mes">("semana");
  // Com datas escolhidas, os períodos cobrem o intervalo; sem datas, últimas 12 semanas / 12 meses.
  const semanas = useMemo(
    () =>
      inicio && fim ? porPeriodoAnalise(casos, "semana", inicio, fim) : porSemanaAnalise(casos, 12),
    [casos, inicio, fim],
  );
  const meses = useMemo(
    () => (inicio && fim ? porPeriodoAnalise(casos, "mes", inicio, fim) : porMesAnalise(casos, 12)),
    [casos, inicio, fim],
  );
  const r = useMemo(() => resumoRelatorio(casos), [casos]);
  const produtos = useMemo(() => churnPorProduto(casos), [casos]);
  const tend = useMemo(() => tendencia(semanas), [semanas]);
  const dadosTend = semanas.map((s, i) => ({
    rotulo: s.rotulo,
    pedidos: s.pedidos,
    movel: tend.movel[i],
  }));
  const maxPedidosProduto = Math.max(1, ...produtos.map((p) => p.pedidos));
  const Seta =
    tend.direcao === "subindo"
      ? ArrowUpRight
      : tend.direcao === "caindo"
        ? ArrowDownRight
        : ArrowRight;
  const corTend =
    tend.direcao === "subindo" ? "#B91C1C" : tend.direcao === "caindo" ? "#047857" : "#475569";

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">
            Resumo do relatório{linha ? ` · ${linha}` : ""}
          </h3>
          <span className="text-xs text-muted-foreground">
            {inicio && fim
              ? `${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`
              : "Todo o período"}
            {linha ? ` · produtos com "${linha.toLowerCase()}" no nome` : ""}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { r: "Pedidos", v: r.pedidos, cor: "#111827" },
            { r: "Cancelados", v: r.cancelados, cor: "#B91C1C" },
            { r: "Revertidos", v: r.revertidos, cor: "#065F46" },
            { r: "Downgrades", v: r.downgrades, cor: "#5B21B6" },
            { r: "Em aberto", v: r.abertos, cor: "#475569" },
            { r: "Taxa de retenção", v: pct(r.taxaRetencao), cor: "#047857" },
          ].map((k) => (
            <div key={k.r} className="rounded-lg bg-[#F8FAFC] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {k.r}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: k.cor }}>
                {k.v}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="filter-label mb-2">Churn dos serviços{linha ? ` ${linha}` : ""}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-[#B91C1C]">
                {pct(r.churnServicos)}
              </span>
              <span className="text-xs text-muted-foreground">
                {r.servicosCancelados} de {r.servicosEncerrados} serviços cancelados nos pedidos
                encerrados
              </span>
            </div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[#F1F5F9]">
              <span className="bg-[#EF4444]" style={{ flexGrow: r.servicosCancelados }} />
              <span
                className="bg-[#10B981]"
                style={{ flexGrow: r.servicosEncerrados - r.servicosCancelados }}
              />
            </div>
          </div>
          <div>
            <div className="filter-label mb-2">Principais motivos</div>
            {r.motivos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem motivos no período.</p>
            ) : (
              <div className="space-y-1">
                {r.motivos.slice(0, 5).map(([t, n]) => (
                  <div key={t} className="flex items-center gap-2 text-xs">
                    <span className="w-52 truncate" title={t}>
                      {t}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                      <span
                        className="block h-full rounded-full bg-[#F59E0B]"
                        style={{ width: `${(n / r.motivos[0]![1]) * 100}%` }}
                      />
                    </span>
                    <span className="w-14 text-right tabular-nums">
                      {n} · {pct(n / Math.max(1, r.pedidos))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Cartao
          titulo={
            granularidade === "semana" ? "Cancelamento semana a semana" : "Cancelamento mês a mês"
          }
          ajuda="Pedidos pela data da solicitação. Taxa de cancelamento = cancelados ÷ (cancelados + revertidos + downgrades)."
          acoes={
            <div className="flex rounded-lg border bg-white p-0.5">
              {(["semana", "mes"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularidade(g)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${granularidade === g ? "bg-[#111827] text-white" : "text-muted-foreground"}`}
                >
                  {g === "semana" ? "Semana a semana" : "Mês a mês"}
                </button>
              ))}
            </div>
          }
        >
          <Comparativo
            buckets={granularidade === "semana" ? semanas : meses}
            unidade={granularidade === "semana" ? "semana" : "mês"}
          />
        </Cartao>

        <Cartao
          titulo="Tendência de cancelamento"
          ajuda={`Pedidos por semana ${inicio && fim ? "no período escolhido" : "nas últimas 12 semanas"} e média móvel de 4 semanas.`}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${corTend}14`, color: corTend }}
            >
              <Seta className="h-6 w-6" />
            </span>
            <div>
              <div className="text-xl font-bold" style={{ color: corTend }}>
                {tend.direcao === "subindo"
                  ? "Subindo"
                  : tend.direcao === "caindo"
                    ? "Caindo"
                    : "Estável"}
              </div>
              <div className="text-xs text-muted-foreground">
                {tend.inclinacao >= 0 ? "+" : ""}
                {tend.inclinacao.toFixed(1).replace(".", ",")} pedido/semana · média{" "}
                {tend.media.toFixed(1).replace(".", ",")}/semana
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#F8FAFC] p-2.5">
              <div className="text-muted-foreground">Últimas 4 semanas</div>
              <div className="text-lg font-bold">{tend.ultimas4}</div>
            </div>
            <div className="rounded-lg bg-[#F8FAFC] p-2.5">
              <div className="text-muted-foreground">4 semanas anteriores</div>
              <div className="text-lg font-bold">{tend.anteriores4}</div>
              <div className="mt-0.5">
                <Variacao v={tend.variacao4} inverso />
              </div>
            </div>
          </div>
          <div className="mt-3 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dadosTend} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EEF2F7" />
                <XAxis
                  dataKey="rotulo"
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<DicaGrafico />} />
                <Bar dataKey="pedidos" name="Pedidos" fill="#C4B5FD" radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="movel"
                  name="Média móvel (4 sem.)"
                  stroke="#7C3AED"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Cartao>
      </div>

      <Cartao
        titulo="Churn por produto"
        ajuda="Nos pedidos já encerrados, quanto de cada produto foi de fato cancelado. Considera só quem pediu cancelamento, não a base inteira de clientes do produto."
      >
        {produtos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem produtos informados nos pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  {["Produto", "Pedidos", "Cancelados × mantidos", "Em aberto", "Churn"].map(
                    (h) => (
                      <th key={h} className="filter-label whitespace-nowrap px-2 py-2 text-left">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.produto} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-2 py-2.5 font-medium">{p.produto}</td>
                    <td className="px-2 py-2.5 tabular-nums">{p.pedidos}</td>
                    <td className="w-[40%] px-2 py-2.5">
                      <div
                        className="flex h-2.5 overflow-hidden rounded-full bg-[#F1F5F9]"
                        style={{ width: `${Math.max(8, (p.pedidos / maxPedidosProduto) * 100)}%` }}
                        title={`${p.cancelados} cancelados · ${p.mantidos} mantidos · ${p.abertos} em aberto`}
                      >
                        <span className="bg-[#EF4444]" style={{ flexGrow: p.cancelados }} />
                        <span className="bg-[#10B981]" style={{ flexGrow: p.mantidos }} />
                        <span className="bg-[#CBD5E1]" style={{ flexGrow: p.abertos }} />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {p.cancelados} cancelados · {p.mantidos} mantidos
                      </div>
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{p.abertos}</td>
                    <td className="px-2 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold tabular-nums ${p.churn == null ? "text-muted-foreground" : p.churn >= 0.7 ? "bg-[#FEE2E2] text-[#B91C1C]" : p.churn >= 0.4 ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#D1FAE5] text-[#065F46]"}`}
                      >
                        {pct(p.churn)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Para churn sobre a base inteira (clientes ativos de cada produto), a gestão precisa
              informar quantos clientes ativos há por produto.
            </p>
          </div>
        )}
      </Cartao>
    </div>
  );
}
