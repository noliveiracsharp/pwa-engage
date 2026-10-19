import { describe, expect, it } from "vitest";
import { dominioEmail, emailValido } from "./contatos";

describe("validação de e-mail", () => {
  it("aceita e-mail comum", () => expect(emailValido("joao.silva@empresa.com.br")).toBe(true));
  it("recusa sem arroba", () => expect(emailValido("joao.empresa.com")).toBe(false));
  it("recusa domínio sem extensão", () => expect(emailValido("joao@empresa")).toBe(false));
  it("recusa pontos duplos", () => expect(emailValido("joao..silva@empresa.com")).toBe(false));
  it("extrai o domínio em minúsculas", () => expect(dominioEmail("Ana@Gmail.COM")).toBe("gmail.com"));
});
