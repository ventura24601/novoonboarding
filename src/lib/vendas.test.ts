import { describe, expect, it } from "vitest";
import {
  lerLinhas,
  lerRegistros,
  normalizarVenda,
  observacaoDaVenda,
  receberVendas,
  tokenValido,
  valor,
  type VendaNormalizada,
} from "./vendas";

const exemplo = {
  tipo: "Compra Efetuada",
  condicao_pagamento: "Congresso Sales Pro - Avaliador",
  cnpj: "49.034.503/0001-77",
  id_cliente: "null",
  id_cliente_appcrc: null,
  id_cliente_smarttv: "null",
  meio_pagamento: "Cartão",
  vendedor: "null",
  vendedor_email: "null",
  curso_acesso_nome: "null",
  curso_acesso_cpf: "null",
  curso_acesso_email: "null",
  curso_acesso_contato: "null",
  nome: "Clínica Saúde Iraquara",
  telefone: "(75) 99962-6185",
  whatsapp: "(75) 99962-6185",
  whatsapp2: "null",
  email: "Dalvannunes.contato@gmail.com",
};

describe("normalizarVenda", () => {
  it("converte 'null' em null, CNPJ em dígitos e e-mail em minúsculas", async () => {
    const v = (await normalizarVenda(exemplo))!;
    expect(v.nome).toBe("Clínica Saúde Iraquara");
    expect(v.cnpj).toBe("49034503000177");
    expect(v.email).toBe("dalvannunes.contato@gmail.com");
    expect(v.vendedor).toBeNull();
    expect(v.id_cliente).toBeNull();
    expect(v.curso_acesso).toEqual({});
    expect(v.chave).toMatch(/^[0-9a-f]{64}$/);
  });
  it("mesma venda (campos em outra ordem) tem a mesma chave", async () => {
    const a = (await normalizarVenda(exemplo))!;
    const b = (await normalizarVenda(Object.fromEntries(Object.entries(exemplo).reverse())))!;
    expect(a.chave).toBe(b.chave);
  });
  it("recusa registro sem nome, CNPJ e e-mail", async () => {
    expect(await normalizarVenda({ tipo: "Compra Efetuada", nome: "null" })).toBeNull();
  });
  it("valor() trata nulos", () => {
    expect([valor("null"), valor(""), valor(" x "), valor(undefined)]).toEqual([
      null,
      null,
      "x",
      null,
    ]);
  });
});

describe("formatos do corpo", () => {
  it("lê linhas campo:valor (como o sistema mostra)", () => {
    const r = lerLinhas(
      "tipo:Compra Efetuada\ncnpj:49.034.503/0001-77\nnome:Clínica Saúde Iraquara\ntelefone:(75) 99962-6185",
    );
    expect(r).toMatchObject({
      tipo: "Compra Efetuada",
      cnpj: "49.034.503/0001-77",
      telefone: "(75) 99962-6185",
    });
  });
  it("aceita JSON, lista e formulário", () => {
    expect(lerRegistros(JSON.stringify(exemplo), "application/json")).toHaveLength(1);
    expect(lerRegistros(JSON.stringify([exemplo, exemplo]), "application/json")).toHaveLength(2);
    expect(lerRegistros("nome=Cl%C3%ADnica&cnpj=1", "application/x-www-form-urlencoded")).toEqual([
      { nome: "Clínica", cnpj: "1" },
    ]);
    expect(lerRegistros("{", "application/json")).toBeNull();
    expect(lerRegistros("[1,2]", "application/json")).toBeNull();
  });
});

describe("token", () => {
  it("aceita Bearer ou X-Webhook-Token", () => {
    expect(tokenValido(new Headers({ Authorization: "Bearer abc" }), ["abc"])).toBe(true);
    expect(tokenValido(new Headers({ "X-Webhook-Token": "abc" }), ["x", "abc"])).toBe(true);
    expect(tokenValido(new Headers({ Authorization: "Bearer abd" }), ["abc"])).toBe(false);
    expect(tokenValido(new Headers({}), ["abc"])).toBe(false);
  });
});

describe("receberVendas", () => {
  const req = (h: Record<string, string>, body: string, ct = "application/json") =>
    new Request("https://x.test/api/public/vendas", {
      method: "POST",
      headers: { "content-type": ct, ...h },
      body,
    });
  const gravadas = new Map<string, VendaNormalizada>();
  const gravador = {
    gravar: async (v: VendaNormalizada) => {
      const nova = !gravadas.has(v.chave);
      if (nova) gravadas.set(v.chave, v);
      return { id: v.chave.slice(0, 8), nova };
    },
  };
  it("recusa sem token configurado ou com token errado", async () => {
    expect((await receberVendas(req({}, "{}"), [], gravador)).status).toBe(503);
    expect(
      (
        await receberVendas(
          req({ Authorization: "Bearer x" }, JSON.stringify(exemplo)),
          ["t"],
          gravador,
        )
      ).status,
    ).toBe(401);
    expect(gravadas.size).toBe(0);
  });
  it("grava e não duplica reenvio", async () => {
    const r1 = await receberVendas(
      req({ Authorization: "Bearer t" }, JSON.stringify(exemplo)),
      ["t"],
      gravador,
    );
    expect(r1.status).toBe(201);
    expect((await r1.json()).vendas[0].status).toBe("recebida");
    const r2 = await receberVendas(
      req({ "X-Webhook-Token": "t" }, JSON.stringify(exemplo)),
      ["t"],
      gravador,
    );
    expect((await r2.json()).vendas[0].status).toBe("duplicada");
    expect(gravadas.size).toBe(1);
  });
  it("aceita o formato de linhas em texto", async () => {
    const r = await receberVendas(
      req({ Authorization: "Bearer t" }, "nome:Clínica X\ncnpj:11.222.333/0001-44", "text/plain"),
      ["t"],
      gravador,
    );
    expect(r.status).toBe(201);
  });
  it("422 sem identificação e 400 com corpo inválido", async () => {
    expect(
      (
        await receberVendas(
          req({ Authorization: "Bearer t" }, JSON.stringify({ tipo: "x" })),
          ["t"],
          gravador,
        )
      ).status,
    ).toBe(422);
    expect(
      (await receberVendas(req({ Authorization: "Bearer t" }, "lixo"), ["t"], gravador)).status,
    ).toBe(400);
  });
});

describe("observacaoDaVenda", () => {
  it("resume o que não tem campo próprio", () => {
    const t = observacaoDaVenda({
      tipo: "Compra Efetuada",
      condicao_pagamento: "Congresso",
      meio_pagamento: "Cartão",
      whatsapp2: null,
      vendedor: null,
      vendedor_email: null,
      id_cliente: "77",
      id_cliente_appcrc: null,
      id_cliente_smarttv: null,
      curso_acesso: { nome: "Ana" },
      recebido_em: "2026-11-07T12:00:00Z",
    });
    expect(t).toContain("Meio de pagamento: Cartão");
    expect(t).toContain("Condição: Congresso");
    expect(t).toContain("ID cliente: 77");
    expect(t).toContain("Acesso ao curso: Ana");
    expect(t).not.toContain("WhatsApp 2");
  });
});
