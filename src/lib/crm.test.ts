import { describe, expect, it } from "vitest";
import { clientStatus, commission, formatDuration, formatBRLCompact, canReleaseOnboarding } from "./crm";

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
  it("segue o funil contrato → pagamento → verificação → onboarding", () => {
    const base = { contract_signed: false, paid: false, contract_verified_at: null, onboarding_released_at: null, onboarding_completed_at: null };
    expect(clientStatus(base)).toBe("aguardando_assinatura");
    expect(clientStatus({ ...base, contract_signed: true })).toBe("aguardando_pagamento");
    expect(clientStatus({ ...base, contract_signed: true, paid: true })).toBe("aguardando_verificacao");
    const ok = { ...base, contract_signed: true, paid: true, contract_verified_at: "2026-11-01T10:00:00Z" };
    expect(clientStatus(ok)).toBe("pronto_para_liberar");
    expect(clientStatus({ ...ok, onboarding_released_at: "2026-11-02T10:00:00Z" })).toBe("em_onboarding");
    expect(clientStatus({ ...ok, onboarding_released_at: "2026-11-02T10:00:00Z", onboarding_completed_at: "2026-11-20T10:00:00Z" })).toBe("finalizado");
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
