import { describe, expect, it } from "vitest";
import { clientEditSchema, clientFormFromRow, clientUpdatePayload, missingClientFields, moneyToInput, parseMoney } from "./client-form";
import { emptyClientForm } from "./client-form";

describe("money input", () => {
  it("reads Brazilian and plain decimal amounts", () => {
    expect(parseMoney("321.321,00")).toBe(321321);
    expect(parseMoney("1.200")).toBe(1200);
    expect(parseMoney("1200.50")).toBe(1200.5);
    expect(parseMoney("1200,50")).toBe(1200.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
  it("writes a saved amount back into the field with a comma", () => {
    expect(moneyToInput(321321)).toBe("321321");
    expect(moneyToInput(1200.5)).toBe("1200,5");
    expect(moneyToInput(null)).toBe("");
  });
});

describe("client edit form", () => {
  it("accepts a client whose activation and payment data are still empty", () => {
    const parsed = clientEditSchema.safeParse({ ...emptyClientForm(), clinic_name: "Clínica Vida", products: ["Black"] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const payload = clientUpdatePayload(parsed.data);
      expect(payload.value).toBe(0);
      expect(payload.payment_value).toBeNull();
      expect(payload.email).toBeNull();
      expect(payload.has_crc).toBeNull();
      expect(payload.billing_system).toBeNull();
    }
  });
  it("saves the typed values, including the answered Sim/Não questions", () => {
    const parsed = clientEditSchema.parse({
      ...emptyClientForm(),
      clinic_name: "Clínica Vida",
      products: ["Black", "IA Agendamento"],
      email: "contato@clinica.com.br",
      value: "1.500,00",
      has_crc: "sim",
      has_marketing_experience: "nao",
      activation_status: "Ativo",
      ic_id: "IC-9",
      cep: "01310-100",
      city: "São Paulo",
      state: "SP",
      billing_system: "vindi",
      payment_method: "pix",
      payment_value: "1500,00",
      payment_modality: "Mensal",
      payment_date: "2026-11-04",
    });
    const payload = clientUpdatePayload(parsed);
    expect(payload.products).toEqual(["Black", "IA Agendamento"]);
    expect(payload.value).toBe(1500);
    expect(payload.has_crc).toBe(true);
    expect(payload.has_marketing_experience).toBe(false);
    expect(payload.has_facebook).toBeNull();
    expect(payload.activation_status).toBe("Ativo");
    expect(payload.payment_value).toBe(1500);
    expect(payload.payment_date).toBe("2026-11-04");
    expect(payload.billing_system).toBe("vindi");
  });
  it("rejects an invalid e-mail and a nonsense amount instead of saving", () => {
    expect(clientEditSchema.safeParse({ ...emptyClientForm(), clinic_name: "Clínica Vida", products: ["Black"], email: "x@" }).success).toBe(false);
    expect(clientEditSchema.safeParse({ ...emptyClientForm(), clinic_name: "Clínica Vida", products: ["Black"], payment_value: "abc" }).success).toBe(false);
  });
  it("reopens a saved client with every field filled in", () => {
    const f = clientFormFromRow({
      clinic_name: "Clínica Vida", value: 1500, payment_value: 1500.5, payment_date: "2026-11-04",
      has_crc: true, has_marketing_experience: false, has_facebook: null, products: ["Black"], billing_system: "vindi",
    });
    expect(f.value).toBe("1500");
    expect(f.payment_value).toBe("1500,5");
    expect(f.payment_date).toBe("2026-11-04");
    expect(f.has_crc).toBe("sim");
    expect(f.has_marketing_experience).toBe("nao");
    expect(f.has_facebook).toBe("");
    expect(f.products).toEqual(["Black"]);
  });
  it("lists what is still missing on the sheet", () => {
    expect(missingClientFields({ clinic_name: "X" })).toContain("E-mail");
    expect(missingClientFields({ clinic_name: "X", email: "a@b.com" })).not.toContain("E-mail");
    const full = {
      legal_name: "L", phone: "11", email: "a@b.com", document: "1", specialty: "Odonto", address: "Rua A",
      city: "SP", seller_id: "u", activation_status: "Ativo", ic_id: "IC-1", financial_id: "F1", contract_id: "C1",
      billing_system: "vindi", payment_method: "pix", payment_value: 10, payment_modality: "Mensal", payment_date: "2026-11-04",
      has_crc: true, has_marketing_experience: false, has_facebook: true,
    };
    expect(missingClientFields(full)).toEqual([]);
  });
});
