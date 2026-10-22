import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, normalizePhone } from "./input-masks";

describe("exibição de telefone", () => {
  it("(11) 98882-7272 salvo sem + não duplica o 55", () => expect(formatPhoneDisplay("5511988827272")).toBe("(11) 98882-7272"));
  it("corrige telefone já gravado com 55 duplicado", () => expect(formatPhoneDisplay("+551121212121")).toBe("(11) 2121-2121"));
  it("número só com DDD ganha +55", () => expect(normalizePhone("11988827272")).toBe("+5511988827272"));
});
