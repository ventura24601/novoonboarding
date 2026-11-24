import { describe, expect, it } from "vitest";
import { contagem, linkWhatsapp, metricas, porSemana } from "./retencao";
import { extrairLista, lerData, normalizarRegistro, sincronizarRetencao } from "./retencao-api";

const agora = new Date("2026-11-24T12:00:00-03:00");
const base = {
  id: "1",
  primeiro_contato_em: null,
  prazo_resolucao: null,
  dias_uteis_restantes: null,
  encerrado_em: null,
  tags: [] as string[],
};

describe("contagem regressiva", () => {
  it("48h para o primeiro contato", () => {
    expect(
      contagem(
        { ...base, status: "nao_iniciado", data_solicitacao: "2026-11-24T08:00:00-03:00" },
        agora,
      ),
    ).toMatchObject({ tipo: "contato", nivel: "ok", texto: "Contato em 1d 20h" });
    expect(
      contagem(
        { ...base, status: "nao_iniciado", data_solicitacao: "2026-11-22T20:00:00-03:00" },
        agora,
      ),
    ).toMatchObject({ nivel: "alerta", texto: "Contato em 8h 0min" });
    expect(
      contagem(
        { ...base, status: "pendente", data_solicitacao: "2026-11-20T12:00:00-03:00" },
        agora,
      ),
    ).toMatchObject({ nivel: "atrasado", texto: "Contato atrasado 2d 0h" });
  });
  it("5 dias úteis em andamento", () => {
    const c = {
      ...base,
      status: "em_andamento",
      data_solicitacao: "2026-11-20",
      primeiro_contato_em: "2026-11-21",
    };
    expect(contagem({ ...c, dias_uteis_restantes: 3 }, agora)).toMatchObject({
      tipo: "resolucao",
      nivel: "ok",
      texto: "3 dias úteis restantes",
    });
    expect(contagem({ ...c, dias_uteis_restantes: 0 }, agora).texto).toBe("Prazo vence hoje");
    expect(contagem({ ...c, dias_uteis_restantes: -2 }, agora)).toMatchObject({
      nivel: "atrasado",
      texto: "Prazo vencido há 2 dias úteis",
    });
  });
  it("encerrados não contam prazo", () => {
    expect(
      contagem({ ...base, status: "revertido", data_solicitacao: "2026-11-01" }, agora).nivel,
    ).toBe("neutro");
  });
});

describe("métricas", () => {
  it("taxa de retenção, atrasos e tags", () => {
    const m = metricas(
      [
        {
          ...base,
          status: "revertido",
          data_solicitacao: "2026-11-20T10:00:00Z",
          primeiro_contato_em: "2026-11-20T20:00:00Z",
          tags: ["Preço"],
        },
        {
          ...base,
          status: "downgrade",
          data_solicitacao: "2026-11-20T10:00:00Z",
          primeiro_contato_em: "2026-11-23T10:00:00Z",
          tags: ["Preço", "VIP"],
        },
        {
          ...base,
          status: "finalizado",
          data_solicitacao: "2026-11-20T10:00:00Z",
          primeiro_contato_em: "2026-11-21T10:00:00Z",
        },
        { ...base, status: "nao_iniciado", data_solicitacao: "2026-11-20T10:00:00Z" },
      ],
      agora,
    );
    expect(m.total).toBe(4);
    expect(m.abertos).toBe(1);
    expect(m.taxaRetencao).toBeCloseTo(2 / 3);
    expect(m.taxaReversao).toBeCloseTo(1 / 3);
    expect(m.contatoAtrasado).toBe(1);
    expect(m.contatoNoPrazo).toBeCloseTo(2 / 3);
    expect(m.mediaHorasContato).toBeCloseTo((10 + 72 + 24) / 3);
    expect(m.tags[0]).toEqual(["Preço", 2]);
  });
  it("pedidos por semana", () => {
    const s = porSemana(
      [
        { data_solicitacao: "2026-11-24T10:00:00-03:00", status: "revertido" },
        { data_solicitacao: "2026-11-17T10:00:00-03:00", status: "finalizado" },
      ],
      2,
      agora,
    );
    expect(s.map((x) => [x.total, x.retidos, x.perdidos])).toEqual([
      [1, 0, 1],
      [1, 1, 0],
    ]);
  });
  it("link do WhatsApp", () => {
    expect(linkWhatsapp("(75) 99962-6185")).toBe("https://wa.me/5575999626185");
    expect(linkWhatsapp("123")).toBeNull();
  });
});

describe("leitura da API", () => {
  it("aceita nomes variados, datas BR e ISO e valores 'null'", () => {
    const c = normalizarRegistro({
      ID: 77,
      IDAPPCRC: "4521",
      Telefone: "(75) 99962-6185",
      "Data Solicitação Cancelamento": "20/11/2026 14:30",
      nome: "Clínica X",
      email: "null",
    })!;
    expect(c).toMatchObject({
      origem_id: "77",
      id_appcrc: "4521",
      telefone: "(75) 99962-6185",
      cliente_nome: "Clínica X",
      email: null,
    });
    expect(c.data_solicitacao).toBe("2026-11-20T17:30:00.000Z");
    expect(lerData("2026-11-20")).toBe("2026-11-20T03:00:00.000Z");
    expect(lerData("2026-11-20T10:00:00Z")).toBe("2026-11-20T10:00:00.000Z");
  });
  it("sem id usa appcrc + data; sem data descarta", () => {
    expect(normalizarRegistro({ id_appcrc: "9", data_solicitacao: "2026-11-01" })!.origem_id).toBe(
      "9|2026-11-01T03:00:00.000Z",
    );
    expect(normalizarRegistro({ id_appcrc: "9" })).toBeNull();
  });
  it("encontra a lista dentro do envelope", () => {
    expect(extrairLista({ data: { registros: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
    expect(extrairLista([{ a: 1 }, 2])).toEqual([{ a: 1 }]);
    expect(extrairLista({ ok: true })).toBeNull();
  });
  it("sincroniza: envia datas nulas, insere novos e atualiza existentes", async () => {
    const chamadas: { url: string; body?: unknown }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      chamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.startsWith("https://api"))
        return new Response(
          JSON.stringify([
            { id: 1, idappcrc: "A", telefone: "1199", data_solicitacao: "2026-11-20" },
            { id: 2, idappcrc: "B", telefone: "1198", data_solicitacao: "2026-11-21" },
          ]),
        );
      if (url.includes("select=origem_id"))
        return new Response(JSON.stringify([{ origem_id: "1" }]));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const r = await sincronizarRetencao(
      { apiUrl: "https://api/x", chave: "k", supabaseUrl: "https://sb", serviceKey: "s", fetch: f },
      "manual",
    );
    expect(r).toEqual({ ok: true, recebidos: 2, novos: 1, atualizados: 1, erro: null });
    expect(chamadas[0]!.body).toEqual({ chave: "k", data_inicial: null, data_final: null });
    const novos = chamadas.find((c) => c.url === "https://sb/rest/v1/retencao_casos")!.body as {
      status: string;
      origem_id: string;
    }[];
    expect(novos).toHaveLength(1);
    expect(novos[0]).toMatchObject({ origem_id: "2", status: "nao_iniciado" });
    const atual = chamadas.find((c) => c.url.includes("on_conflict=origem_id"))!.body as Record<
      string,
      unknown
    >[];
    expect(atual[0]).not.toHaveProperty("status");
    expect(chamadas.at(-1)!.url).toBe("https://sb/rest/v1/retencao_sincronizacoes");
  });
  it("registra o erro quando a API falha", async () => {
    const f = (async (url: string) =>
      url.startsWith("https://api")
        ? new Response('"Not found"', { status: 404 })
        : new Response(null, { status: 201 })) as typeof fetch;
    const r = await sincronizarRetencao(
      { apiUrl: "https://api/x", chave: "k", supabaseUrl: "https://sb", serviceKey: "s", fetch: f },
      "agendado",
    );
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("404");
  });
});
