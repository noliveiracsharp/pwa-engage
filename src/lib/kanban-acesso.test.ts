import { describe, it, expect } from "vitest";
import { kanbanPermitido } from "./kanban-acesso";
const v = [{ kanban_nome_id: "k1", perfil_id: "p1" }];
describe("acesso kanban por perfil", () => {
  it("master vê tudo", () => expect(kanbanPermitido("k1", "p2", v, true)).toBe(true));
  it("quadro sem perfis é visível a todos", () => expect(kanbanPermitido("k2", "p2", v, false)).toBe(true));
  it("perfil marcado vê", () => expect(kanbanPermitido("k1", "p1", v, false)).toBe(true));
  it("perfil não marcado não vê", () => expect(kanbanPermitido("k1", "p2", v, false)).toBe(false));
});
