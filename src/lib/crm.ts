export const PRODUCTS = ["Black", "Redes", "WhatsApp", "Google", "Discador", "AppCrc", "IA Agendamento"] as const;

export const CLIENT_TYPES = [
  { value: "aluno", label: "Aluno" },
  { value: "nao_aluno", label: "Não aluno" },
] as const;

export type ClientStatus = "novo" | "aguardando_assinatura" | "em_onboarding" | "finalizado";

export interface StatusInput {
  contract_signed: boolean;
  whatsapp_group: boolean;
  onboarding_sent: boolean;
}

/** Novo: nada marcado. Aguardando assinatura: alguma etapa feita mas contrato não assinado.
 * Em onboarding: contrato assinado, faltam etapas. Finalizado: tudo marcado. */
export function clientStatus(c: StatusInput): ClientStatus {
  if (c.contract_signed && c.whatsapp_group && c.onboarding_sent) return "finalizado";
  if (c.contract_signed) return "em_onboarding";
  if (c.whatsapp_group || c.onboarding_sent) return "aguardando_assinatura";
  return "novo";
}

export const STATUS_LABEL: Record<ClientStatus, string> = {
  novo: "Novo",
  aguardando_assinatura: "Aguardando assinatura",
  em_onboarding: "Em onboarding",
  finalizado: "Finalizado",
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
