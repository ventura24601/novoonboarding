import { describe, expect, it } from "vitest";
import { contagem, linkWhatsapp, metricas, porSemana } from "./retencao";
import {
  extrairLista,
  lerData,
  normalizarRegistro,
  statusDaApi,
  sincronizarRetencao,
} from "./retencao-api";

const agora = new Date("2026-11-24T12:00:00-03:00");
const base = {
  id: "1",
  primeiro_contato_em: null,
  contato_feito_em: null,
  prazo_resolucao: null,
  dias_uteis_restantes: null,
  encerrado_em: null,
  tags: [] as string[],
};

describe("contagem regressiva", () => {
  it("48h para o 1º contato contam do preenchimento do formulário", () => {
    const c = { ...base, status: "nao_iniciado", data_solicitacao: "2026-11-01T08:00:00-03:00" };
    expect(
      contagem({ ...c, data_preenchimento: "2026-11-24T08:00:00-03:00" }, agora),
    ).toMatchObject({ tipo: "contato", nivel: "ok", texto: "Contato em 1d 20h" });
    expect(
      contagem({ ...c, data_preenchimento: "2026-11-22T20:00:00-03:00" }, agora),
    ).toMatchObject({ nivel: "alerta", texto: "Contato em 8h 0min" });
    expect(
      contagem({ ...c, data_preenchimento: "2026-11-20T12:00:00-03:00" }, agora),
    ).toMatchObject({ nivel: "atrasado", texto: "Contato atrasado 2d 0h" });
  });
  it("anotação na gestão conta como contato feito", () => {
    expect(
      contagem(
        {
          ...base,
          status: "nao_iniciado",
          data_solicitacao: "2026-11-01",
          contato_feito_em: "2026-11-02",
        },
        agora,
      ).texto,
    ).toBe("Contato feito");
  });
  it("pendente aguarda o formulário (sem prazo de 48h)", () => {
    expect(
      contagem(
        { ...base, status: "pendente", data_solicitacao: "2026-11-20T12:00:00-03:00" },
        agora,
      ),
    ).toMatchObject({ nivel: "neutro", texto: "Aguardando formulário há 4d" });
  });
  it("5 dias úteis em andamento", () => {
    const c = {
      ...base,
      status: "em_andamento",
      data_solicitacao: "2026-11-20",
      contato_feito_em: "2026-11-21",
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
  it("taxa de retenção, atrasos, motivos e tags", () => {
    const m = metricas(
      [
        {
          ...base,
          status: "revertido",
          data_solicitacao: "2026-11-20T10:00:00Z",
          data_preenchimento: "2026-11-20T10:00:00Z",
          contato_feito_em: "2026-11-20T20:00:00Z",
          tags: ["Preço"],
          motivo_api: "Preço Alto",
        },
        {
          ...base,
          status: "downgrade",
          data_solicitacao: "2026-11-20T10:00:00Z",
          contato_feito_em: "2026-11-23T10:00:00Z",
          tags: ["Preço", "VIP"],
          motivo_api: "Preço Alto",
        },
        {
          ...base,
          status: "finalizado",
          data_solicitacao: "2026-11-20T10:00:00Z",
          contato_feito_em: "2026-11-21T10:00:00Z",
          motivo_api: "Não usa o produto",
        },
        {
          ...base,
          status: "nao_iniciado",
          data_solicitacao: "2026-11-20T10:00:00Z",
          data_preenchimento: "2026-11-20T10:00:00Z",
        },
      ],
      agora,
    );
    expect(m.total).toBe(4);
    expect(m.abertos).toBe(1);
    expect(m.taxaRetencao).toBeCloseTo(2 / 3);
    expect(m.contatoAtrasado).toBe(1);
    expect(m.contatoNoPrazo).toBeCloseTo(2 / 3);
    expect(m.mediaHorasContato).toBeCloseTo((10 + 72 + 24) / 3);
    expect(m.tags[0]).toEqual(["Preço", 2]);
    expect(m.motivos[0]).toEqual(["Preço Alto", 2]);
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
    expect(linkWhatsapp("11999798084")).toBe("https://wa.me/5511999798084");
    expect(linkWhatsapp("123")).toBeNull();
  });
});

// Registro no formato real da API (dados trocados).
const registro = {
  id_solicitacao_cancelamento: 120,
  uuid: "AAAA-BBBB",
  id_cliente: 1655,
  nome: "Clínica Exemplo",
  nome_criador: "Fulano",
  data_criacao: "30/07/2026 18:53:54",
  descricao_status: "Em Andamento",
  nome_solicitante: "Ana",
  telefone_contato: "11999798084",
  descricao_motivo: "Insatisfação com o(s) serviço(s)",
  descricao_detalhada: "Texto longo",
  data_preenchimento: "05/08/2026 10:11:29",
  data_finalizacao: null,
  nome_finalizou: null,
  downgrade: null,
  servicos_restantes: null,
  tipo_finalizacao: null,
  servicos_solicitados_cancelamento: [
    { id_servico: 1, cancelado: false, nome_servico: "Discador" },
    { id_servico: 2, cancelado: true, nome_servico: "IA de vídeo" },
  ],
  anotacoes: JSON.stringify([
    { nome: "CS", data_anotacao: "2026-08-07T15:10:45", texto: "Segundo contato" },
    { nome: "CS", data_anotacao: "2026-08-05T10:57:42", texto: "Acionei o cliente" },
  ]),
  link: "https://gestao.exemplo/cancelamento/form/AAAA",
};

describe("leitura da API", () => {
  it("converte o registro real", () => {
    const c = normalizarRegistro(registro)!;
    expect(c).toMatchObject({
      origem_id: "120",
      id_appcrc: "1655",
      cliente_nome: "Clínica Exemplo",
      telefone: "11999798084",
      solicitante: "Ana",
      motivo_api: "Insatisfação com o(s) serviço(s)",
      status_api: "em_andamento",
      formulario_preenchido: true,
      servicos: [
        { nome: "Discador", cancelado: false },
        { nome: "IA de vídeo", cancelado: true },
      ],
    });
    expect(c.data_solicitacao).toBe("2026-07-30T21:53:54.000Z");
    expect(c.anotacoes.map((a) => a.texto)).toEqual(["Acionei o cliente", "Segundo contato"]);
    expect(c.primeiro_contato_api).toBe("2026-08-05T13:57:42.000Z");
  });
  it("mapeia os status da API", () => {
    expect(statusDaApi("Pendente", null, null)).toBe("pendente");
    expect(statusDaApi("Não Iniciado", null, null)).toBe("nao_iniciado");
    expect(statusDaApi("Em Andamento", null, null)).toBe("em_andamento");
    expect(statusDaApi("Finalizado", "C", false)).toBe("finalizado");
    expect(statusDaApi("Finalizado", "D", true)).toBe("downgrade");
    expect(statusDaApi("Finalizado", "X", false)).toBe("revertido");
  });
  it("datas e lista", () => {
    expect(lerData("2026-08-05T10:57:42")).toBe("2026-08-05T13:57:42.000Z");
    expect(lerData("2026-11-20T10:00:00Z")).toBe("2026-11-20T10:00:00.000Z");
    expect(lerData(null)).toBeNull();
    expect(normalizarRegistro({ nome: "sem id" })).toBeNull();
    expect(extrairLista({ data: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(extrairLista("Not found")).toBeNull();
  });
  it("sincroniza: datas nulas, novos com status da API e status só muda quando a API muda", async () => {
    const chamadas: { url: string; body?: unknown }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      chamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.startsWith("https://api"))
        return new Response(
          JSON.stringify([
            { ...registro, id_solicitacao_cancelamento: 1, descricao_status: "Em Andamento" }, // igual ao anterior
            {
              ...registro,
              id_solicitacao_cancelamento: 2,
              descricao_status: "Finalizado",
              tipo_finalizacao: "X",
            }, // mudou
            { ...registro, id_solicitacao_cancelamento: 3, descricao_status: "Não Iniciado" }, // novo
          ]),
        );
      if (url.includes("select=origem_id"))
        return new Response(
          JSON.stringify([
            { origem_id: "1", status_api: "em_andamento" },
            { origem_id: "2", status_api: "em_andamento" },
          ]),
        );
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const r = await sincronizarRetencao(
      { apiUrl: "https://api/x", chave: "k", supabaseUrl: "https://sb", serviceKey: "s", fetch: f },
      "manual",
    );
    expect(r).toEqual({ ok: true, recebidos: 3, novos: 1, atualizados: 2, erro: null });
    expect(chamadas[0]!.body).toEqual({ chave: "k", data_inicial: null, data_final: null });
    const escritas = chamadas.filter(
      (c) => c.url.startsWith("https://sb/rest/v1/retencao_casos") && !c.url.includes("select="),
    );
    const [novos, mudaram, iguais] = escritas.map((c) => c.body as Record<string, unknown>[]);
    expect(novos![0]).toMatchObject({ origem_id: "3", status: "nao_iniciado" });
    expect(mudaram![0]).toMatchObject({
      origem_id: "2",
      status: "revertido",
      status_api: "revertido",
    });
    expect(iguais![0]).toMatchObject({ origem_id: "1", status_api: "em_andamento" });
    expect(iguais![0]).not.toHaveProperty("status");
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
