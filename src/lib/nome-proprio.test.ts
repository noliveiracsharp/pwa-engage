import { describe, it, expect } from "vitest";
import { nomeProprio } from "./nome-proprio";

describe("nomeProprio", () => {
  it("converte caixa alta", () => expect(nomeProprio("A CASA DO MICRO")).toBe("A Casa do Micro"));
  it("mantém siglas societárias", () => expect(nomeProprio("A CASA DO MICRO LTDA - ME")).toBe("A Casa do Micro LTDA - ME"));
  it("conectivos minúsculos", () => expect(nomeProprio("joão DA silva e souza")).toBe("João da Silva e Souza"));
});
