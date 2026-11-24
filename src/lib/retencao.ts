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
