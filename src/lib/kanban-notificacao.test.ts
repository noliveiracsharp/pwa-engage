import { describe, it, expect } from "vitest";
import { deveNotificar } from "./kanban-acesso";
const v = [{ kanban_nome_id: "suporte", perfil_id: "tecnico" }, { kanban_nome_id: "oferta", perfil_id: "comercial" }];
const base = { responsavelId: null, usuarioId: "u1", vinculos: v, isMaster: false };
describe("deveNotificar", () => {
  it("gerente comercial não recebe alerta do Suporte", () => expect(deveNotificar({ ...base, kanbanId: "suporte", perfilId: "comercial" })).toBe(false));
  it("gerente comercial recebe alerta da Oferta na fila", () => expect(deveNotificar({ ...base, kanbanId: "oferta", perfilId: "comercial" })).toBe(true));
  it("conversa atribuída só alerta o responsável", () => {
    expect(deveNotificar({ ...base, kanbanId: "oferta", perfilId: "comercial", responsavelId: "u2" })).toBe(false);
    expect(deveNotificar({ ...base, kanbanId: "suporte", perfilId: "comercial", responsavelId: "u1" })).toBe(true);
  });
});
