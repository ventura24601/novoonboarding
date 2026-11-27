/** Onboardings que os produtos contratados de um cliente disparam (vínculos produto → onboarding). */
export type ItemPlano = {
  produtoId: string;
  nome: string;
  cor: string;
  modelo: string | null;
  situacao: "criar" | "existe" | "sem_modelo";
  origem: string[];
  onboardingId: string | null;
};

/** Onboardings que os produtos contratados disparam, com o que já existe e o que falta modelo. */
export function planoDeOnboarding(args: {
  produtosCliente: string[];
  produtos: { id: string; nome: string; cor: string; ativo: boolean }[];
  vinculos: { produto_id: string; onboarding_produto_id: string }[];
  modelosPublicados: { produto_id: string; nome: string; versao: number }[];
  onboardings: { id: string; produto_id: string; status: string }[];
}): ItemPlano[] {
  const porId = new Map(args.produtos.map((p) => [p.id, p]));
  const itens = new Map<string, ItemPlano>();
  for (const nome of args.produtosCliente) {
    const vendido = args.produtos.find((p) => p.nome === nome && p.ativo);
    if (!vendido) continue;
    for (const v of args.vinculos.filter((x) => x.produto_id === vendido.id)) {
      const alvo = porId.get(v.onboarding_produto_id);
      if (!alvo) continue;
      const atual = itens.get(alvo.id);
      if (atual) {
        if (!atual.origem.includes(vendido.nome)) atual.origem.push(vendido.nome);
        continue;
      }
      const modelo = args.modelosPublicados.find((m) => m.produto_id === alvo.id);
      const existente = args.onboardings.find(
        (o) => o.produto_id === alvo.id && o.status !== "cancelado",
      );
      itens.set(alvo.id, {
        produtoId: alvo.id,
        nome: alvo.nome,
        cor: alvo.cor,
        modelo: modelo ? `${modelo.nome} v${modelo.versao}` : null,
        situacao: existente ? "existe" : modelo ? "criar" : "sem_modelo",
        origem: [vendido.nome],
        onboardingId: existente?.id ?? null,
      });
    }
  }
  return [...itens.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Entrada manual (downgrade/reonboarding): onboardings sugeridos pelos produtos que o cliente tem hoje na base
 * de clientes. Os nomes da base são comparados pelo nome unificado (produtoCanonico) e expandidos pelos vínculos.
 */
export function onboardingsSugeridos(args: {
  produtosBase: string[];
  produtos: { id: string; nome: string; ativo: boolean }[];
  vinculos: { produto_id: string; onboarding_produto_id: string }[];
  comModelo: Set<string>;
  canonico: (nome: string) => string;
}): string[] {
  const nomes = new Set(args.produtosBase.map((n) => args.canonico(n)));
  const out = new Set<string>();
  for (const p of args.produtos) {
    if (!p.ativo || !nomes.has(args.canonico(p.nome))) continue;
    for (const v of args.vinculos)
      if (v.produto_id === p.id && args.comModelo.has(v.onboarding_produto_id)) out.add(v.onboarding_produto_id);
  }
  return [...out];
}
