import { z } from "zod";
import { clientDiagnosticsSchema } from "./client-diagnostics";

export const ACTIVATION_STATUSES = ["Pendente", "Em ativação", "Ativo", "Cancelado"] as const;
export const BILLING_SYSTEMS = [
  { value: "vindi", label: "Vindi" },
  { value: "bambuno", label: "Bambuno" },
] as const;
export const PAYMENT_METHODS = [
  { value: "cartao_externo", label: "Cartão Externo" },
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "Pix" },
] as const;

/** "321.321,00" -> 321321 · "1200.50" -> 1200.5 · "1.200" -> 1200 · "" -> null */
export function parseMoney(raw: string): number | null {
  const s = String(raw ?? "").replace(/\s|R\$/g, "").trim();
  if (!s) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let n = s;
  if (hasComma && hasDot) {
    n = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    n = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    n = s.replace(/\./g, "");
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

export function moneyToInput(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v).replace(".", ",");
}

const money = (label: string) =>
  z
    .string()
    .max(30)
    .superRefine((v, ctx) => {
      const n = parseMoney(v);
      if (v.trim() !== "" && (n === null || n < 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} inválido` });
      }
    })
    .transform((v) => parseMoney(v));

const clinicFields = {
  clinic_name: z.string().trim().min(2, "Informe a clínica").max(150),
  legal_name: z.string().trim().max(200),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(""), z.string().trim().email("E-mail inválido").max(255)]),
  document: z.string().trim().max(30),
  specialty: z.string().trim().max(120),
  address: z.string().trim().max(300),
  client_type: z.enum(["aluno", "nao_aluno"]),
  products: z.array(z.string()).min(1, "Selecione ao menos um produto"),
  current_scenario: z.string().max(2000),
  goal: z.string().max(2000),
  pain: z.string().max(2000),
  special_condition: z.string().max(1000),
  value: money("Valor"),
  notes: z.string().max(2000),
};

/** Cadastro de novo cliente: vendedor obrigatório. */
export const clientBaseSchema = z
  .object(clinicFields)
  .merge(clientDiagnosticsSchema)
  .extend({ seller_id: z.string().uuid("Selecione o vendedor") });

/** Ficha do cliente: mesmos dados da venda + ativação, localização e pagamento. */
export const clientEditSchema = z
  .object({
    ...clinicFields,
    activation_status: z.string().trim().max(40),
    ic_id: z.string().trim().max(60),
    financial_id: z.string().trim().max(60),
    contract_id: z.string().trim().max(60),
    cep: z.string().trim().max(20),
    city: z.string().trim().max(120),
    state: z.string().trim().max(40),
    billing_system: z.enum(["", "vindi", "bambuno"]),
    payment_method: z.enum(["", "cartao_externo", "boleto", "pix"]),
    payment_value: money("Valor pago"),
    payment_modality: z.string().trim().max(80),
    payment_date: z.string().trim().max(20),
  })
  .merge(clientDiagnosticsSchema)
  .extend({ seller_id: z.union([z.literal(""), z.string().uuid("Selecione o vendedor")]) });

export type ClientEdit = z.infer<typeof clientEditSchema>;

export type ClientForm = {
  clinic_name: string;
  legal_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  document: string;
  specialty: string;
  address: string;
  client_type: string;
  seller_id: string;
  products: string[];
  current_scenario: string;
  goal: string;
  pain: string;
  special_condition: string;
  value: string;
  notes: string;
  general_notes: string;
  has_crc: string;
  has_marketing_experience: string;
  has_facebook: string;
  activation_status: string;
  ic_id: string;
  financial_id: string;
  contract_id: string;
  cep: string;
  city: string;
  state: string;
  billing_system: string;
  payment_method: string;
  payment_value: string;
  payment_modality: string;
  payment_date: string;
};

export function emptyClientForm(): ClientForm {
  return {
    clinic_name: "", legal_name: "", phone: "", whatsapp: "", email: "", document: "", specialty: "",
    address: "", client_type: "nao_aluno", seller_id: "", products: [], current_scenario: "", goal: "",
    pain: "", special_condition: "", value: "", notes: "", general_notes: "", has_crc: "",
    has_marketing_experience: "", has_facebook: "", activation_status: "", ic_id: "", financial_id: "",
    contract_id: "", cep: "", city: "", state: "", billing_system: "", payment_method: "",
    payment_value: "", payment_modality: "", payment_date: "",
  };
}

const answerToInput = (v: unknown) => (v === true ? "sim" : v === false ? "nao" : "");

/** Monta o formulário a partir da linha salva no banco. */
export function clientFormFromRow(row: Record<string, unknown>): ClientForm {
  const f = emptyClientForm();
  const s = (k: keyof ClientForm) => {
    const v = row[k];
    return v == null ? "" : String(v);
  };
  for (const k of Object.keys(f) as (keyof ClientForm)[]) {
    if (k === "products" || k === "value" || k === "payment_value" || k === "payment_date" ||
        k === "has_crc" || k === "has_marketing_experience" || k === "has_facebook") continue;
    f[k] = s(k);
  }
  f.products = Array.isArray(row["products"]) ? [...(row["products"] as string[])] : [];
  f.value = moneyToInput(row["value"] == null ? null : Number(row["value"]));
  f.payment_value = moneyToInput(row["payment_value"] == null ? null : Number(row["payment_value"]));
  f.payment_date = row["payment_date"] == null ? "" : String(row["payment_date"]).slice(0, 10);
  f.has_crc = answerToInput(row["has_crc"]);
  f.has_marketing_experience = answerToInput(row["has_marketing_experience"]);
  f.has_facebook = answerToInput(row["has_facebook"]);
  return f;
}

const t = (s: string) => s.trim() || null;

/** Dados validados prontos para gravar em clients. */
export function clientUpdatePayload(d: ClientEdit) {
  return {
    clinic_name: d.clinic_name,
    legal_name: t(d.legal_name),
    phone: t(d.phone),
    whatsapp: t(d.whatsapp),
    email: t(d.email),
    document: t(d.document),
    specialty: t(d.specialty),
    address: t(d.address),
    client_type: d.client_type,
    seller_id: d.seller_id || null,
    products: d.products,
    current_scenario: t(d.current_scenario),
    goal: t(d.goal),
    pain: t(d.pain),
    special_condition: t(d.special_condition),
    value: d.value ?? 0,
    notes: t(d.notes),
    general_notes: t(d.general_notes),
    has_crc: d.has_crc,
    has_marketing_experience: d.has_marketing_experience,
    has_facebook: d.has_facebook,
    activation_status: t(d.activation_status),
    ic_id: t(d.ic_id),
    financial_id: t(d.financial_id),
    contract_id: t(d.contract_id),
    cep: t(d.cep),
    city: t(d.city),
    state: t(d.state),
    billing_system: d.billing_system || null,
    payment_method: d.payment_method || null,
    payment_value: d.payment_value,
    payment_modality: t(d.payment_modality),
    payment_date: d.payment_date || null,
  };
}

const MISSING_CHECKS: { label: string; filled: (r: Record<string, unknown>) => boolean }[] = [
  { label: "Razão social", filled: (r) => Boolean(t(String(r["legal_name"] ?? ""))) },
  { label: "Telefone", filled: (r) => Boolean(t(String(r["phone"] ?? ""))) },
  { label: "E-mail", filled: (r) => Boolean(t(String(r["email"] ?? ""))) },
  { label: "Documento", filled: (r) => Boolean(t(String(r["document"] ?? ""))) },
  { label: "Especialidade", filled: (r) => Boolean(t(String(r["specialty"] ?? ""))) },
  { label: "Endereço", filled: (r) => Boolean(t(String(r["address"] ?? ""))) },
  { label: "Cidade/UF", filled: (r) => Boolean(t(String(r["city"] ?? ""))) },
  { label: "Vendedor", filled: (r) => Boolean(r["seller_id"]) },
  { label: "Status ativação", filled: (r) => Boolean(t(String(r["activation_status"] ?? ""))) },
  { label: "ID/IC", filled: (r) => Boolean(t(String(r["ic_id"] ?? ""))) },
  { label: "ID Financeiro", filled: (r) => Boolean(t(String(r["financial_id"] ?? ""))) },
  { label: "ID Contrato", filled: (r) => Boolean(t(String(r["contract_id"] ?? ""))) },
  { label: "Sistema", filled: (r) => Boolean(r["billing_system"]) },
  { label: "Forma de pagamento", filled: (r) => Boolean(r["payment_method"]) },
  { label: "Valor pago", filled: (r) => r["payment_value"] != null },
  { label: "Modalidade", filled: (r) => Boolean(t(String(r["payment_modality"] ?? ""))) },
  { label: "Data pagamento", filled: (r) => Boolean(r["payment_date"]) },
  { label: "Tem CRC", filled: (r) => r["has_crc"] != null },
  { label: "Já fez Marketing", filled: (r) => r["has_marketing_experience"] != null },
  { label: "Tem Facebook", filled: (r) => r["has_facebook"] != null },
];

/** Campos essenciais ainda em branco na ficha do cliente. */
export function missingClientFields(row: Record<string, unknown>): string[] {
  return MISSING_CHECKS.filter((c) => !c.filled(row)).map((c) => c.label);
}
