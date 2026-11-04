import { describe, expect, it } from "vitest";
import { receiveContractExample } from "./contract-webhook";

describe("public contract example receiver", () => {
  for (const status of ["Para assinatura", "Assinado"]) {
    it(`accepts ${status} without authentication and never updates clients`, async () => {
      const response = await receiveContractExample(new Request("https://example.test/api/public/contratos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ status, CNPJ: "21.571.448/0001-35" }]),
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true, mode: "test", clients_updated: false, payload_stored: false });
    });
  }
  it("rejects invalid JSON", async () => {
    const response = await receiveContractExample(new Request("https://example.test", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }));
    expect(response.status).toBe(400);
  });
  it("bounds the request size", async () => {
    const response = await receiveContractExample(new Request("https://example.test", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "a".repeat(65536) }),
    }));
    expect(response.status).toBe(413);
  });
});