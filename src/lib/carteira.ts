/** Carteira do cliente (Infinity, Select, Select Club), perguntada na revisão do cadastro. */
export const CARTEIRAS = [
  { value: "infinity", label: "Infinity", cor: "#B45309" },
  { value: "select", label: "Select", cor: "#2563EB" },
  { value: "select_club", label: "Select Club", cor: "#7C3AED" },
  { value: "nenhuma", label: "Nenhuma", cor: "#64748B" },
] as const;

export type Carteira = (typeof CARTEIRAS)[number]["value"];

export const carteiraInfo = (v: string | null | undefined) => CARTEIRAS.find((c) => c.value === v);

/** Contexto da base de clientes (Infinity Clinic, Infinity Prime, Select, Select Club…) → carteira. */
export function carteiraDoContexto(contexto: string | null | undefined): Carteira | null {
  const n = (contexto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!n) return null;
  if (n.startsWith("infinity")) return "infinity";
  if (n === "selectclub") return "select_club";
  if (n === "select") return "select";
  return null;
}

export const TIPO_ONBOARDING: Record<string, string> = {
  downgrade: "Downgrade",
  reonboarding: "Reonboarding",
};
