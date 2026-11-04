import { describe, expect, it } from "vitest";
import { clientStatus, commission, formatDuration, formatBRLCompact, PRODUCTS, canReleaseOnboarding } from "./crm";

describe("crm rules", () => {
  it("requires payment before releasing onboarding", () => {
    const c = { paid: false, contract_signed: true, contract_verified_at: "2026-10-29T17:00:00Z", onboarding_released_at: null };
    expect(canReleaseOnboarding(c)).toBe(false);
    expect(canReleaseOnboarding({ ...c, paid: true })).toBe(true);
  });
  it("requires an API-verified signature, not just a manual checkbox", () => {
    const c = { paid: true, contract_signed: true, contract_verified_at: null, onboarding_released_at: null };
    expect(canReleaseOnboarding(c)).toBe(false);
    expect(canReleaseOnboarding({ ...c, contract_verified_at: "2026-10-29T17:00:00Z", contract_signed: false })).toBe(false);
    expect(canReleaseOnboarding({ ...c, contract_verified_at: "2026-10-29T17:00:00Z" })).toBe(true);
  });
  it("offers IA Agendamento as a contracted product", () => {
    expect(PRODUCTS).toContain("IA Agendamento");
  });
  it("finalizado only when contrato, grupo e onboarding are all checked", () => {
    expect(clientStatus({ contract_signed: true, whatsapp_group: true, onboarding_sent: true })).toBe("finalizado");
    expect(clientStatus({ contract_signed: true, whatsapp_group: true, onboarding_sent: false })).toBe("em_onboarding");
  });
  it("aguardando assinatura when contract not signed but other steps started", () => {
    expect(clientStatus({ contract_signed: false, whatsapp_group: true, onboarding_sent: false })).toBe("aguardando_assinatura");
    expect(clientStatus({ contract_signed: false, whatsapp_group: false, onboarding_sent: false })).toBe("novo");
  });
  it("formats elapsed time in days", () => {
    expect(formatDuration((2 * 1440 + 3 * 60) * 60000)).toBe("2d");
    expect(formatDuration(5 * 60000)).toBe("5min");
  });
  it("commission is a percentage of total", () => {
    expect(commission(10000, 5)).toBe(500);
  });
  it("abbreviates large values so stat cards fit", () => {
    const norm = (s: string) => s.replace(/\u00a0/g, " ");
    expect(norm(formatBRLCompact(321321))).toBe("R$ 321,3 mil");
    expect(norm(formatBRLCompact(1234567))).toBe("R$ 1,2 mi");
    expect(norm(formatBRLCompact(500))).toBe("R$ 500,00");
  });
});
