/**
 * Webhook de vendas: lê o corpo (JSON, formulário ou linhas "campo:valor"), normaliza e autentica.
 * Funções puras, usadas pela rota /api/public/vendas e pelos testes.
 */

export type VendaNormalizada = {
  chave: string;
  tipo: string | null;
  nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  whatsapp2: string | null;
  email: string | null;
  condicao_pagamento: string | null;
  meio_pagamento: string | null;
  vendedor: string | null;
  vendedor_email: string | null;
  id_cliente: string | null;
  id_cliente_appcrc: string | null;
  id_cliente_smarttv: string | null;
  curso_acesso: Record<string, string>;
  payload: Record<string, string | null>;
};

const LIMITE = 64 * 1024;

/** "null", "undefined" e vazio viram null; o resto é texto aparado (até 500 caracteres). */
export function valor(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = (typeof v === "object" ? JSON.stringify(v) : String(v)).trim();
  if (!s || /^(null|undefined|none|nil)$/i.test(s)) return null;
  return s.slice(0, 500);
}

/** Linhas "campo:valor" (formato colado/texto). */
export function lerLinhas(texto: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const linha of texto.split(/\r?\n/)) {
    const i = linha.indexOf(":");
    if (i <= 0) continue;
    const k = linha.slice(0, i).trim();
    if (/^[\w.-]{1,60}$/.test(k)) out[k] = linha.slice(i + 1).trim();
  }
  return out;
}

const digitos = (s: string | null) => (s ? s.replace(/\D/g, "") || null : null);

async function sha256(texto: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normaliza um registro de venda. A chave é o hash do conteúdo (mesma venda reenviada = mesma chave). */
export async function normalizarVenda(
  bruto: Record<string, unknown>,
): Promise<VendaNormalizada | null> {
  const p: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(bruto).slice(0, 100))
    p[k.trim().toLowerCase().slice(0, 60)] = valor(v);
  const g = (k: string) => p[k] ?? null;
  const nome = g("nome") ?? g("razao_social") ?? g("cliente");
  const cnpj = digitos(g("cnpj") ?? g("cpf_cnpj") ?? g("documento"));
  const email = g("email")?.toLowerCase() ?? null;
  if (!nome && !cnpj && !email) return null;
  const curso: Record<string, string> = {};
  for (const k of ["nome", "cpf", "email", "contato"]) {
    const v = g(`curso_acesso_${k}`);
    if (v) curso[k] = v;
  }
  const ordenado = Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b)));
  return {
    chave: await sha256(JSON.stringify(ordenado)),
    tipo: g("tipo"),
    nome,
    cnpj,
    telefone: g("telefone"),
    whatsapp: g("whatsapp"),
    whatsapp2: g("whatsapp2"),
    email,
    condicao_pagamento: g("condicao_pagamento"),
    meio_pagamento: g("meio_pagamento"),
    vendedor: g("vendedor"),
    vendedor_email: g("vendedor_email")?.toLowerCase() ?? null,
    id_cliente: g("id_cliente"),
    id_cliente_appcrc: g("id_cliente_appcrc"),
    id_cliente_smarttv: g("id_cliente_smarttv"),
    curso_acesso: curso,
    payload: p,
  };
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Token em "Authorization: Bearer ..." ou "X-Webhook-Token". */
export function tokenValido(headers: Headers, tokens: string[]) {
  const auth = headers.get("authorization") ?? "";
  const recebido = (
    auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7)
      : (headers.get("x-webhook-token") ?? "")
  ).trim();
  return !!recebido && tokens.some((t) => iguais(recebido, t));
}

async function lerTexto(request: Request): Promise<string | "grande"> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    tamanho += value.byteLength;
    if (tamanho > LIMITE) {
      await reader.cancel();
      return "grande";
    }
    partes.push(value);
  }
  const out = new Uint8Array(tamanho);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.byteLength;
  }
  return new TextDecoder().decode(out);
}

/** Lista de registros a partir do corpo, conforme o content-type. */
export function lerRegistros(texto: string, contentType: string): Record<string, unknown>[] | null {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded"))
    return [Object.fromEntries(new URLSearchParams(texto))];
  const t = texto.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const j: unknown = JSON.parse(t);
      const lista = Array.isArray(j) ? j : [j];
      if (lista.length > 50 || !lista.every((x) => x && typeof x === "object" && !Array.isArray(x)))
        return null;
      return lista as Record<string, unknown>[];
    } catch {
      return null;
    }
  }
  const linhas = lerLinhas(t);
  return Object.keys(linhas).length ? [linhas] : null;
}

export type GravadorVendas = {
  gravar: (v: VendaNormalizada) => Promise<{ id: string; nova: boolean }>;
};

export async function receberVendas(
  request: Request,
  tokens: string[],
  gravador: GravadorVendas,
): Promise<Response> {
  if (!tokens.length)
    return Response.json({ error: "Webhook de vendas não configurado." }, { status: 503 });
  if (!tokenValido(request.headers, tokens))
    return Response.json({ error: "Token inválido." }, { status: 401 });
  const texto = await lerTexto(request);
  if (texto === "grande") return Response.json({ error: "Corpo excede 64 KiB." }, { status: 413 });
  const registros = lerRegistros(texto, request.headers.get("content-type") ?? "");
  if (!registros?.length) {
    return Response.json(
      { error: "Envie um objeto JSON (ou lista de até 50), formulário ou linhas campo:valor." },
      { status: 400 },
    );
  }
  const resultados: { id: string; status: "recebida" | "duplicada" }[] = [];
  try {
    for (const r of registros) {
      const v = await normalizarVenda(r);
      if (!v)
        return Response.json(
          { error: "Cada venda precisa de nome, CNPJ ou e-mail." },
          { status: 422 },
        );
      const { id, nova } = await gravador.gravar(v);
      resultados.push({ id, status: nova ? "recebida" : "duplicada" });
    }
  } catch (e) {
    console.error("[vendas] falha ao gravar", e instanceof Error ? e.message : e);
    return Response.json({ error: "Falha ao gravar." }, { status: 500 });
  }
  return Response.json({ received: true, vendas: resultados }, { status: 201 });
}

export function tokensConfigurados() {
  return (process.env["VENDAS_WEBHOOK_TOKEN"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Texto para a observação geral do cliente com o que veio da venda e não tem campo próprio. */
export function observacaoDaVenda(v: {
  tipo: string | null;
  condicao_pagamento: string | null;
  meio_pagamento: string | null;
  whatsapp2: string | null;
  vendedor: string | null;
  vendedor_email: string | null;
  id_cliente: string | null;
  id_cliente_appcrc: string | null;
  id_cliente_smarttv: string | null;
  curso_acesso: unknown;
  recebido_em: string;
}) {
  const curso = (
    v.curso_acesso && typeof v.curso_acesso === "object" ? v.curso_acesso : {}
  ) as Record<string, string>;
  const linhas = [
    `Venda automática recebida em ${new Date(v.recebido_em).toLocaleString("pt-BR")}${v.tipo ? ` (${v.tipo})` : ""}.`,
    v.meio_pagamento && `Meio de pagamento: ${v.meio_pagamento}`,
    v.condicao_pagamento && `Condição: ${v.condicao_pagamento}`,
    v.whatsapp2 && `WhatsApp 2: ${v.whatsapp2}`,
    (v.vendedor || v.vendedor_email) &&
      `Vendedor informado: ${[v.vendedor, v.vendedor_email].filter(Boolean).join(" · ")}`,
    v.id_cliente && `ID cliente: ${v.id_cliente}`,
    v.id_cliente_appcrc && `ID AppCRC: ${v.id_cliente_appcrc}`,
    v.id_cliente_smarttv && `ID SmartTV: ${v.id_cliente_smarttv}`,
    Object.keys(curso).length > 0 &&
      `Acesso ao curso: ${["nome", "cpf", "email", "contato"]
        .map((k) => curso[k])
        .filter(Boolean)
        .join(" · ")}`,
  ];
  return linhas.filter(Boolean).join("\n");
}

/** CNPJ/CPF com máscara para exibição. */
export function formatarDocumento(d: string | null) {
  if (!d) return "";
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
}
