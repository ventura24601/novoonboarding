import { describe, expect, it } from "vitest";
import { situacaoEtapa, statusToken } from "./status";

describe("situação de SLA da etapa", () => {
  const base = { status: "em_andamento", prazo_em: "2026-11-10", sla_dias: 5, hoje: "2026-11-05" };
  it("no prazo abaixo do limiar", () => expect(situacaoEtapa({ ...base, diasDecorridos: 3 })).toBe("no_prazo"));
  it("em risco a partir de 80% do SLA", () => expect(situacaoEtapa({ ...base, diasDecorridos: 4 })).toBe("em_risco"));
  it("atrasado depois do prazo", () => expect(situacaoEtapa({ ...base, diasDecorridos: 6, hoje: "2026-11-11" })).toBe("atrasado"));
  it("status manuais têm prioridade", () => {
    expect(situacaoEtapa({ ...base, status: "bloqueada", diasDecorridos: 9, hoje: "2026-11-20" })).toBe("bloqueado");
    expect(situacaoEtapa({ ...base, status: "aguardando_cliente", diasDecorridos: 9 })).toBe("aguardando_cliente");
  });
  it("token desconhecido cai em pendente", () => expect(statusToken("xyz").label).toBe("Pendente"));
});

import { ordemDasEtapas } from "./modelos";
describe("ordemDasEtapas", () => {
  it("atribui a fase do cabeçalho acima e mantém a ordem", () => {
    expect(ordemDasEtapas([
      { tipo: "etapa", id: "x" }, { tipo: "fase", id: "F1" }, { tipo: "etapa", id: "a" },
      { tipo: "fase", id: "F2" }, { tipo: "etapa", id: "b" }, { tipo: "etapa", id: "c" },
    ])).toEqual([
      { id: "x", fase_id: "F1" }, { id: "a", fase_id: "F1" }, { id: "b", fase_id: "F2" }, { id: "c", fase_id: "F2" },
    ]);
  });
});
