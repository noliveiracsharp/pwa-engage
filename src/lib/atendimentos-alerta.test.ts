import { describe, it, expect } from "vitest";
import { estaAguardando } from "./atendimentos-alerta";

describe("estaAguardando", () => {
  it("sem responsável e humano = aguardando", () => expect(estaAguardando({ modo_atendimento: "Humano", status: "Aguardando" })).toBe(true));
  it("com responsável não é fila", () => expect(estaAguardando({ usuario_responsavel_id: "u1", modo_atendimento: "Humano" })).toBe(false));
  it("IA não avisa", () => expect(estaAguardando({ modo_atendimento: "IA" })).toBe(false));
  it("encerrado não avisa", () => expect(estaAguardando({ status: "Encerrado" })).toBe(false));
});
