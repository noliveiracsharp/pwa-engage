import { describe, it, expect } from "vitest";
import { progressoTarefaPatch } from "./planner";
describe("progressoTarefaPatch", () => {
  it("100% conclui a tarefa", () => expect(progressoTarefaPatch(100).status).toBe("concluida"));
  it("50% mantém em andamento", () => expect(progressoTarefaPatch(50)).toMatchObject({ progresso: 50, status: "andamento", concluido_em: null }));
});
