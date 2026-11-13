import { describe, expect, it } from "vitest";
import { planoDeOnboarding } from "./plano-onboarding";

const produtos = [
  { id: "app", nome: "AppCrc", cor: "#000", ativo: true },
  { id: "ag", nome: "IA de Agendamento", cor: "#111", ativo: true },
  { id: "pro", nome: "IApro", cor: "#222", ativo: true },
  { id: "red", nome: "Redes", cor: "#333", ativo: true },
];
const vinculos = [
  { produto_id: "app", onboarding_produto_id: "ag" },
  { produto_id: "app", onboarding_produto_id: "pro" },
  { produto_id: "pro", onboarding_produto_id: "pro" },
  { produto_id: "red", onboarding_produto_id: "red" },
];
const modelosPublicados = [
  { produto_id: "ag", nome: "Onboarding IA de Agendamento", versao: 2 },
  { produto_id: "pro", nome: "Onboarding IApro", versao: 1 },
];

describe("planoDeOnboarding", () => {
  it("expande vínculos, junta origens e não duplica", () => {
    const p = planoDeOnboarding({
      produtosCliente: ["AppCrc", "IApro"],
      produtos,
      vinculos,
      modelosPublicados,
      onboardings: [],
    });
    expect(p.map((x) => [x.nome, x.situacao, x.origem.join("+")])).toEqual([
      ["IA de Agendamento", "criar", "AppCrc"],
      ["IApro", "criar", "AppCrc+IApro"],
    ]);
    expect(p[0]!.modelo).toBe("Onboarding IA de Agendamento v2");
  });
  it("marca o que já existe e o que está sem modelo publicado", () => {
    const p = planoDeOnboarding({
      produtosCliente: ["AppCrc", "Redes"],
      produtos,
      vinculos,
      modelosPublicados,
      onboardings: [
        { id: "o1", produto_id: "ag", status: "em_andamento" },
        { id: "o2", produto_id: "pro", status: "cancelado" },
      ],
    });
    expect(p.find((x) => x.nome === "IA de Agendamento")).toMatchObject({
      situacao: "existe",
      onboardingId: "o1",
    });
    expect(p.find((x) => x.nome === "IApro")!.situacao).toBe("criar");
    expect(p.find((x) => x.nome === "Redes")!.situacao).toBe("sem_modelo");
  });
  it("ignora produto inativo ou desconhecido", () => {
    expect(
      planoDeOnboarding({
        produtosCliente: ["X"],
        produtos,
        vinculos,
        modelosPublicados,
        onboardings: [],
      }),
    ).toEqual([]);
  });
});
