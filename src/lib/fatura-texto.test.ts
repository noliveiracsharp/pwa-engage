import { describe, it, expect } from "vitest";
import { lerTextoFatura } from "./fatura-importacao";
const txt = `Data de Vencimento 25/10/2026
Fatura atual R$ 9.545,47
CARTÃO 5497****8346
09 de set. 2026 FACE SEG ITAQUAQUECET (Parcela 02 de 10) - R$ 504,92
22 de set. 2026 P AGAMENTO ON LINE - + R$ 16.460,24
CARTÃO 5497****8385
06 de nov. 2025 MERCADOLIVRE*MERCADOL (Parcela 12 de 12) - R$ 114,47`;
describe("lerTextoFatura", () => {
  const r = lerTextoFatura(txt);
  it("vencimento e total", () => { expect(r.vencimento).toBe("2026-10-25"); expect(r.total).toBe(9545.47); });
  it("parcela 2 de 10 no cartão 8346", () => expect(r.itens[0]).toMatchObject({ final4: "8346", valor: 504.92, parcela: 2, de: 10, data: "2026-09-09", credito: false }));
  it("pagamento é crédito", () => expect(r.itens[1]?.credito).toBe(true));
  it("12/12 no cartão 8385", () => expect(r.itens[2]).toMatchObject({ final4: "8385", parcela: 12, de: 12 }));
});
