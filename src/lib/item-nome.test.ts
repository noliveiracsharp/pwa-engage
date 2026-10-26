import { describe, expect, it } from "vitest";
import { nomeItemCompleto } from "./item-nome";

describe("nome completo do item", () => {
  it("junta descrição, marca e modelo", () => {
    expect(nomeItemCompleto({ descricao: "Câmera Bullet", modelo: "VHD 1120" }, "Intelbras")).toBe("Câmera Bullet Intelbras VHD 1120");
  });
  it("ignora partes vazias", () => {
    expect(nomeItemCompleto({ descricao: "Cabo UTP", modelo: "" }, null)).toBe("Cabo UTP");
  });
});
