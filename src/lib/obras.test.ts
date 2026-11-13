import { describe, expect, it } from "vitest";
import { custoRealizado, estadosFases, paraMorador, percFase, percObra, prazoObra, type AtividadeObra, type Obra } from "./obras";

const at = (p: Partial<AtividadeObra>): AtividadeObra => ({ id: "a", fase_id: "f", descricao: "", status: "andamento", responsavel: "", data_inicio: "", data_fim: "", percentual: 0, custo: null, ordem: 0, ...p });
const obra = (p: Partial<Obra>): Obra => ({ id: "o", titulo: "", observacao: "", status: "andamento", data_inicio: "", data_fim: "", custo_previsto: 100, visivel_moradores: true, mostrar_custo: true, aviso: "", fases: [], fotos: [], ...p });

describe("obras", () => {
  it("fase é a média das atividades (Cotação 50% + 25% = 37,5%)", () => {
    expect(percFase({ atividades: [at({ percentual: 50 }), at({ percentual: 25 })] })).toBe(37.5);
  });
  it("atividade concluída conta 100% e obra é a média de todas as atividades", () => {
    const o = obra({ fases: [{ id: "1", obra_id: "o", nome: "", ordem: 1, data_inicio: "", data_fim: "", atividades: [at({ status: "concluida", percentual: 0 }), at({ percentual: 50 })] }] });
    expect(percObra(o)).toBe(75);
  });
  it("régua: concluídas, primeira em aberto é a atual, demais futuras", () => {
    const f = (p: number) => ({ ordem: 0, atividades: [at({ percentual: p })] });
    expect(estadosFases([f(100), f(40), f(0)])).toEqual(["concluida", "atual", "futura"]);
  });
  it("custo realizado soma as atividades", () => {
    expect(custoRealizado({ fases: [{ id: "1", obra_id: "o", nome: "", ordem: 1, data_inicio: "", data_fim: "", atividades: [at({ custo: 10000 }), at({ custo: 11000 })] }] })).toBe(21000);
  });
  it("prazo vencido fica atrasada com dias", () => {
    expect(prazoObra(obra({ data_fim: "2026-11-10" }), new Date("2026-11-13T10:00:00"))).toEqual({ prazo: "atrasada", dias: 3 });
  });
  it("morador não vê obra privada nem custo oculto", () => {
    const r = paraMorador([obra({ id: "x", visivel_moradores: false }), obra({ mostrar_custo: false, fases: [{ id: "1", obra_id: "o", nome: "", ordem: 1, data_inicio: "", data_fim: "", atividades: [at({ custo: 5 })] }] })]);
    expect(r).toHaveLength(1);
    expect(r[0]!.custo_previsto).toBeNull();
    expect(r[0]!.fases[0]!.atividades[0]!.custo).toBeNull();
  });
});
