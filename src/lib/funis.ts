/**
 * Funis da Central: monta a partir dos dados do sistema e calcula contagens, conversão entre passos,
 * comparação com o período anterior, quebra por segmento e o maior vazamento.
 * Cada entidade (cliente, venda, onboarding) entra no funil pela data de entrada (coorte) e "alcança"
 * os passos em sequência: só conta no passo N quem também passou pelos anteriores.
 */

export type Entidade = {
  id: string;
  data: string; // entrada no funil (ISO)
  segmentos: string[]; // valores da dimensão de filtro (ex.: produtos, vendedor)
  passos: boolean[]; // alcançou cada passo (sem considerar a ordem; a ordem é aplicada no cálculo)
};

export type Funil = {
  id: string;
  nome: string;
  descricao: string;
  dimensao: string; // rótulo do filtro (ex.: "Produto")
  passos: { nome: string; ajuda?: string }[];
  entidades: Entidade[];
};

export type Periodo = { inicio: Date | null; fim: Date };

export type Resultado = {
  total: number;
  contagens: number[];
  conversoes: (number | null)[]; // passo i em relação ao i-1 (0..1); índice 0 = null
  geral: number | null; // último / primeiro
};

/** Alcance cumulativo: passo i só vale se todos os anteriores também foram alcançados. */
export function alcance(passos: boolean[]): boolean[] {
  const out: boolean[] = [];
  let ok = true;
  for (const p of passos) {
    ok = ok && p;
    out.push(ok);
  }
  return out;
}

export function dentro(e: Entidade, p: Periodo, segmento: string | null) {
  const d = new Date(e.data);
  if (p.inicio && d < p.inicio) return false;
  if (d > p.fim) return false;
  return !segmento || e.segmentos.includes(segmento);
}

export function calcular(f: Funil, p: Periodo, segmento: string | null = null): Resultado {
  const contagens = f.passos.map(() => 0);
  let total = 0;
  for (const e of f.entidades) {
    if (!dentro(e, p, segmento)) continue;
    total++;
    alcance(e.passos).forEach((ok, i) => {
      if (ok) contagens[i]!++;
    });
  }
  const conversoes = contagens.map((c, i) =>
    i === 0 ? null : contagens[i - 1] ? c / contagens[i - 1]! : null,
  );
  const primeiro = contagens[0] ?? 0;
  return {
    total,
    contagens,
    conversoes,
    geral: primeiro ? contagens[contagens.length - 1]! / primeiro : null,
  };
}

/** Mesmo intervalo, imediatamente antes. Sem início (todo o período) não há anterior. */
export function periodoAnterior(p: Periodo): Periodo | null {
  if (!p.inicio) return null;
  const dur = p.fim.getTime() - p.inicio.getTime();
  return { inicio: new Date(p.inicio.getTime() - dur), fim: new Date(p.inicio.getTime() - 1) };
}

export function periodoDeDias(dias: number | null, hoje = new Date()): Periodo {
  const fim = new Date(hoje);
  fim.setHours(23, 59, 59, 999);
  if (dias == null) return { inicio: null, fim };
  const inicio = new Date(hoje);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { inicio, fim };
}

/** Transição com mais perdas (em quantidade) e quanto renderia +5 pontos nela. */
export function maiorVazamento(r: Resultado) {
  let melhor: { passo: number; perdidos: number; conversao: number; ganhoNoFim: number } | null =
    null;
  for (let i = 1; i < r.contagens.length; i++) {
    const antes = r.contagens[i - 1]!;
    const perdidos = antes - r.contagens[i]!;
    if (antes === 0 || perdidos <= 0) continue;
    if (!melhor || perdidos > melhor.perdidos) {
      const conversao = r.contagens[i]! / antes;
      // +5 pontos nessa conversão, mantendo as conversões seguintes.
      const extraNoPasso = antes * 0.05;
      const restante = r.contagens[i] ? r.contagens[r.contagens.length - 1]! / r.contagens[i]! : 0;
      melhor = { passo: i, perdidos, conversao, ganhoNoFim: Math.round(extraNoPasso * restante) };
    }
  }
  return melhor;
}

/** Quanto de cada segmento chegou ao passo e quanto manteve do passo anterior. */
export function quebraPorSegmento(f: Funil, p: Periodo, passo: number) {
  const valores = new Set<string>();
  for (const e of f.entidades) if (dentro(e, p, null)) e.segmentos.forEach((s) => valores.add(s));
  return [...valores]
    .map((s) => {
      const r = calcular(f, p, s);
      const chegou = r.contagens[passo] ?? 0;
      const anterior = passo > 0 ? (r.contagens[passo - 1] ?? 0) : r.total;
      return { segmento: s, chegou, anterior, manteve: anterior ? chegou / anterior : null };
    })
    .filter((x) => x.anterior > 0)
    .sort((a, b) => b.chegou - a.chegou || a.segmento.localeCompare(b.segmento, "pt-BR"));
}

/** Segmentos presentes no período, com quantidade, para os filtros. */
export function segmentos(f: Funil, p: Periodo) {
  const m = new Map<string, number>();
  for (const e of f.entidades)
    if (dentro(e, p, null)) for (const s of e.segmentos) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([nome, n]) => ({ nome, n }));
}

// ---------- Montagem a partir dos dados do sistema ----------

export type DadosFunis = {
  clientes: {
    id: string;
    created_at: string;
    products: string[];
    seller_id: string | null;
    contract_signed: boolean;
    contract_verified_at: string | null;
    paid: boolean;
    onboarding_released_at: string | null;
    onboarding_completed_at: string | null;
  }[];
  vendas: {
    id: string;
    recebido_em: string;
    status: string;
    meio_pagamento: string | null;
    cliente_id: string | null;
  }[];
  onboardings: {
    id: string;
    cliente_id: string;
    produto_id: string;
    data_inicio: string;
    status: string;
  }[];
  etapas: { onboarding_id: string; ordem: number; nome: string; status: string }[];
  produtos: { id: string; nome: string }[];
  pessoas: { id: string; full_name: string | null; email: string | null }[];
};

export function montarFunis(d: DadosFunis): Funil[] {
  const nomePessoa = (id: string | null) => {
    const p = d.pessoas.find((x) => x.id === id);
    return p ? p.full_name || p.email || "Sem nome" : "Sem vendedor";
  };
  const cliente = new Map(d.clientes.map((c) => [c.id, c]));
  const funis: Funil[] = [];

  funis.push({
    id: "contrato-onboarding",
    nome: "Contrato → Onboarding",
    descricao: "Do cadastro do cliente até o onboarding concluído",
    dimensao: "Produto",
    passos: [
      { nome: "Cadastrados", ajuda: "Clientes cadastrados no período" },
      { nome: "Contrato assinado" },
      { nome: "Contrato verificado" },
      { nome: "Pago" },
      { nome: "Enviado p/ onboarding" },
      { nome: "Onboarding concluído" },
    ],
    entidades: d.clientes.map((c) => ({
      id: c.id,
      data: c.created_at,
      segmentos: c.products.length ? c.products : ["Sem produto"],
      passos: [
        true,
        c.contract_signed,
        !!c.contract_verified_at,
        c.paid,
        !!c.onboarding_released_at,
        !!c.onboarding_completed_at,
      ],
    })),
  });

  if (d.vendas.length) {
    funis.push({
      id: "vendas",
      nome: "Venda → Cliente ativo",
      descricao: "Das vendas recebidas pelo webhook até o onboarding concluído",
      dimensao: "Pagamento",
      passos: [
        { nome: "Vendas recebidas" },
        { nome: "Aprovadas" },
        { nome: "Enviadas p/ onboarding" },
        { nome: "Onboarding concluído" },
      ],
      entidades: d.vendas
        .filter((v) => v.status !== "descartada")
        .map((v) => {
          const c = v.cliente_id ? cliente.get(v.cliente_id) : undefined;
          return {
            id: v.id,
            data: v.recebido_em,
            segmentos: [v.meio_pagamento ?? "Não informado"],
            passos: [
              true,
              v.status === "aprovada",
              !!c?.onboarding_released_at,
              !!c?.onboarding_completed_at,
            ],
          };
        }),
    });
  }

  // Um funil por linha de onboarding (produto), com os passos = etapas do modelo.
  const porProduto = new Map<string, typeof d.onboardings>();
  for (const o of d.onboardings) {
    if (o.status === "cancelado") continue;
    porProduto.set(o.produto_id, [...(porProduto.get(o.produto_id) ?? []), o]);
  }
  const etapasPorOnb = new Map<string, typeof d.etapas>();
  for (const e of d.etapas)
    etapasPorOnb.set(e.onboarding_id, [...(etapasPorOnb.get(e.onboarding_id) ?? []), e]);

  for (const [produtoId, onbs] of porProduto) {
    const produto = d.produtos.find((p) => p.id === produtoId);
    if (!produto) continue;
    // Nome mais comum de cada posição (onboardings de versões diferentes do modelo podem variar).
    const nomes = new Map<number, Map<string, number>>();
    for (const o of onbs)
      for (const e of etapasPorOnb.get(o.id) ?? []) {
        const m = nomes.get(e.ordem) ?? new Map<string, number>();
        m.set(e.nome, (m.get(e.nome) ?? 0) + 1);
        nomes.set(e.ordem, m);
      }
    const ordens = [...nomes.keys()].sort((a, b) => a - b);
    if (!ordens.length) continue;
    const feita = (s: string) => s === "concluida" || s === "pulada";
    funis.push({
      id: `onb-${produtoId}`,
      nome: `Onboarding ${produto.nome}`,
      descricao: "Do início do onboarding à última etapa concluída",
      dimensao: "Vendedor",
      passos: [
        { nome: "Iniciados" },
        ...ordens.map((o) => ({
          nome: [...nomes.get(o)!.entries()].sort((a, b) => b[1] - a[1])[0]![0],
        })),
      ],
      entidades: onbs.map((o) => {
        const es = etapasPorOnb.get(o.id) ?? [];
        return {
          id: o.id,
          data: o.data_inicio,
          segmentos: [nomePessoa(cliente.get(o.cliente_id)?.seller_id ?? null)],
          passos: [
            true,
            ...ordens.map((ord) => {
              const e = es.find((x) => x.ordem === ord);
              return e ? feita(e.status) : true; // etapa que não existe nesta versão não trava o funil
            }),
          ],
        };
      }),
    });
  }
  return funis;
}

export function formatarNumero(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return n.toLocaleString("pt-BR");
}

export function pct(v: number | null | undefined, casas = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(casas).replace(".", ",")}%`;
}
