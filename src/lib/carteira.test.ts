import { describe, expect, it } from "vitest";
import { carteiraDoContexto, carteiraInfo } from "./carteira";

describe("carteiraDoContexto", () => {
  it("mapeia os contextos da base", () => {
    expect(carteiraDoContexto("Infinity Clinic")).toBe("infinity");
    expect(carteiraDoContexto("Infinity Prime")).toBe("infinity");
    expect(carteiraDoContexto("Select")).toBe("select");
    expect(carteiraDoContexto("Select Club")).toBe("select_club");
    expect(carteiraDoContexto(" select  club ")).toBe("select_club");
  });
  it("sem carteira conhecida", () => {
    expect(carteiraDoContexto(null)).toBeNull();
    expect(carteiraDoContexto("")).toBeNull();
    expect(carteiraDoContexto("Outra")).toBeNull();
  });
  it("rótulos", () => {
    expect(carteiraInfo("select_club")?.label).toBe("Select Club");
    expect(carteiraInfo("x")).toBeUndefined();
  });
});
