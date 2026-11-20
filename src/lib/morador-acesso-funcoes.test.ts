import { describe, expect, it } from "vitest";
import { permsMorador, secaoMoradorLiberada } from "./morador-acesso";

describe("abas do morador seguem a tela Funções", () => {
  const soEspacosEAvisos = (r: string) => r === "/condominios/avisos";
  it("Assembleias some quando o perfil Morador não tem Ler", () => {
    expect(secaoMoradorLiberada("assembleias", soEspacosEAvisos)).toBe(false);
  });
  it("Avisos aparece quando liberado", () => {
    expect(secaoMoradorLiberada("avisos", soEspacosEAvisos)).toBe(true);
  });
  it("Painel e Minha unidade sempre aparecem", () => {
    expect(secaoMoradorLiberada("painel", () => false)).toBe(true);
    expect(secaoMoradorLiberada("unidade", () => false)).toBe(true);
  });
  it("Documentos usa a rota /condominios/documentos", () => {
    expect(secaoMoradorLiberada("docs", (r) => r === "/condominios/documentos")).toBe(true);
  });
  it("morador nunca cria assembleia, mesmo se Funções liberar Criar", () => {
    expect(permsMorador("assembleias").canCreate).toBe(false);
  });
});
