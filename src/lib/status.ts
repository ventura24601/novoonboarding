/**
 * Tokens de status usados no sistema inteiro (badges, KPIs, bordas, filtros).
 * Fonte única: não declare cores de status em outras telas.
 */
export type Situacao =
  | "no_prazo"
  | "em_risco"
  | "atrasado"
  | "bloqueado"
  | "aguardando_cliente"
  | "pendente"
  | "concluido"
  | "pulada"
  | "pausado"
  | "cancelado";

export interface StatusToken {
  label: string;
  /** cor principal (borda, ícone) */
  color: string;
  /** fundo do badge */
  bg: string;
  /** texto do badge */
  text: string;
  icon?: "lock" | "check";
  strike?: boolean;
}

export const STATUS: Record<Situacao, StatusToken> = {
  no_prazo: { label: "No prazo", color: "#10B981", bg: "#D1FAE5", text: "#065F46" },
  em_risco: { label: "Em risco", color: "#D97706", bg: "#FEF3C7", text: "#B45309" },
  atrasado: { label: "Atrasado", color: "#EF4444", bg: "#FEE2E2", text: "#B91C1C" },
  bloqueado: { label: "Bloqueado", color: "#EF4444", bg: "#FEE2E2", text: "#B91C1C", icon: "lock" },
  aguardando_cliente: { label: "Aguardando cliente", color: "#0284C7", bg: "#E0F2FE", text: "#075985" },
  pendente: { label: "Pendente", color: "#64748B", bg: "#F1F5F9", text: "#64748B" },
  concluido: { label: "Concluído", color: "#10B981", bg: "#D1FAE5", text: "#065F46", icon: "check" },
  pulada: { label: "Pulada", color: "#94A3B8", bg: "#F1F5F9", text: "#94A3B8", strike: true },
  pausado: { label: "Pausado", color: "#64748B", bg: "#F1F5F9", text: "#475569" },
  cancelado: { label: "Cancelado", color: "#94A3B8", bg: "#F1F5F9", text: "#94A3B8", strike: true },
};

export function statusToken(s: string | null | undefined): StatusToken {
  return STATUS[(s ?? "pendente") as Situacao] ?? STATUS.pendente;
}

/** Status de etapa (banco) → situação visual quando ainda não há cálculo de SLA. */
export const ETAPA_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
  pulada: "Pulada",
};

/** Cores usadas pela etapa atual (destaque dourado). */
export const ETAPA_ATUAL_COR = "#B48E4B";

/** Ordem de gravidade usada para ordenar listas: o que precisa de atenção primeiro. */
export const GRAVIDADE: Situacao[] = [
  "bloqueado", "atrasado", "em_risco", "aguardando_cliente", "no_prazo", "pendente", "pausado", "concluido", "pulada", "cancelado",
];

/**
 * Mesma regra da view onboarding_etapas_situacao (SQL), para uso otimista na tela.
 * diasDecorridos já desconta os dias pausados.
 */
export function situacaoEtapa(e: {
  status: string;
  prazo_em: string | null;
  sla_dias: number;
  diasDecorridos: number;
  limiarRiscoPct?: number;
  hoje?: string;
}): Situacao {
  switch (e.status) {
    case "concluida": return "concluido";
    case "pulada": return "pulada";
    case "bloqueada": return "bloqueado";
    case "aguardando_cliente": return "aguardando_cliente";
    case "pendente": return "pendente";
  }
  const hoje = e.hoje ?? new Date().toISOString().slice(0, 10);
  if (e.prazo_em && hoje > e.prazo_em.slice(0, 10)) return "atrasado";
  if (e.sla_dias > 0 && e.diasDecorridos * 100 >= e.sla_dias * (e.limiarRiscoPct ?? 80)) return "em_risco";
  return "no_prazo";
}
