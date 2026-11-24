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
