/**
 * Coleta dos pedidos de cancelamento na API de gestão e gravação em retencao_casos.
 * Usado pela função agendada do Netlify (2x por dia) e pelo botão "Sincronizar agora".
 * Sem imports com "@/": este arquivo também é empacotado na função agendada.
 *
 * O formato da resposta da API ainda não foi confirmado: `normalizarRegistro` aceita os nomes mais prováveis
 * de cada campo (sem diferenciar maiúsculas, acentos, "_" ou espaços). Ajuste aqui se a API usar outros nomes.
 */

export type CasoApi = {
  origem_id: string;
  id_appcrc: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  email: string | null;
  motivo_api: string | null;
  data_solicitacao: string;
  formulario_preenchido: boolean | null;
  dados: Record<string, unknown>;
};

const chaveNorm = (k: string) =>
  k
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function campo(r: Record<string, unknown>, nomes: string[]): unknown {
  const mapa = new Map(Object.entries(r).map(([k, v]) => [chaveNorm(k), v]));
  for (const n of nomes) {
    const v = mapa.get(chaveNorm(n));
    if (
      v !== undefined &&
      v !== null &&
      String(v).trim() !== "" &&
      !/^null$/i.test(String(v).trim())
    )
      return v;
  }
  return null;
}
const texto = (v: unknown) => (v == null ? null : String(v).trim().slice(0, 300) || null);

/** "2026-11-20", "2026-11-20 14:30:00", "20/11/2026", "20/11/2026 14:30" → ISO. */
export function lerData(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, m, a, h = "00", mi = "00", se = "00"] = br;
    return new Date(`${a}-${m}-${d}T${h}:${mi}:${se}-03:00`).toISOString();
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?(.*)$/);
  if (iso) {
    const resto = iso[3] ?? "";
    const temFuso = /Z|[+-]\d{2}:?\d{2}$/.test(resto);
    const d = new Date(
      `${iso[1]}T${iso[2] ?? "00:00:00"}${temFuso ? resto.replace(/^\.\d+/, "") : "-03:00"}`,
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function booleano(v: unknown): boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "sim", "s", "yes", "preenchido"].includes(s)) return true;
  if (["0", "false", "nao", "não", "n", "no", "pendente"].includes(s)) return false;
  return null;
}

export function normalizarRegistro(r: Record<string, unknown>): CasoApi | null {
  const idAppcrc = texto(
    campo(r, ["idappcrc", "id_appcrc", "id_cliente_appcrc", "appcrc", "cliente_appcrc"]),
  );
  const telefone = texto(
    campo(r, ["telefone", "whatsapp", "celular", "fone", "contato", "telefone_cliente"]),
  );
  const data = lerData(
    campo(r, [
      "data_solicitacao_cancelamento",
      "data_solicitacao",
      "datasolicitacao",
      "data_cancelamento",
      "data_pedido",
      "dt_solicitacao",
      "data",
      "created_at",
      "criado_em",
      "data_cadastro",
    ]),
  );
  const idOrigem = texto(
    campo(r, ["id", "id_cancelamento", "idcancelamento", "id_solicitacao", "codigo", "protocolo"]),
  );
  if (!data || (!idAppcrc && !telefone && !idOrigem)) return null;
  return {
    origem_id: idOrigem ?? `${idAppcrc ?? telefone}|${data}`,
    id_appcrc: idAppcrc,
    cliente_nome: texto(
      campo(r, ["nome", "cliente", "nome_cliente", "razao_social", "clinica", "nome_fantasia"]),
    ),
    telefone,
    email: texto(campo(r, ["email", "e_mail", "email_cliente"]))?.toLowerCase() ?? null,
    motivo_api: texto(
      campo(r, ["motivo", "motivo_cancelamento", "observacao", "descricao", "servico", "servicos"]),
    ),
    data_solicitacao: data,
    formulario_preenchido: booleano(
      campo(r, [
        "formulario_preenchido",
        "preencheu_formulario",
        "formulario",
        "status_formulario",
      ]),
    ),
    dados: r,
  };
}

/** A lista pode vir direto ou dentro de data/dados/registros/result/items. */
export function extrairLista(json: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(json))
    return json.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (json && typeof json === "object") {
    for (const k of [
      "data",
      "dados",
      "registros",
      "result",
      "resultado",
      "items",
      "lista",
      "cancelamentos",
    ]) {
      const v = (json as Record<string, unknown>)[k];
      if (Array.isArray(v)) return extrairLista(v);
      if (v && typeof v === "object") {
        const dentro = extrairLista(v);
        if (dentro) return dentro;
      }
    }
  }
  return null;
}

export type ResultadoSync = {
  ok: boolean;
  recebidos: number;
  novos: number;
  atualizados: number;
  erro: string | null;
};

type Ambiente = {
  apiUrl: string;
  chave: string;
  supabaseUrl: string;
  serviceKey: string;
  fetch?: typeof fetch;
};

/** Coleta tudo (datas nulas), insere os novos como "não iniciado" e atualiza só os dados da API dos existentes. */
export async function sincronizarRetencao(
  amb: Ambiente,
  origem: "agendado" | "manual",
): Promise<ResultadoSync> {
  const f = amb.fetch ?? fetch;
  const rest = `${amb.supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const h = {
    apikey: amb.serviceKey,
    Authorization: `Bearer ${amb.serviceKey}`,
    "Content-Type": "application/json",
  };
  let res: ResultadoSync = { ok: false, recebidos: 0, novos: 0, atualizados: 0, erro: null };
  try {
    const r = await f(amb.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ chave: amb.chave, data_inicial: null, data_final: null }),
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
    const casos = lista.map(normalizarRegistro).filter((c): c is CasoApi => !!c);
    res.recebidos = lista.length;

    const existentes = new Set<string>();
    for (let i = 0; i < casos.length; i += 200) {
      const ids = casos
        .slice(i, i + 200)
        .map((c) => `"${c.origem_id.replace(/"/g, '\\"')}"`)
        .join(",");
      const q = await f(
        `${rest}/retencao_casos?select=origem_id&origem_id=in.(${encodeURIComponent(ids)})`,
        { headers: h },
      );
      if (!q.ok) throw new Error(`Supabase: ${await q.text()}`);
      for (const x of (await q.json()) as { origem_id: string }[]) existentes.add(x.origem_id);
    }
    const agora = new Date().toISOString();
    const novos = casos
      .filter((c) => !existentes.has(c.origem_id))
      .map((c) => ({ ...c, status: "nao_iniciado", sincronizado_em: agora }));
    const antigos = casos
      .filter((c) => existentes.has(c.origem_id))
      .map((c) => ({ ...c, sincronizado_em: agora }));
    for (let i = 0; i < novos.length; i += 500) {
      const w = await f(`${rest}/retencao_casos`, {
        method: "POST",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify(novos.slice(i, i + 500)),
      });
      if (!w.ok) throw new Error(`Supabase (novos): ${await w.text()}`);
    }
    for (let i = 0; i < antigos.length; i += 500) {
      const w = await f(`${rest}/retencao_casos?on_conflict=origem_id`, {
        method: "POST",
        headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(antigos.slice(i, i + 500)),
      });
      if (!w.ok) throw new Error(`Supabase (atualização): ${await w.text()}`);
    }
    res = {
      ok: true,
      recebidos: lista.length,
      novos: novos.length,
      atualizados: antigos.length,
      erro: null,
    };
  } catch (e) {
    res.erro = e instanceof Error ? e.message.slice(0, 500) : String(e);
  }
  await f(`${rest}/retencao_sincronizacoes`, {
    method: "POST",
    headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify({
      ok: res.ok,
      recebidos: res.recebidos,
      novos: res.novos,
      atualizados: res.atualizados,
      erro: res.erro,
      origem,
    }),
  }).catch(() => undefined);
  return res;
}

export function ambienteRetencao(env: Record<string, string | undefined>): Ambiente | null {
  const apiUrl =
    env["RETENCAO_API_URL"] ??
    "https://gestao.icomcomunicacao.com.br/api/cancelamentoServicos/listarExterno";
  const chave = env["RETENCAO_API_CHAVE"];
  const supabaseUrl = env["SUPABASE_URL"];
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!chave || !supabaseUrl || !serviceKey) return null;
  return { apiUrl, chave, supabaseUrl, serviceKey };
}
