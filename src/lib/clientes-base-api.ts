/**
 * Base total de clientes (API de gestão: POST cliente/listarServicosExterno, body { chave }).
 * Resposta: [{ id_cliente, nome, contexto, sucessodonto, produtos: string[] }] — só a foto de hoje, sem datas.
 * A gravação (clientes, entradas/saídas de produto e foto do dia) é feita de uma vez pela função
 * sincronizar_clientes_base no banco.
 */
import { extrairLista } from "./retencao-api";

export type AmbienteBase = {
  apiUrl: string;
  chave: string;
  supabaseUrl: string;
  serviceKey: string;
  fetch?: typeof fetch;
};

export type ResultadoBase = {
  ok: boolean;
  recebidos: number;
  ativos: number;
  entradas: number;
  saidas: number;
  erro: string | null;
};

/** Só os campos usados, para a chamada ao banco ficar leve. */
export function enxugarCliente(r: Record<string, unknown>) {
  const id = r["id_cliente"];
  if (id == null || String(id).trim() === "") return null;
  const produtos = Array.isArray(r["produtos"])
    ? (r["produtos"] as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  return {
    id_cliente: String(id).trim(),
    nome: typeof r["nome"] === "string" ? r["nome"].slice(0, 200) : null,
    contexto: typeof r["contexto"] === "string" ? r["contexto"].slice(0, 80) : null,
    sucessodonto: r["sucessodonto"] === true,
    produtos,
  };
}

export async function sincronizarClientesBase(
  amb: AmbienteBase,
  origem: "agendado" | "manual",
): Promise<ResultadoBase> {
  const f = amb.fetch ?? fetch;
  const rest = `${amb.supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const h = {
    apikey: amb.serviceKey,
    Authorization: `Bearer ${amb.serviceKey}`,
    "Content-Type": "application/json",
  };
  let res: ResultadoBase = {
    ok: false,
    recebidos: 0,
    ativos: 0,
    entradas: 0,
    saidas: 0,
    erro: null,
  };
  try {
    const r = await f(amb.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ chave: amb.chave }),
    });
    const corpo = await r.text();
    if (!r.ok) throw new Error(`API respondeu ${r.status}: ${corpo.slice(0, 200)}`);
    let json: unknown;
    try {
      json = JSON.parse(corpo);
    } catch {
      throw new Error(`API não devolveu JSON: ${corpo.slice(0, 200)}`);
    }
    const lista = extrairLista(json);
    if (!lista) throw new Error(`Formato inesperado da API: ${corpo.slice(0, 200)}`);
    if (!lista.length) throw new Error("API devolveu a base vazia; coleta ignorada");
    const clientes = lista.map(enxugarCliente).filter((c) => !!c);
    const w = await f(`${rest}/rpc/sincronizar_clientes_base`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ clientes }),
    });
    const txt = await w.text();
    if (!w.ok) throw new Error(`Supabase: ${txt.slice(0, 300)}`);
    const out = JSON.parse(txt) as { ativos: number; entradas: number; saidas: number };
    res = {
      ok: true,
      recebidos: lista.length,
      ativos: out.ativos,
      entradas: out.entradas,
      saidas: out.saidas,
      erro: null,
    };
  } catch (e) {
    res.erro = e instanceof Error ? e.message.slice(0, 500) : String(e);
  }
  await f(`${rest}/clientes_base_sincronizacoes`, {
    method: "POST",
    headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify({ ...res, origem }),
  }).catch(() => undefined);
  return res;
}

/** Usa a mesma chave da API de retenção (CLIENTES_API_CHAVE, se um dia for outra). */
export function ambienteBase(env: Record<string, string | undefined>): AmbienteBase | null {
  const apiUrl =
    env["CLIENTES_API_URL"] ??
    "https://gestao.icomcomunicacao.com.br/api/cliente/listarServicosExterno";
  const chave = env["CLIENTES_API_CHAVE"] ?? env["RETENCAO_API_CHAVE"];
  const supabaseUrl = env["SUPABASE_URL"];
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!chave || !supabaseUrl || !serviceKey) return null;
  return { apiUrl, chave, supabaseUrl, serviceKey };
}
