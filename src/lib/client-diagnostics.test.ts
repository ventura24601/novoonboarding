import { describe, expect, it } from "vitest";
import { clientDiagnosticsSchema } from "./client-diagnostics";

const empty = { whatsapp: "", general_notes: "", has_crc: "", has_marketing_experience: "", has_facebook: "" };

describe("client diagnostics", () => {
  for (const field of ["has_crc", "has_marketing_experience", "has_facebook"] as const) {
    it(`${field} supports Sim and Não without treating unanswered as Não`, () => {
      expect(clientDiagnosticsSchema.parse({ ...empty, [field]: "sim" })[field]).toBe(true);
      expect(clientDiagnosticsSchema.parse({ ...empty, [field]: "nao" })[field]).toBe(false);
      expect(clientDiagnosticsSchema.parse(empty)[field]).toBeNull();
      expect(clientDiagnosticsSchema.safeParse({ ...empty, [field]: "talvez" }).success).toBe(false);
    });
  }
  it("preserves WhatsApp independently of the telephone and general notes", () => {
    expect(clientDiagnosticsSchema.parse({ ...empty, whatsapp: "(11) 99999-1234", general_notes: "Contato pela manhã" })).toMatchObject({ whatsapp: "(11) 99999-1234", general_notes: "Contato pela manhã" });
  });
});