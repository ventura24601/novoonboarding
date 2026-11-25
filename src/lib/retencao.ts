/** Retenção: status, prazos (48h para o 1º contato; 5 dias úteis em andamento) e métricas do dash. */

export type StatusRetencao =
  "nao_iniciado" | "pendente" | "em_andamento" | "revertido" | "downgrade" | "finalizado";

export const STATUS_RETENCAO: {
  id: StatusRetencao;
  rotulo: string;
  cor: string;
  bg: string;
  texto: string;
  ajuda: string;
}[] = [
  {
    id: "nao_iniciado",
    rotulo: "Não iniciado",
    cor: "#64748B",
    bg: "#F1F5F9",
    texto: "#475569",
    ajuda: "Pedido novo: fazer o 1º contato em até 48h",
  },
  {
    id: "pendente",
    rotulo: "Pendente",
    cor: "#D97706",
    bg: "#FEF3C7",
    texto: "#B45309",
    ajuda: "Pediu o formulário e não preencheu",
  },
  {
    id: "em_andamento",
    rotulo: "Em andamento",
    cor: "#0284C7",
    bg: "#E0F2FE",
    texto: "#075985",
    ajuda: "Em negociação: resolver em até 5 dias úteis",
  },
  {
    id: "revertido",
    rotulo: "Revertido",
    cor: "#10B981",
    bg: "#D1FAE5",
    texto: "#065F46",
    ajuda: "Cliente ficou",
  },
  {
    id: "downgrade",
    rotulo: "Downgrade",
    cor: "#7C3AED",
    bg: "#EDE9FE",
    texto: "#5B21B6",
    ajuda: "Ficou com um plano menor",
  },
  {
    id: "finalizado",
    rotulo: "Finalizado",
    cor: "#EF4444",
    bg: "#FEE2E2",
    texto: "#B91C1C",
    ajuda: "Cancelamento concluído",
  },
];
export const statusRetencao = (s: string) =>
  STATUS_RETENCAO.find((x) => x.id === s) ?? STATUS_RETENCAO[0]!;
export const ENCERRADOS: StatusRetencao[] = ["revertido", "downgrade", "finalizado"];

export const CANAIS = [
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "ligacao", rotulo: "Ligação" },
  { id: "email", rotulo: "E-mail" },
  { id: "outro", rotulo: "Outro" },
] as const;

/** Como foi o contato e para qual status o caso vai (null = não muda). */
export const RESULTADOS: { id: string; rotulo: string; status: StatusRetencao | null }[] = [
  { id: "sem_resposta", rotulo: "Não respondeu", status: null },
  { id: "conversou", rotulo: "Conversamos, em negociação", status: "em_andamento" },
  { id: "enviou_formulario", rotulo: "Enviei o formulário", status: "pendente" },
  { id: "reverteu", rotulo: "Reverteu, vai ficar", status: "revertido" },
  { id: "downgrade", rotulo: "Aceitou downgrade", status: "downgrade" },
  { id: "manteve_cancelamento", rotulo: "Manteve o cancelamento", status: "finalizado" },
];
export const resultadoRotulo = (id: string | null) =>
  RESULTADOS.find((r) => r.id === id)?.rotulo ?? id ?? "";

export const TAGS_SUGERIDAS = [
  "Preço",
  "Sem uso",
  "Suporte",
  "Concorrente",
  "Financeiro",
  "Fechou a clínica",
  "Resultado",
  "Insatisfeito",
  "VIP",
];

export type CasoRetencao = {
  id: string;
  status: string;
  data_solicitacao: string;
  data_preenchimento?: string | null; // formulário preenchido = início das 48h
  primeiro_contato_em: string | null; // contato registrado aqui
  contato_feito_em?: string | null; // aqui ou 1ª anotação na gestão
  motivo_api?: string | null;
  prazo_resolucao: string | null;
  dias_uteis_restantes: number | null;
  encerrado_em: string | null;
  tags: string[];
};

export type Contagem = {
  tipo: "contato" | "resolucao" | null;
  texto: string;
  nivel: "ok" | "alerta" | "atrasado" | "neutro";
};

/** As 48h começam quando o formulário é preenchido (o caso vira "Não iniciado"). */
export const inicio48h = (c: CasoRetencao) => c.data_preenchimento ?? c.data_solicitacao;
/** 1º contato: registrado aqui ou primeira anotação feita na gestão. */
export const feito = (c: CasoRetencao) => c.contato_feito_em ?? c.primeiro_contato_em;

/** Contagem regressiva exibida no card e na tabela. */
export function contagem(c: CasoRetencao, agora = new Date()): Contagem {
  if (ENCERRADOS.includes(c.status as StatusRetencao))
    return { tipo: null, texto: "Encerrado", nivel: "neutro" };
  if (c.status === "pendente") {
    const dias = Math.floor((agora.getTime() - new Date(c.data_solicitacao).getTime()) / 86400_000);
    return {
      tipo: null,
      texto: dias >= 1 ? `Aguardando formulário há ${dias}d` : "Aguardando formulário",
      nivel: "neutro",
    };
  }
  if (!feito(c) && c.status === "nao_iniciado") {
    const prazo = new Date(inicio48h(c)).getTime() + 48 * 3600_000;
    const h = (prazo - agora.getTime()) / 3600_000;
    if (h < 0) {
      const atraso = -h;
      return {
        tipo: "contato",
        texto: `Contato atrasado ${atraso >= 24 ? `${Math.floor(atraso / 24)}d ${Math.floor(atraso % 24)}h` : `${Math.max(1, Math.floor(atraso))}h`}`,
        nivel: "atrasado",
      };
    }
    return {
      tipo: "contato",
      texto: `Contato em ${h >= 24 ? `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h` : `${Math.max(0, Math.floor(h))}h ${Math.floor((h % 1) * 60)}min`}`,
      nivel: h <= 12 ? "alerta" : "ok",
    };
  }
  if (c.status === "em_andamento" && c.dias_uteis_restantes != null) {
    const d = c.dias_uteis_restantes;
    if (d < 0)
      return {
        tipo: "resolucao",
        texto: `Prazo vencido há ${-d} ${d === -1 ? "dia útil" : "dias úteis"}`,
        nivel: "atrasado",
      };
    if (d === 0) return { tipo: "resolucao", texto: "Prazo vence hoje", nivel: "alerta" };
    return {
      tipo: "resolucao",
      texto: `${d} ${d === 1 ? "dia útil restante" : "dias úteis restantes"}`,
      nivel: d <= 1 ? "alerta" : "ok",
    };
  }
  return { tipo: null, texto: "Contato feito", nivel: "ok" };
}

/** Métricas do dash para a lista filtrada. */
export function metricas(casos: CasoRetencao[], agora = new Date()) {
  const por = Object.fromEntries(STATUS_RETENCAO.map((s) => [s.id, 0])) as Record<
    StatusRetencao,
    number
  >;
  let contatoAtrasado = 0,
    prazoVencido = 0,
    horasAteContato = 0,
    comContato = 0,
    contatoNoPrazo = 0;
  const tags = new Map<string, number>();
  const motivos = new Map<string, number>();
  for (const c of casos) {
    if (c.motivo_api) motivos.set(c.motivo_api, (motivos.get(c.motivo_api) ?? 0) + 1);
    if (c.status in por) por[c.status as StatusRetencao]++;
    const k = contagem(c, agora);
    if (k.nivel === "atrasado" && k.tipo === "contato") contatoAtrasado++;
    if (k.nivel === "atrasado" && k.tipo === "resolucao") prazoVencido++;
    const contato = feito(c);
    if (contato) {
      const h = (new Date(contato).getTime() - new Date(inicio48h(c)).getTime()) / 3600_000;
      horasAteContato += Math.max(0, h);
      comContato++;
      if (h <= 48) contatoNoPrazo++;
    }
    for (const t of c.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  const encerrados = por.revertido + por.downgrade + por.finalizado;
  return {
    total: casos.length,
    porStatus: por,
    abertos: casos.length - encerrados,
    contatoAtrasado,
    prazoVencido,
    taxaRetencao: encerrados ? (por.revertido + por.downgrade) / encerrados : null,
    taxaReversao: encerrados ? por.revertido / encerrados : null,
    mediaHorasContato: comContato ? horasAteContato / comContato : null,
    contatoNoPrazo: comContato ? contatoNoPrazo / comContato : null,
    tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** Pedidos por semana (segunda-feira), para o gráfico do dash. */
export function porSemana(
  casos: { data_solicitacao: string; status: string }[],
  semanas = 8,
  agora = new Date(),
) {
  const inicioSemana = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const base = inicioSemana(agora);
  const out = Array.from({ length: semanas }, (_, i) => {
    const ini = new Date(base);
    ini.setDate(ini.getDate() - 7 * (semanas - 1 - i));
    return { inicio: ini, total: 0, retidos: 0, perdidos: 0 };
  });
  for (const c of casos) {
    const s = inicioSemana(new Date(c.data_solicitacao)).getTime();
    const b = out.find((x) => x.inicio.getTime() === s);
    if (!b) continue;
    b.total++;
    if (c.status === "revertido" || c.status === "downgrade") b.retidos++;
    if (c.status === "finalizado") b.perdidos++;
  }
  return out;
}

export function soDigitos(t: string | null) {
  return (t ?? "").replace(/\D/g, "");
}

/** Link do WhatsApp (assume Brasil quando vier sem DDI). */
export function linkWhatsapp(tel: string | null) {
  const d = soDigitos(tel);
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
}

// ---------- Análises (view de dash) ----------

export type CasoAnalise = { data_solicitacao: string; status: string; servicos?: unknown };

export type Bucket = {
  chave: string;
  rotulo: string;
  inicio: Date;
  pedidos: number;
  cancelados: number; // finalizado
  retidos: number; // revertido + downgrade
  revertidos: number;
  downgrades: number;
  abertos: number;
  taxaCancelamento: number | null; // cancelados ÷ encerrados
  varPedidos: number | null; // vs. período anterior
  varCancelados: number | null;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const inicioSemana = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const inicioMes = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const variacao = (atual: number, antes: number) =>
  antes ? (atual - antes) / antes : atual ? null : 0;

function agrupar(casos: CasoAnalise[], n: number, tipo: "semana" | "mes", agora: Date): Bucket[] {
  const base = tipo === "semana" ? inicioSemana(agora) : inicioMes(agora);
  const out: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ini = new Date(base);
    if (tipo === "semana") ini.setDate(ini.getDate() - 7 * i);
    else ini.setMonth(ini.getMonth() - i);
    const dd = String(ini.getDate()).padStart(2, "0");
    const mm = String(ini.getMonth() + 1).padStart(2, "0");
    out.push({
      chave: ini.toISOString(),
      rotulo:
        tipo === "semana"
          ? `${dd}/${mm}`
          : `${MESES[ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`,
      inicio: ini,
      pedidos: 0,
      cancelados: 0,
      retidos: 0,
      revertidos: 0,
      downgrades: 0,
      abertos: 0,
      taxaCancelamento: null,
      varPedidos: null,
      varCancelados: null,
    });
  }
  const idx = new Map(out.map((b, i) => [b.inicio.getTime(), i]));
  for (const c of casos) {
    const d = new Date(c.data_solicitacao);
    const k = (tipo === "semana" ? inicioSemana(d) : inicioMes(d)).getTime();
    const i = idx.get(k);
    if (i === undefined) continue;
    const b = out[i]!;
    b.pedidos++;
    if (c.status === "finalizado") b.cancelados++;
    else if (c.status === "revertido") {
      b.retidos++;
      b.revertidos++;
    } else if (c.status === "downgrade") {
      b.retidos++;
      b.downgrades++;
    } else b.abertos++;
  }
  out.forEach((b, i) => {
    const enc = b.cancelados + b.retidos;
    b.taxaCancelamento = enc ? b.cancelados / enc : null;
    if (i > 0) {
      b.varPedidos = variacao(b.pedidos, out[i - 1]!.pedidos);
      b.varCancelados = variacao(b.cancelados, out[i - 1]!.cancelados);
    }
  });
  return out;
}

export const porSemanaAnalise = (casos: CasoAnalise[], n = 12, agora = new Date()) =>
  agrupar(casos, n, "semana", agora);
export const porMesAnalise = (casos: CasoAnalise[], n = 12, agora = new Date()) =>
  agrupar(casos, n, "mes", agora);

/**
 * Churn por produto, entre os pedidos de cancelamento: em cada pedido encerrado, o serviço conta como
 * perdido se foi cancelado e como mantido se não foi. Não mede a base total de clientes do produto.
 */
export function churnPorProduto(casos: CasoAnalise[]) {
  const m = new Map<
    string,
    {
      produto: string;
      pedidos: number;
      encerrados: number;
      cancelados: number;
      mantidos: number;
      abertos: number;
    }
  >();
  for (const c of casos) {
    const servs = (Array.isArray(c.servicos) ? c.servicos : []) as {
      nome: string;
      cancelado: boolean;
    }[];
    const encerrado = ENCERRADOS.includes(c.status as StatusRetencao);
    for (const s of servs) {
      const p = m.get(s.nome) ?? {
        produto: s.nome,
        pedidos: 0,
        encerrados: 0,
        cancelados: 0,
        mantidos: 0,
        abertos: 0,
      };
      p.pedidos++;
      if (encerrado) {
        p.encerrados++;
        if (s.cancelado) p.cancelados++;
        else p.mantidos++;
      } else p.abertos++;
      m.set(s.nome, p);
    }
  }
  return [...m.values()]
    .map((p) => ({ ...p, churn: p.encerrados ? p.cancelados / p.encerrados : null }))
    .sort((a, b) => b.pedidos - a.pedidos || a.produto.localeCompare(b.produto, "pt-BR"));
}

/** Tendência: média móvel de 4 semanas, inclinação (regressão linear) e últimas 4 semanas vs. 4 anteriores. */
export function tendencia(semanas: Bucket[]) {
  const ys = semanas.map((s) => s.pedidos);
  const n = ys.length;
  const media = ys.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const mx = (n - 1) / 2;
  let num = 0,
    den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - media);
    den += (x - mx) ** 2;
  });
  const inclinacao = den ? num / den : 0; // pedidos por semana
  const movel = ys.map((_, i) =>
    i >= 3 ? (ys[i]! + ys[i - 1]! + ys[i - 2]! + ys[i - 3]!) / 4 : null,
  );
  const soma = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const ult4 = soma(ys.slice(-4));
  const ant4 = soma(ys.slice(-8, -4));
  const direcao: "subindo" | "caindo" | "estavel" =
    Math.abs(inclinacao) < Math.max(0.15, media * 0.05)
      ? "estavel"
      : inclinacao > 0
        ? "subindo"
        : "caindo";
  return {
    inclinacao,
    media,
    movel,
    ultimas4: ult4,
    anteriores4: ant4,
    variacao4: ant4 ? (ult4 - ant4) / ant4 : null,
    direcao,
  };
}

/** Semanas ou meses cobrindo o intervalo [inicio, fim] (até 60 períodos). */
export function porPeriodoAnalise(
  casos: CasoAnalise[],
  tipo: "semana" | "mes",
  inicio: Date,
  fim: Date,
) {
  let n: number;
  if (tipo === "semana")
    n =
      Math.round((inicioSemana(fim).getTime() - inicioSemana(inicio).getTime()) / (7 * 86400_000)) +
      1;
  else
    n = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()) + 1;
  return agrupar(casos, Math.min(60, Math.max(1, n)), tipo, fim);
}

// ---------- Relatório por linha de produto ----------

export type Linha = "redes" | "black";
export const LINHAS: { id: Linha; rotulo: string; termo: string }[] = [
  { id: "redes", rotulo: "Redes", termo: "rede" },
  { id: "black", rotulo: "Black", termo: "black" },
];
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const servicosCaso = (c: CasoAnalise) =>
  (Array.isArray(c.servicos) ? c.servicos : []) as { nome: string; cancelado: boolean }[];

/** Produto pertence à linha quando o nome contém a palavra (ex.: "Marketing Pro Black", "Redes + IA (combo)"). */
export function produtoDaLinha(nome: string, linha: Linha) {
  const termo = LINHAS.find((l) => l.id === linha)!.termo;
  return norm(nome).includes(termo);
}
export const casoDaLinha = (c: CasoAnalise, linha: Linha) =>
  servicosCaso(c).some((s) => produtoDaLinha(s.nome, linha));

/** Só os serviços da linha em cada caso (para churn por produto e contagens da linha). */
export function recortarLinha<T extends CasoAnalise>(casos: T[], linha: Linha | null): T[] {
  if (!linha) return casos;
  return casos
    .filter((c) => casoDaLinha(c, linha))
    .map((c) => ({ ...c, servicos: servicosCaso(c).filter((s) => produtoDaLinha(s.nome, linha)) }));
}

/** Números do relatório: pedidos, desfechos e churn dos serviços (da linha, quando houver recorte). */
export function resumoRelatorio(casos: (CasoAnalise & { motivo_api?: string | null })[]) {
  let cancelados = 0,
    revertidos = 0,
    downgrades = 0,
    abertos = 0;
  let servEnc = 0,
    servCanc = 0;
  const motivos = new Map<string, number>();
  for (const c of casos) {
    if (c.status === "finalizado") cancelados++;
    else if (c.status === "revertido") revertidos++;
    else if (c.status === "downgrade") downgrades++;
    else abertos++;
    if (ENCERRADOS.includes(c.status as StatusRetencao)) {
      for (const s of servicosCaso(c)) {
        servEnc++;
        if (s.cancelado) servCanc++;
      }
    }
    if (c.motivo_api) motivos.set(c.motivo_api, (motivos.get(c.motivo_api) ?? 0) + 1);
  }
  const encerrados = cancelados + revertidos + downgrades;
  return {
    pedidos: casos.length,
    cancelados,
    revertidos,
    downgrades,
    retidos: revertidos + downgrades,
    abertos,
    encerrados,
    taxaCancelamento: encerrados ? cancelados / encerrados : null,
    taxaRetencao: encerrados ? (revertidos + downgrades) / encerrados : null,
    churnServicos: servEnc ? servCanc / servEnc : null,
    servicosCancelados: servCanc,
    servicosEncerrados: servEnc,
    motivos: [...motivos.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** Filtra pela data da solicitação (fim inclusivo até 23:59). */
export function noIntervalo<T extends { data_solicitacao: string }>(
  casos: T[],
  de: string | null,
  ate: string | null,
) {
  const ini = de ? new Date(`${de}T00:00:00-03:00`).getTime() : -Infinity;
  const fim = ate ? new Date(`${ate}T23:59:59.999-03:00`).getTime() : Infinity;
  return casos.filter((c) => {
    const t = new Date(c.data_solicitacao).getTime();
    return t >= ini && t <= fim;
  });
}

/** Só pedidos com o produto, e só esse serviço em cada pedido (para churn do produto). */
export function recortarProduto<T extends CasoAnalise>(casos: T[], produto: string | null): T[] {
  if (!produto) return casos;
  return casos
    .filter((c) => servicosCaso(c).some((s) => s.nome === produto))
    .map((c) => ({ ...c, servicos: servicosCaso(c).filter((s) => s.nome === produto) }));
}

/** Produtos presentes nos pedidos, do mais pedido ao menos. */
export function produtosDosPedidos(casos: CasoAnalise[]) {
  const m = new Map<string, number>();
  for (const c of casos) for (const s of servicosCaso(c)) m.set(s.nome, (m.get(s.nome) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([nome, n]) => ({ nome, n }));
}

/** Formulário de cancelamento preenchido pelo cliente (sem ele, o pedido não chegou a ser formalizado). */
export const formularioPreenchido = (c: { data_preenchimento?: string | null }) =>
  !!c.data_preenchimento;

type CasoFunil = CasoAnalise & {
  data_preenchimento?: string | null;
  contato_feito_em?: string | null;
};

/** Funil da retenção: pediram → preencheram o formulário → tiveram contato → encerrados → retidos. */
export function funilRetencao(casos: CasoFunil[]) {
  const preenchidos = casos.filter(formularioPreenchido);
  const contatados = preenchidos.filter((c) => c.contato_feito_em);
  const encerrados = preenchidos.filter((c) => ENCERRADOS.includes(c.status as StatusRetencao));
  const retidos = encerrados.filter((c) => c.status === "revertido" || c.status === "downgrade");
  const etapas = [
    { id: "pedidos", rotulo: "Pediram cancelamento", n: casos.length },
    { id: "preenchidos", rotulo: "Preencheram o formulário", n: preenchidos.length },
    { id: "contatados", rotulo: "Tiveram contato do CS", n: contatados.length },
    { id: "encerrados", rotulo: "Encerrados", n: encerrados.length },
    { id: "retidos", rotulo: "Retidos (revertido + downgrade)", n: retidos.length },
  ];
  // Tempo do preenchimento ao 1º contato (só quem teve contato).
  const horas = contatados
    .map(
      (c) =>
        (new Date(c.contato_feito_em!).getTime() - new Date(c.data_preenchimento!).getTime()) /
        3600_000,
    )
    .filter((h) => h >= 0);
  return {
    etapas: etapas.map((e, i) => ({
      ...e,
      doAnterior: i === 0 ? null : etapas[i - 1]!.n ? e.n / etapas[i - 1]!.n : null,
    })),
    semFormulario: casos.length - preenchidos.length,
    mediaHorasContato: horas.length ? horas.reduce((a, b) => a + b, 0) / horas.length : null,
    contatoEm48h: horas.length ? horas.filter((h) => h <= 48).length / horas.length : null,
  };
}

// ---------- Regras de produto para contagem ----------

export type Servico = { nome: string; cancelado: boolean };

// A gestão escreve o mesmo produto de jeitos diferentes na base e nos pedidos (ex.: "IA Kit (Pro)" e "IA Pro").
const ALIAS_PRODUTO: Record<string, string> = {
  iakitpro: "IA Pro",
  iapro: "IA Pro",
  marketingpro2: "Marketing Pro 2.0",
  marketingpro20: "Marketing Pro 2.0",
  icombot: "ICOM Bot",
  iadevideo: "IA de Vídeo",
  iadeagendamento: "IA de Agendamento",
  appcrc: "AppCRC",
  appcrcstandalone: "AppCRC",
  anovaprofissao: "A Nova Profissão",
  redesiacombo: "Redes + IA (Combo)",
  whatsappoficial: "WhatsApp Oficial",
  discadorcomercial: "Discador Comercial",
};
/** Nome único do produto, igual na base de clientes e nos pedidos de cancelamento. */
export function produtoCanonico(nome: string) {
  const k = norm(nome).replace(/[^a-z0-9]/g, "");
  return ALIAS_PRODUTO[k] ?? nome.trim();
}

/**
 * Serviços do pedido como devem ser contados nas métricas:
 * - Black é pacote: pedido com qualquer produto "Black" conta como 1 serviço "Black" (os itens do pacote não contam).
 * - Facebook conta como Redes.
 * - Discador é bônus de todos os produtos: só conta quando foi o único serviço pedido.
 * Os serviços originais continuam guardados e aparecem no painel do caso.
 */
export function servicosParaContagem(servicos: unknown): Servico[] {
  const lista = (Array.isArray(servicos) ? servicos : []) as Servico[];
  if (lista.some((s) => produtoDaLinha(s.nome, "black"))) {
    return [
      {
        nome: "Black",
        cancelado: lista.filter((s) => produtoDaLinha(s.nome, "black")).some((s) => s.cancelado),
      },
    ];
  }
  const porNome = new Map<string, Servico>();
  for (const s of lista) {
    const nome = norm(s.nome) === "facebook" ? "Redes" : produtoCanonico(s.nome);
    const atual = porNome.get(nome);
    porNome.set(nome, { nome, cancelado: (atual?.cancelado ?? false) || s.cancelado });
  }
  const out = [...porNome.values()];
  return out.length > 1 ? out.filter((s) => norm(s.nome) !== "discador") : out;
}

// ---------- Comparar produtos ----------

export type ComparacaoProduto = {
  produto: string;
  pedidos: number;
  encerrados: number;
  cancelados: number;
  mantidos: number;
  abertos: number;
  churn: number | null; // cancelados ÷ encerrados
  participacao: number | null; // parte dos cancelamentos entre os produtos escolhidos
};

/**
 * Cancelamentos de cada produto escolhido, no total e por semana/mês. Em cada pedido o produto conta
 * como cancelado quando o pedido foi encerrado e o serviço foi cancelado; como mantido quando foi
 * encerrado sem cancelar o serviço; e em aberto enquanto o pedido não foi encerrado.
 */
export function compararProdutos(
  casos: CasoAnalise[],
  produtos: string[],
  tipo: "semana" | "mes",
  inicio: Date | null = null,
  fim: Date | null = null,
  agora = new Date(),
) {
  const porProduto = produtos.map((produto) => {
    // Status do produto no pedido: finalizado = cancelado, revertido = mantido, demais = em aberto.
    const casosDoProduto = recortarProduto(casos, produto).map((c) => {
      const encerrado = ENCERRADOS.includes(c.status as StatusRetencao);
      const cancelado = servicosCaso(c).some((s) => s.cancelado);
      return { ...c, status: !encerrado ? "aberto" : cancelado ? "finalizado" : "revertido" };
    });
    const buckets =
      inicio && fim
        ? porPeriodoAnalise(casosDoProduto, tipo, inicio, fim)
        : agrupar(casosDoProduto, 12, tipo, agora);
    const r = resumoRelatorio(casosDoProduto);
    return { produto, buckets, r };
  });
  const totalCanc = porProduto.reduce((s, p) => s + p.r.cancelados, 0);
  const resumo: ComparacaoProduto[] = porProduto.map(({ produto, r }) => ({
    produto,
    pedidos: r.pedidos,
    encerrados: r.encerrados,
    cancelados: r.cancelados,
    mantidos: r.revertidos,
    abertos: r.abertos,
    churn: r.encerrados ? r.cancelados / r.encerrados : null,
    participacao: totalCanc ? r.cancelados / totalCanc : null,
  }));
  const base = porProduto[0]?.buckets ?? [];
  const serie = base.map((b, i) => {
    const ponto: Record<string, string | number> = { rotulo: b.rotulo };
    for (const p of porProduto) ponto[p.produto] = p.buckets[i]?.cancelados ?? 0;
    return ponto;
  });
  return { resumo, serie };
}

// ---------- Churn da carteira (base total de clientes) ----------

/** Cliente da base: [id_cliente, contexto (carteira), produtos ativos]. */
export type ClienteBase = [string, string | null, string[]];
export type CasoCarteira = CasoAnalise & { id_appcrc?: string | null };
export type DadosCarteira = {
  foto_data: string | null; // foto da base usada como início do período
  primeira_foto: string | null;
  ultima_foto: string | null;
  base: ClienteBase[];
  atual: ClienteBase[];
  contextos: Record<string, string>; // carteira dos clientes que aparecem na retenção
  saidas: [string, string, string][]; // [id_cliente, produto, data] produtos que saíram da base
};
export type LinhaChurn = {
  grupo: string;
  baseInicio: number;
  cancelados: number;
  churn: number | null;
  baseAtual: number;
  saidasBase: number;
};
export const SEM_CARTEIRA = "Sem carteira";

/** Grupos do cliente: produtos (com as regras de contagem) ou a carteira (contexto). */
export function gruposDoCliente(
  produtos: string[],
  contexto: string | null,
  por: "produto" | "carteira",
) {
  if (por === "carteira") return produtos.length ? [contexto ?? SEM_CARTEIRA] : [];
  return servicosParaContagem(produtos.map((nome) => ({ nome, cancelado: false }))).map(
    (s) => s.nome,
  );
}

/** Grupos perdidos num pedido encerrado: produtos cancelados, ou a carteira quando o pedido foi finalizado. */
function perdasDoCaso(
  c: CasoCarteira,
  contextos: Record<string, string>,
  por: "produto" | "carteira",
) {
  if (por === "carteira")
    return c.status === "finalizado" ? [contextos[c.id_appcrc ?? ""] ?? SEM_CARTEIRA] : [];
  if (!ENCERRADOS.includes(c.status as StatusRetencao)) return [];
  return servicosCaso(c)
    .filter((s) => s.cancelado)
    .map((s) => s.nome);
}

const contar = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const diaBR = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00-03:00`);

/**
 * Churn da carteira = cancelamentos no período ÷ base ativa no início do período.
 * A API da base só traz a foto do dia, então a base do início vem da foto mais próxima. Quando essa foto é
 * posterior ao início, somamos de volta quem cancelou entre o início e a foto (estimativa; marcada como tal).
 * Cancelamentos vêm dos pedidos da retenção (data da solicitação).
 */
export function churnCarteira(
  dados: DadosCarteira,
  casos: CasoCarteira[],
  por: "produto" | "carteira",
  inicio: Date | null,
  fim: Date | null,
  agora = new Date(),
) {
  const datas = casos.map((c) => new Date(c.data_solicitacao).getTime());
  const ini = inicio ?? new Date(datas.length ? Math.min(...datas) : agora.getTime());
  const fi = fim ?? agora;
  const foto = dados.foto_data ? diaBR(dados.foto_data) : null;
  const estimado = !foto || foto.getTime() > ini.getTime();

  const base = new Map<string, number>();
  for (const [, ctx, prods] of dados.base)
    for (const g of gruposDoCliente(prods, ctx, por)) contar(base, g);
  const atual = new Map<string, number>();
  for (const [, ctx, prods] of dados.atual)
    for (const g of gruposDoCliente(prods, ctx, por)) contar(atual, g);

  const canc = new Map<string, number>();
  const devolver = new Map<string, number>(); // cancelaram entre o início e a foto: estavam na base no início
  for (const c of casos) {
    const t = new Date(c.data_solicitacao).getTime();
    const perdas = perdasDoCaso(c, dados.contextos, por);
    if (t >= ini.getTime() && t <= fi.getTime()) for (const g of perdas) contar(canc, g);
    if (foto && t >= ini.getTime() && t < foto.getTime())
      for (const g of perdas) contar(devolver, g);
  }

  // Saídas registradas pela própria base (a partir da 2ª coleta).
  const ctxDe = new Map<string, string | null>();
  for (const [id, ctx] of [...dados.base, ...dados.atual]) ctxDe.set(id, ctx);
  const ativos = new Set(dados.atual.map(([id]) => id));
  const saidas = new Map<string, Set<string>>();
  for (const [id, produto, em] of dados.saidas) {
    const t = diaBR(em).getTime();
    if (t < ini.getTime() || t > fi.getTime()) continue;
    let g: string | null;
    if (por === "carteira")
      g = ativos.has(id) ? null : (ctxDe.get(id) ?? dados.contextos[id] ?? SEM_CARTEIRA);
    else g = gruposDoCliente([produto], null, "produto")[0] ?? null;
    if (g) (saidas.get(g) ?? saidas.set(g, new Set()).get(g)!).add(`${id}|${g}`);
  }

  const grupos = new Set([...base.keys(), ...atual.keys(), ...canc.keys()]);
  const linhas: LinhaChurn[] = [...grupos].map((grupo) => {
    const baseInicio = (base.get(grupo) ?? 0) + (devolver.get(grupo) ?? 0);
    const cancelados = canc.get(grupo) ?? 0;
    return {
      grupo,
      baseInicio,
      cancelados,
      churn: baseInicio ? cancelados / baseInicio : null,
      baseAtual: atual.get(grupo) ?? 0,
      saidasBase: saidas.get(grupo)?.size ?? 0,
    };
  });
  linhas.sort((a, b) => b.baseAtual - a.baseAtual || a.grupo.localeCompare(b.grupo, "pt-BR"));

  // Total de clientes (não soma produtos: um cliente tem vários).
  const totalBase =
    dados.base.filter(([, , p]) => p.length).length +
    casos.filter((c) => {
      const t = new Date(c.data_solicitacao).getTime();
      return c.status === "finalizado" && foto && t >= ini.getTime() && t < foto.getTime();
    }).length;
  const totalCanc = casos.filter((c) => {
    const t = new Date(c.data_solicitacao).getTime();
    return c.status === "finalizado" && t >= ini.getTime() && t <= fi.getTime();
  }).length;
  return {
    linhas,
    estimado,
    inicio: ini,
    fim: fi,
    total: {
      baseInicio: totalBase,
      cancelados: totalCanc,
      churn: totalBase ? totalCanc / totalBase : null,
      baseAtual: dados.atual.filter(([, , p]) => p.length).length,
    },
  };
}

/** Churn de clientes mês a mês (últimos n meses), com a mesma estimativa da base no início de cada mês. */
export function churnMensal(
  dados: DadosCarteira,
  casos: CasoCarteira[],
  n = 6,
  agora = new Date(),
) {
  const out: { rotulo: string; baseInicio: number; cancelados: number; churn: number | null }[] =
    [];
  for (let i = n - 1; i >= 0; i--) {
    const ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const r = churnCarteira(dados, casos, "carteira", ini, fim < agora ? fim : agora, agora);
    out.push({
      rotulo: `${MESES[ini.getMonth()]}/${String(ini.getFullYear()).slice(2)}`,
      baseInicio: r.total.baseInicio,
      cancelados: r.total.cancelados,
      churn: r.total.churn,
    });
  }
  return out;
}
