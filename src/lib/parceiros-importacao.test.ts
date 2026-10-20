import { describe, expect, it } from "vitest";
import { lerCsvParceiros, modeloCsvParceiros } from "./parceiros-importacao";

describe("importação de parceiros", () => {
  it("modelo é lido sem erros e como cliente jurídica", () => {
    const [l] = lerCsvParceiros(modeloCsvParceiros(), new Set());
    expect(l!.erros).toEqual([]);
    expect(l!.valores["tipo_pessoa"]).toBe("Jurídica");
    expect(l!.valores["is_cliente"]).toBe(true);
    expect(l!.valores["documento"]).toBe("11222333000181");
  });
  it("bloqueia documento já cadastrado e duplicado no arquivo", () => {
    const csv = "Razão social;CNPJ/CPF\nA;11.222.333/0001-81\nB;11.222.333/0001-81";
    expect(lerCsvParceiros(csv, new Set(["11222333000181"]))[0]!.erros).toContain("Já cadastrado");
    expect(lerCsvParceiros(csv, new Set())[1]!.erros).toContain("Duplicado no arquivo");
  });
  it("exige razão social", () => {
    expect(lerCsvParceiros("Razão social;Cidade\n;Taubaté", new Set())[0]!.erros).toContain("Razão social obrigatória");
  });
});
