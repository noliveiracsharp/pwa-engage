import { describe, expect, it } from "vitest";
import { cruzarDda, lerCnabDda, linhaDigitavelDe } from "./dda";

const barras = "23793381286000782713695000063305975520000370000";
const cb = "2379" + "9" + "7552" + "0000370000" + "3381260007827136950000633"; // 44
function linhaG() {
  const l = Array(240).fill(" ");
  const put = (pos: number, s: string) => s.split("").forEach((c, i) => (l[pos - 1 + i] = c));
  put(1, "07700001"); put(8, "3"); put(14, "G");
  put(18, cb); put(62, "2"); put(63, "012345678000199"); put(78, "FORNECEDOR TESTE LTDA");
  put(108, "15112026"); put(116, "000000000370000");
  return l.join("");
}

describe("DDA CNAB 240", () => {
  it("converte código de barras na linha digitável oficial", () => {
    expect(cb.length).toBe(44);
    expect(linhaDigitavelDe(cb)).toBe(barras);
  });
  it("lê o segmento G com cedente, vencimento e valor", () => {
    const [b] = lerCnabDda("cabecalho\n" + linhaG());
    expect(b).toMatchObject({ cedente_documento: "12345678000199", cedente_nome: "FORNECEDOR TESTE LTDA", vencimento: "2026-11-15", valor: 3700 });
  });
  it("vincula ao título em aberto do mesmo fornecedor e valor", () => {
    const r = cruzarDda({ cedente_documento: "12345678000199", valor: 3700, vencimento: "2026-11-15" },
      [{ id: "p1", documento: "12.345.678/0001-99" }],
      [{ id: "t1", parceiro_id: "p1", valor: 3700, vencimento: "2026-11-14", status: "aberto", tipo: "pagar" },
       { id: "t2", parceiro_id: "p1", valor: 3700, vencimento: "2026-11-15", status: "pago", tipo: "pagar" }]);
    expect(r).toEqual({ parceiroId: "p1", tituloId: "t1" });
  });
  it("não vincula quando o valor é diferente", () => {
    const r = cruzarDda({ cedente_documento: "12345678000199", valor: 3700, vencimento: "2026-11-15" },
      [{ id: "p1", documento: "12345678000199" }],
      [{ id: "t1", parceiro_id: "p1", valor: 3600, vencimento: "2026-11-15", status: "aberto", tipo: "pagar" }]);
    expect(r.tituloId).toBeNull();
  });
});
