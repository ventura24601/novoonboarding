/** Rótulos e cores do status de modelo de onboarding. */
const STATUS_MODELO = {
  publicado: { label: "Publicado", cls: "bg-[#D1FAE5] text-[#065F46]" },
  rascunho: { label: "Rascunho", cls: "bg-[#FEF3C7] text-[#B45309]" },
  arquivado: { label: "Arquivado", cls: "bg-[#F1F5F9] text-[#94A3B8] line-through" },
} satisfies Record<string, { label: string; cls: string }>;

export function statusModelo(s: string) {
  return STATUS_MODELO[s as keyof typeof STATUS_MODELO] ?? STATUS_MODELO.rascunho;
}

export type ItemOrdem = { tipo: "fase"; id: string } | { tipo: "etapa"; id: string };

/**
 * Lista plana [fase, etapas..., fase, etapas...] → ordem final das etapas com a fase de cada uma
 * (a fase é o cabeçalho mais próximo acima). Etapas antes do primeiro cabeçalho ficam na primeira fase.
 */
export function ordemDasEtapas(itens: ItemOrdem[]): { id: string; fase_id: string | null }[] {
  const primeiraFase = itens.find((i) => i.tipo === "fase")?.id ?? null;
  let fase: string | null = primeiraFase;
  const out: { id: string; fase_id: string | null }[] = [];
  for (const i of itens) {
    if (i.tipo === "fase") fase = i.id;
    else out.push({ id: i.id, fase_id: fase });
  }
  return out;
}
