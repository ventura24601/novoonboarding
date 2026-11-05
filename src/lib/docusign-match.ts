/** Sugestões de cliente para um envelope sem vínculo automático (tela de Assinaturas). */

export type ClienteBusca = {
  id: string;
  clinic_name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  codigo_externo: string | null;
};

export type EnvelopeBusca = {
  assunto: string | null;
  signatarios: { nome: string | null; email: string | null }[];
  documentos: string[];
  campos: Record<string, string>;
};

export type Sugestao = { cliente: ClienteBusca; pontos: number; motivos: string[] };

const VAZIAS = new Set([
  "clinica",
  "clinicas",
  "odontologia",
  "odonto",
  "odontologica",
  "consultorio",
  "centro",
  "instituto",
  "ltda",
  "me",
  "eireli",
  "sa",
  "s",
  "a",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "contrato",
  "prestacao",
  "servicos",
  "servico",
  "icom",
  "proposta",
  "assinatura",
]);

export function palavras(t: string | null | undefined) {
  return new Set(
    (t ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length > 1 && !VAZIAS.has(p)),
  );
}

const digitos = (t: string | null) => (t ?? "").replace(/\D/g, "");

export function sugerirClientes(
  env: EnvelopeBusca,
  clientes: ClienteBusca[],
  limite = 5,
): Sugestao[] {
  const emails = new Set(env.signatarios.map((s) => s.email?.toLowerCase().trim()).filter(Boolean));
  const textoEnv = palavras(
    [env.assunto, ...env.signatarios.map((s) => s.nome), ...Object.values(env.campos)].join(" "),
  );
  const valores = new Set(Object.values(env.campos).map((v) => v.trim()));
  const out: Sugestao[] = [];
  for (const c of clientes) {
    let pontos = 0;
    const motivos: string[] = [];
    const doc = digitos(c.document);
    if (doc && env.documentos.includes(doc)) {
      pontos += 100;
      motivos.push("CPF/CNPJ igual");
    }
    if (c.codigo_externo && valores.has(c.codigo_externo)) {
      pontos += 100;
      motivos.push("Código do cliente");
    }
    if (c.email && emails.has(c.email.toLowerCase().trim())) {
      pontos += 60;
      motivos.push("E-mail do signatário");
    }
    const nome = palavras(`${c.clinic_name} ${c.legal_name ?? ""}`);
    if (nome.size) {
      let comuns = 0;
      for (const p of nome) if (textoEnv.has(p)) comuns++;
      if (comuns) {
        const frac = comuns / nome.size;
        pontos += Math.round(40 * frac);
        if (frac >= 0.5) motivos.push("Nome parecido");
      }
    }
    if (pontos >= 20) out.push({ cliente: c, pontos, motivos });
  }
  return out.sort((a, b) => b.pontos - a.pontos).slice(0, limite);
}
