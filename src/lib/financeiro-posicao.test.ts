import { describe, expect, it } from "vitest";
import { planoPosicaoSerie } from "./financeiro-recorrencia";
const serie = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, descricao: `Curso (${i + 1}/${n})`,
  vencimento: `2026-${String(i + 10).padStart(2, "0")}-10`.replace("2026-13", "2027-01"), valor: 100, status: "aberto" }));
describe("planoPosicaoSerie", () => {
  it("4 parcelas a partir de outubro viram 2 a 5 de 5, criando a 1/5 em setembro", () => {
    const p = planoPosicaoSerie(serie(4), 1, 2, 5);
    expect(p.bloqueio).toBeUndefined();
    expect(p.criar).toEqual([{ parcela_n: 1, descricao: "Curso (1/5)", vencimento: "2026-09-10", valor: 100, anterior: true }]);
    expect(p.renomear.map((r) => r.descricao)).toEqual(["Curso (2/5)", "Curso (3/5)", "Curso (4/5)", "Curso (5/5)"]);
  });
  it("cria anteriores e posteriores quando o total cresce", () => {
    const p = planoPosicaoSerie(serie(2), 1, 3, 6);
    expect(p.criar.filter((c) => c.anterior)).toHaveLength(2);
    expect(p.criar.filter((c) => !c.anterior).map((c) => c.parcela_n)).toEqual([5, 6]);
  });
  it("bloqueia posição menor que a quantidade de parcelas anteriores existentes", () => {
    expect(planoPosicaoSerie(serie(4), 3, 1, 4).bloqueio).toBeTruthy();
  });
});
