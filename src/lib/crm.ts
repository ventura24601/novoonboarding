export const CLIENT_TYPES = [
  { value: "aluno", label: "Aluno" },
  { value: "nao_aluno", label: "Não aluno" },
] as const;

/** Etapa 1 (Contratos) → Etapa 2 (Onboarding). Produtos vêm da tabela public.produtos. */
export type ClientStatus =
  | "aguardando_assinatura"
  | "aguardando_pagamento"
  | "aguardando_verificacao"
  | "pronto_para_liberar"
  | "em_onboarding"
  | "finalizado";

export interface StatusInput {
  contract_signed: boolean;
  paid: boolean;
  contract_verified_at: string | null;
  onboarding_released_at: string | null;
  onboarding_completed_at: string | null;
}

/** Mesma regra da coluna status_contrato da view public.clientes. */
export function clientStatus(c: StatusInput): ClientStatus {
  if (c.onboarding_completed_at) return "finalizado";
  if (c.onboarding_released_at) return "em_onboarding";
  if (!c.contract_signed) return "aguardando_assinatura";
  if (!c.paid) return "aguardando_pagamento";
  if (!c.contract_verified_at) return "aguardando_verificacao";
  return "pronto_para_liberar";
}

export const STATUS_LABEL: Record<ClientStatus, string> = {
  aguardando_assinatura: "Aguardando assinatura",
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_verificacao: "Verificar contrato",
  pronto_para_liberar: "Pronto para onboarding",
  em_onboarding: "Em onboarding",
  finalizado: "Onboarding concluído",
};

/** Mapeia o status do contrato nos tokens visuais de src/lib/status.ts. */
export const CLIENT_STATUS_TOKEN: Record<ClientStatus, string> = {
  aguardando_assinatura: "pendente",
  aguardando_pagamento: "em_risco",
  aguardando_verificacao: "aguardando_cliente",
  pronto_para_liberar: "no_prazo",
  em_onboarding: "aguardando_cliente",
  finalizado: "concluido",
};

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

export function formatBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

/** Valor abreviado para caber em cards: "R$ 321,3 mil", "R$ 1,2 mi". Abaixo de R$ 1 mil usa o formato cheio. */
export function formatBRLCompact(v: number): string {
  if (v < 1000) return formatBRL(v);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(v);
}

export function commission(total: number, ratePercent: number): number {
  return Math.round(total * ratePercent) / 100;
}

export function canReleaseOnboarding(c: { paid: boolean; contract_signed: boolean; contract_verified_at: string | null; onboarding_released_at: string | null }): boolean {
  return c.paid && c.contract_signed && c.contract_verified_at !== null && c.onboarding_released_at === null;
}
