import { describe, it, expect } from "vitest";
import { podeResponderAtendimento } from "./cond-equipe";
describe("responsáveis de atendimento", () => {
  it("síndico pode", () => expect(podeResponderAtendimento({ cargo: "sindico_morador" })).toBe(true));
  it("gerente pode", () => expect(podeResponderAtendimento({ cargo: "gerente" })).toBe(true));
  it("porteiro não pode", () => expect(podeResponderAtendimento({ cargo: "porteiro", vinculo: "facilities" })).toBe(false));
  it("funcionário da administradora pode", () => expect(podeResponderAtendimento({ cargo: "outro", vinculo: "administradora" })).toBe(true));
});
