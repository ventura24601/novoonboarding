/**
 * Coleta dos pedidos de cancelamento na API de gestão (cancelamentoServicos/listarExterno) e gravação em
 * retencao_casos. Usado pela função agendada do Netlify (2x por dia) e pelo botão "Sincronizar agora".
 * Sem imports com "@/": este arquivo também é empacotado na função agendada.
 *
 * Formato da API (lista de objetos): id_solicitacao_cancelamento, id_cliente, nome, data_criacao ("dd/mm/aaaa hh:mm:ss"),
 * descricao_status (Pendente | Não Iniciado | Em Andamento | Finalizado), tipo_finalizacao (C cancelou, D downgrade,
 * X nenhum serviço cancelado), telefone_contato, nome_solicitante, descricao_motivo, descricao_detalhada,
 * data_preenchimento, data_finalizacao, nome_finalizou, downgrade, servicos_restantes,
 * servicos_solicitados_cancelamento [{nome_servico, cancelado}], anotacoes (JSON em texto), link.
 */

export type StatusApi =
  "nao_iniciado" | "pendente" | "em_andamento" | "revertido" | "downgrade" | "finalizado";

export type CasoApi = {
  origem_id: string;
  id_appcrc: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  email: string | null;
  solicitante: string | null;
  criado_por_nome: string | null;
  finalizado_por_nome: string | null;
  motivo_api: string | null;
  motivo_detalhe: string | null;
  data_solicitacao: string;
  data_preenchimento: string | null;
  data_finalizacao: string | null;
  formulario_preenchido: boolean;
  status_api: StatusApi;
  tipo_finalizacao: string | null;
  servicos: { nome: string; cancelado: boolean }[];
  servicos_restantes: string | null;
  anotacoes: { nome: string | null; data: string | null; texto: string }[];
  primeiro_contato_api: string | null;
  link: string | null;
  dados: Record<string, unknown>;
};

const texto = (v: unknown, max = 500) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s && !/^null$/i.test(s) ? s.slice(0, max) : null;
};

/** "30/07/2026 18:53:54" (horário de Brasília), "2026-08-05T10:57:42" (sem fuso = Brasília) ou ISO com fuso → ISO UTC. */
export function lerData(v: unknown): string | null {
  const s = texto(v, 40);
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, m, a, h = "00", mi = "00", se = "00"] = br;
    return new Date(`${a}-${m}-${d}T${h}:${mi}:${se}-03:00`).toISOString();
  }
  const iso = s.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (iso) {
    const d = new Date(`${iso[1]}T${iso[2] ?? "00:00:00"}${iso[4] ?? "-03:00"}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Status da API → status da Central. */
export function statusDaApi(
  descricao: unknown,
  tipoFinalizacao: unknown,
  downgrade: unknown,
): StatusApi {
  const d = semAcento(String(descricao ?? ""));
  if (d.startsWith("pendente")) return "pendente";
  if (d.startsWith("nao iniciado")) return "nao_iniciado";
  if (d.startsWith("em andamento")) return "em_andamento";
  if (d.startsWith("finalizado")) {
    const t = String(tipoFinalizacao ?? "")
      .trim()
      .toUpperCase();
    if (t === "D" || downgrade === true) return "downgrade";
    if (t === "X") return "revertido";
    return "finalizado";
  }
  return "nao_iniciado";
}

function lerAnotacoes(v: unknown) {
  let lista: unknown = v;
  if (typeof v === "string") {
    try {
      lista = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .map((a) => {
      const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      return {
        nome: texto(o["nome"], 120),
        data: lerData(o["data_anotacao"]),
        texto: texto(o["texto"], 2000) ?? "",
      };
    })
    .filter((a) => a.texto || a.data)
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
}

export function normalizarRegistro(r: Record<string, unknown>): CasoApi | null {
  const id = texto(r["id_solicitacao_cancelamento"]) ?? texto(r["uuid"]);
  const data = lerData(r["data_criacao"]);
  if (!id || !data) return null;
  const anotacoes = lerAnotacoes(r["anotacoes"]);
  const servicos = Array.isArray(r["servicos_solicitados_cancelamento"])
    ? (r["servicos_solicitados_cancelamento"] as Record<string, unknown>[]).map((s) => ({
        nome: texto(s?.["nome_servico"], 120) ?? "Serviço",
        cancelado: s?.["cancelado"] === true,
      }))
    : [];
  const preenchimento = lerData(r["data_preenchimento"]);
  return {
    origem_id: id,
    id_appcrc: texto(r["id_cliente"]),
    cliente_nome: texto(r["nome"], 200),
    telefone: texto(r["telefone_contato"], 40),
    email: texto(r["email"])?.toLowerCase() ?? null,
    solicitante: texto(r["nome_solicitante"], 120),
    criado_por_nome: texto(r["nome_criador"], 120),
    finalizado_por_nome: texto(r["nome_finalizou"], 120),
    motivo_api: texto(r["descricao_motivo"], 200),
    motivo_detalhe: texto(r["descricao_detalhada"], 4000),
    data_solicitacao: data,
    data_preenchimento: preenchimento,
    data_finalizacao: lerData(r["data_finalizacao"]),
    formulario_preenchido: !!preenchimento,
    status_api: statusDaApi(r["descricao_status"], r["tipo_finalizacao"], r["downgrade"]),
    tipo_finalizacao: texto(r["tipo_finalizacao"], 5),
    servicos,
    servicos_restantes: texto(r["servicos_restantes"], 500),
    anotacoes,
    primeiro_contato_api: anotacoes.find((a) => a.data)?.data ?? null,
    link: texto(r["link"], 300),
    dados: r,
  };
}

/** A lista vem direto (array) ou dentro de data/dados/registros. */
export function extrairLista(json: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(json))
    return json.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (json && typeof json === "object") {
    for (const k of ["data", "dados", "registros", "result", "items"]) {
      const v = (json as Record<string, unknown>)[k];
      if (Array.isArray(v)) return extrairLista(v);
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

/**
 * Coleta tudo (datas nulas). Novos entram com o status da API. Existentes: atualiza os dados da API e só troca
 * o status quando o status da API mudou desde a última coleta — assim o que o CS mudou aqui não é desfeito.
 */
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

    const anterior = new Map<string, string | null>();
    for (let i = 0; i < casos.length; i += 150) {
      const ids = casos
        .slice(i, i + 150)
        .map((c) => `"${c.origem_id.replace(/"/g, '\\"')}"`)
        .join(",");
      const q = await f(
        `${rest}/retencao_casos?select=origem_id,status_api&origem_id=in.(${encodeURIComponent(ids)})`,
        { headers: h },
      );
      if (!q.ok) throw new Error(`Supabase: ${await q.text()}`);
      for (const x of (await q.json()) as { origem_id: string; status_api: string | null }[])
        anterior.set(x.origem_id, x.status_api);
    }
    const agora = new Date().toISOString();
    const novos = casos
      .filter((c) => !anterior.has(c.origem_id))
      .map((c) => ({ ...c, status: c.status_api, sincronizado_em: agora }));
    const mudaram = casos
      .filter((c) => anterior.has(c.origem_id) && anterior.get(c.origem_id) !== c.status_api)
      .map((c) => ({ ...c, status: c.status_api, sincronizado_em: agora }));
    const iguais = casos
      .filter((c) => anterior.has(c.origem_id) && anterior.get(c.origem_id) === c.status_api)
      .map((c) => ({ ...c, sincronizado_em: agora }));

    const enviar = async (url: string, linhas: object[], prefer: string, rotulo: string) => {
      for (let i = 0; i < linhas.length; i += 200) {
        const w = await f(url, {
          method: "POST",
          headers: { ...h, Prefer: prefer },
          body: JSON.stringify(linhas.slice(i, i + 200)),
        });
        if (!w.ok) throw new Error(`Supabase (${rotulo}): ${(await w.text()).slice(0, 300)}`);
      }
    };
    await enviar(`${rest}/retencao_casos`, novos, "return=minimal", "novos");
    await enviar(
      `${rest}/retencao_casos?on_conflict=origem_id`,
      mudaram,
      "resolution=merge-duplicates,return=minimal",
      "status alterado",
    );
    await enviar(
      `${rest}/retencao_casos?on_conflict=origem_id`,
      iguais,
      "resolution=merge-duplicates,return=minimal",
      "atualização",
    );
    res = {
      ok: true,
      recebidos: lista.length,
      novos: novos.length,
      atualizados: mudaram.length + iguais.length,
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
