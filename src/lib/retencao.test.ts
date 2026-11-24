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

import { churnPorProduto, porMesAnalise, porSemanaAnalise, tendencia } from "./retencao";

describe("análises", () => {
  const ref = new Date("2026-11-24T12:00:00-03:00"); // terça
  const casos = [
    {
      data_solicitacao: "2026-11-24T10:00:00-03:00",
      status: "finalizado",
      servicos: [
        { nome: "Discador", cancelado: true },
        { nome: "IA de Agendamento", cancelado: false },
      ],
    },
    {
      data_solicitacao: "2026-11-23T10:00:00-03:00",
      status: "revertido",
      servicos: [{ nome: "Discador", cancelado: false }],
    },
    {
      data_solicitacao: "2026-11-18T10:00:00-03:00",
      status: "downgrade",
      servicos: [{ nome: "Discador", cancelado: true }],
    },
    {
      data_solicitacao: "2026-10-05T10:00:00-03:00",
      status: "em_andamento",
      servicos: [{ nome: "Google", cancelado: false }],
    },
  ];
  it("semana a semana com variação", () => {
    const s = porSemanaAnalise(casos, 3, ref);
    expect(s.map((b) => [b.rotulo, b.pedidos, b.cancelados, b.retidos])).toEqual([
      ["09/11", 0, 0, 0],
      ["16/11", 1, 0, 1],
      ["23/11", 2, 1, 1],
    ]);
    expect(s[2]!.taxaCancelamento).toBeCloseTo(0.5);
    expect(s[2]!.varPedidos).toBeCloseTo(1);
    expect(s[1]!.varPedidos).toBeNull(); // de 0 para 1
  });
  it("mês a mês", () => {
    const m = porMesAnalise(casos, 2, ref);
    expect(m.map((b) => [b.rotulo, b.pedidos, b.abertos])).toEqual([
      ["out/26", 1, 1],
      ["nov/26", 3, 0],
    ]);
    expect(m[1]!.varPedidos).toBeCloseTo(2);
  });
  it("churn por produto entre pedidos encerrados", () => {
    const p = churnPorProduto(casos);
    expect(p[0]).toMatchObject({
      produto: "Discador",
      pedidos: 3,
      encerrados: 3,
      cancelados: 2,
      mantidos: 1,
    });
    expect(p[0]!.churn).toBeCloseTo(2 / 3);
    expect(p.find((x) => x.produto === "Google")).toMatchObject({ abertos: 1, churn: null });
  });
  it("tendência", () => {
    const sobe = tendencia([1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ pedidos: n }) as never));
    expect(sobe.direcao).toBe("subindo");
    expect(sobe.inclinacao).toBeCloseTo(1);
    expect(sobe.variacao4).toBeCloseTo((26 - 10) / 10);
    expect(sobe.movel[3]).toBeCloseTo(2.5);
    expect(tendencia([5, 5, 5, 5].map((n) => ({ pedidos: n }) as never)).direcao).toBe("estavel");
  });
});

import {
  casoDaLinha,
  noIntervalo,
  porPeriodoAnalise,
  produtoDaLinha,
  recortarLinha,
  resumoRelatorio,
} from "./retencao";

describe("relatório por linha e período", () => {
  const casos = [
    {
      data_solicitacao: "2026-11-10T10:00:00-03:00",
      status: "finalizado",
      motivo_api: "Preço Alto",
      servicos: [
        { nome: "Black", cancelado: true },
        { nome: "Discador", cancelado: true },
      ],
    },
    {
      data_solicitacao: "2026-11-12T10:00:00-03:00",
      status: "downgrade",
      motivo_api: "Preço Alto",
      servicos: [
        { nome: "Marketing Pro Black", cancelado: false },
        { nome: "Redes + IA (combo)", cancelado: true },
      ],
    },
    {
      data_solicitacao: "2026-10-01T10:00:00-03:00",
      status: "revertido",
      motivo_api: "Não usa o produto",
      servicos: [{ nome: "Redes Sociais", cancelado: false }],
    },
    {
      data_solicitacao: "2026-11-20T10:00:00-03:00",
      status: "em_andamento",
      motivo_api: null,
      servicos: [{ nome: "Google", cancelado: false }],
    },
  ];
  it("produtos da linha pelo nome (sem acento/maiúscula)", () => {
    expect(produtoDaLinha("Marketing Pro BLACK", "black")).toBe(true);
    expect(produtoDaLinha("Redes + IA (combo)", "redes")).toBe(true);
    expect(produtoDaLinha("Discador", "redes")).toBe(false);
    expect(casoDaLinha(casos[3]!, "black")).toBe(false);
  });
  it("recorta os casos e serviços da linha", () => {
    const b = recortarLinha(casos, "black");
    expect(b).toHaveLength(2);
    expect(b[0]!.servicos).toEqual([{ nome: "Black", cancelado: true }]);
    expect(recortarLinha(casos, null)).toHaveLength(4);
  });
  it("resumo do relatório", () => {
    const r = resumoRelatorio(recortarLinha(casos, "black"));
    expect(r).toMatchObject({
      pedidos: 2,
      cancelados: 1,
      downgrades: 1,
      retidos: 1,
      servicosCancelados: 1,
      servicosEncerrados: 2,
    });
    expect(r.churnServicos).toBeCloseTo(0.5);
    expect(r.taxaCancelamento).toBeCloseTo(0.5);
    expect(r.motivos[0]).toEqual(["Preço Alto", 2]);
  });
  it("intervalo de datas inclusivo", () => {
    expect(noIntervalo(casos, "2026-11-10", "2026-11-12")).toHaveLength(2);
    expect(noIntervalo(casos, null, "2026-10-31")).toHaveLength(1);
    expect(noIntervalo(casos, null, null)).toHaveLength(4);
  });
  it("semanas e meses cobrindo o intervalo", () => {
    const s = porPeriodoAnalise(
      casos,
      "semana",
      new Date("2026-11-01T12:00:00-03:00"),
      new Date("2026-11-24T12:00:00-03:00"),
    );
    expect(s.map((b) => b.rotulo)).toEqual(["26/10", "02/11", "09/11", "16/11", "23/11"]);
    expect(s.find((b) => b.rotulo === "09/11")!.pedidos).toBe(2);
    const m = porPeriodoAnalise(
      casos,
      "mes",
      new Date("2026-09-15T12:00:00-03:00"),
      new Date("2026-11-24T12:00:00-03:00"),
    );
    expect(m.map((b) => [b.rotulo, b.pedidos])).toEqual([
      ["set/26", 0],
      ["out/26", 1],
      ["nov/26", 3],
    ]);
  });
});

import {
  formularioPreenchido,
  funilRetencao,
  produtosDosPedidos,
  recortarProduto,
} from "./retencao";

describe("produto e funil", () => {
  const casos = [
    {
      data_solicitacao: "2026-11-01",
      status: "pendente",
      data_preenchimento: null,
      contato_feito_em: null,
      servicos: [{ nome: "Discador", cancelado: false }],
    },
    {
      data_solicitacao: "2026-11-02",
      status: "finalizado",
      data_preenchimento: "2026-11-02T10:00:00Z",
      contato_feito_em: "2026-11-03T10:00:00Z",
      servicos: [
        { nome: "Discador", cancelado: true },
        { nome: "Google", cancelado: true },
      ],
    },
    {
      data_solicitacao: "2026-11-03",
      status: "revertido",
      data_preenchimento: "2026-11-03T10:00:00Z",
      contato_feito_em: "2026-11-06T10:00:00Z",
      servicos: [{ nome: "Google", cancelado: false }],
    },
    {
      data_solicitacao: "2026-11-04",
      status: "nao_iniciado",
      data_preenchimento: "2026-11-04T10:00:00Z",
      contato_feito_em: null,
      servicos: [],
    },
  ];
  it("recorta por produto e lista os produtos", () => {
    const g = recortarProduto(casos, "Google");
    expect(g).toHaveLength(2);
    expect(g[0]!.servicos).toEqual([{ nome: "Google", cancelado: true }]);
    expect(produtosDosPedidos(casos)).toEqual([
      { nome: "Discador", n: 2 },
      { nome: "Google", n: 2 },
    ]);
  });
  it("formulário preenchido", () => {
    expect(casos.filter(formularioPreenchido)).toHaveLength(3);
  });
  it("funil", () => {
    const f = funilRetencao(casos);
    expect(f.etapas.map((e) => e.n)).toEqual([4, 3, 2, 2, 1]);
    expect(f.etapas[1]!.doAnterior).toBeCloseTo(0.75);
    expect(f.semFormulario).toBe(1);
    expect(f.mediaHorasContato).toBeCloseTo((24 + 72) / 2);
    expect(f.contatoEm48h).toBeCloseTo(0.5);
  });
});

import { servicosParaContagem } from "./retencao";

describe("regras de produto", () => {
  const S = (nome: string, cancelado = true) => ({ nome, cancelado });
  it("Black é pacote: conta 1 vez e os itens do pacote somem", () => {
    expect(
      servicosParaContagem([
        S("Discador"),
        S("Facebook"),
        S("Black"),
        S("Marketing Pro Black"),
        S("IA de vídeo"),
      ]),
    ).toEqual([S("Black")]);
    expect(servicosParaContagem([S("Marketing Pro Black", false), S("Google")])).toEqual([
      S("Black", false),
    ]);
  });
  it("Facebook conta como Redes (sem duplicar)", () => {
    expect(servicosParaContagem([S("Facebook"), S("IA de Agendamento", false)])).toEqual([
      S("Redes"),
      S("IA de Agendamento", false),
    ]);
    expect(servicosParaContagem([S("Facebook", false), S("Redes", true)])).toEqual([
      S("Redes", true),
    ]);
  });
  it("Discador só conta quando pedido sozinho", () => {
    expect(servicosParaContagem([S("Discador")])).toEqual([S("Discador")]);
    expect(servicosParaContagem([S("Discador"), S("Google")])).toEqual([S("Google")]);
    expect(servicosParaContagem([S("Discador Comercial"), S("Discador")])).toEqual([
      S("Discador Comercial"),
    ]);
    expect(servicosParaContagem([])).toEqual([]);
  });
});

describe("compararProdutos", () => {
  const agora = new Date("2026-03-20T12:00:00-03:00");
  const casos = [
    {
      data_solicitacao: "2026-03-18T10:00:00-03:00",
      status: "finalizado",
      servicos: [
        { nome: "Redes", cancelado: true },
        { nome: "Site", cancelado: false },
      ],
    },
    {
      data_solicitacao: "2026-03-17T10:00:00-03:00",
      status: "revertido",
      servicos: [{ nome: "Redes", cancelado: false }],
    },
    {
      data_solicitacao: "2026-02-10T10:00:00-03:00",
      status: "finalizado",
      servicos: [{ nome: "Site", cancelado: true }],
    },
    {
      data_solicitacao: "2026-03-19T10:00:00-03:00",
      status: "em_andamento",
      servicos: [{ nome: "Site", cancelado: true }],
    },
  ];
  it("conta cancelados, mantidos e em aberto por produto", () => {
    const { resumo } = compararProdutos(casos, ["Redes", "Site"], "mes", null, null, agora);
    expect(resumo).toEqual([
      {
        produto: "Redes",
        pedidos: 2,
        encerrados: 2,
        cancelados: 1,
        mantidos: 1,
        abertos: 0,
        churn: 0.5,
        participacao: 0.5,
      },
      {
        produto: "Site",
        pedidos: 3,
        encerrados: 2,
        cancelados: 1,
        mantidos: 1,
        abertos: 1,
        churn: 0.5,
        participacao: 0.5,
      },
    ]);
  });
  it("série de cancelados por mês, uma coluna por produto", () => {
    const { serie } = compararProdutos(casos, ["Redes", "Site"], "mes", null, null, agora);
    expect(serie).toHaveLength(12);
    expect(serie.at(-1)).toEqual({ rotulo: "mar/26", Redes: 1, Site: 0 });
    expect(serie.at(-2)).toEqual({ rotulo: "fev/26", Redes: 0, Site: 1 });
  });
});
import { compararProdutos } from "./retencao";
