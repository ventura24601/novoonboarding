import { describe, expect, it } from "vitest";
import {
  alcance,
  calcular,
  maiorVazamento,
  montarFunis,
  periodoAnterior,
  periodoDeDias,
  pct,
  quebraPorSegmento,
  type Funil,
} from "./funis";

const funil: Funil = {
  id: "f",
  nome: "F",
  descricao: "",
  dimensao: "Produto",
  passos: [{ nome: "A" }, { nome: "B" }, { nome: "C" }],
  entidades: [
    { id: "1", data: "2026-11-10", segmentos: ["X"], passos: [true, true, true] },
    { id: "2", data: "2026-11-10", segmentos: ["X", "Y"], passos: [true, true, false] },
    { id: "3", data: "2026-11-09", segmentos: ["Y"], passos: [true, false, true] }, // C sem B não conta
    { id: "4", data: "2026-10-15", segmentos: ["Y"], passos: [true, true, true] }, // período anterior
  ],
};
const nov = { inicio: new Date("2026-11-01T00:00:00"), fim: new Date("2026-11-30T23:59:59") };

describe("funis", () => {
  it("alcance é cumulativo", () => {
    expect(alcance([true, false, true])).toEqual([true, false, false]);
  });
  it("calcula contagens, conversões e geral no período", () => {
    const r = calcular(funil, nov);
    expect(r.contagens).toEqual([3, 2, 1]);
    expect(r.conversoes[1]).toBeCloseTo(2 / 3);
    expect(r.conversoes[2]).toBeCloseTo(0.5);
    expect(r.geral).toBeCloseTo(1 / 3);
  });
  it("filtra por segmento", () => {
    expect(calcular(funil, nov, "Y").contagens).toEqual([2, 1, 0]);
  });
  it("período anterior tem a mesma duração", () => {
    const a = periodoAnterior(nov)!;
    expect(a.fim < nov.inicio!).toBe(true);
    expect(calcular(funil, a).contagens).toEqual([1, 1, 1]);
    expect(periodoAnterior({ inicio: null, fim: new Date() })).toBeNull();
  });
  it("periodoDeDias cobre N dias até hoje", () => {
    const p = periodoDeDias(30, new Date("2026-11-13T10:00:00"));
    expect(p.inicio!.getDate()).toBe(15);
    expect(p.inicio!.getMonth()).toBe(9);
  });
  it("maior vazamento e ganho estimado", () => {
    const v = maiorVazamento({ total: 100, contagens: [100, 60, 50], conversoes: [], geral: 0.5 })!;
    expect(v.passo).toBe(1);
    expect(v.perdidos).toBe(40);
    expect(v.ganhoNoFim).toBe(4); // 100*5% = 5 a mais no passo 1, 50/60 chegam ao fim
  });
  it("quebra por segmento", () => {
    const q = quebraPorSegmento(funil, nov, 1);
    expect(q.find((x) => x.segmento === "X")).toMatchObject({ chegou: 2, anterior: 2, manteve: 1 });
    expect(q.find((x) => x.segmento === "Y")).toMatchObject({
      chegou: 1,
      anterior: 2,
      manteve: 0.5,
    });
  });
  it("pct formata em pt-BR", () => {
    expect(pct(0.413)).toBe("41,3%");
    expect(pct(null)).toBe("—");
  });
});

describe("montarFunis", () => {
  const dados = {
    clientes: [
      {
        id: "c1",
        created_at: "2026-11-01",
        products: ["IApro"],
        seller_id: "u1",
        contract_signed: true,
        contract_verified_at: "x",
        paid: true,
        onboarding_released_at: "x",
        onboarding_completed_at: null,
      },
      {
        id: "c2",
        created_at: "2026-11-02",
        products: [],
        seller_id: null,
        contract_signed: false,
        contract_verified_at: null,
        paid: false,
        onboarding_released_at: null,
        onboarding_completed_at: null,
      },
    ],
    vendas: [
      {
        id: "v1",
        recebido_em: "2026-11-01",
        status: "aprovada",
        meio_pagamento: "Pix",
        cliente_id: "c1",
      },
      {
        id: "v2",
        recebido_em: "2026-11-01",
        status: "descartada",
        meio_pagamento: null,
        cliente_id: null,
      },
    ],
    onboardings: [
      {
        id: "o1",
        cliente_id: "c1",
        produto_id: "p1",
        data_inicio: "2026-11-03",
        status: "em_andamento",
      },
    ],
    etapas: [
      { onboarding_id: "o1", ordem: 1, nome: "Saudação", status: "concluida" },
      { onboarding_id: "o1", ordem: 2, nome: "Configuração", status: "em_andamento" },
    ],
    produtos: [{ id: "p1", nome: "IApro" }],
    pessoas: [{ id: "u1", full_name: "Ana", email: null }],
  };
  it("monta o funil comercial, o de vendas (sem descartadas) e um por linha de onboarding", () => {
    const f = montarFunis(dados);
    expect(f.map((x) => x.id)).toEqual(["contrato-onboarding", "vendas", "onb-p1"]);
    expect(f[0]!.entidades[1]!.segmentos).toEqual(["Sem produto"]);
    expect(f[1]!.entidades).toHaveLength(1);
    expect(f[2]!.passos.map((p) => p.nome)).toEqual(["Iniciados", "Saudação", "Configuração"]);
    expect(f[2]!.entidades[0]).toMatchObject({ segmentos: ["Ana"], passos: [true, true, false] });
  });
});
