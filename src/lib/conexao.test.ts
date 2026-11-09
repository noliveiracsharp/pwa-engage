import { describe, expect, it } from "vitest";
import { estadoConexao } from "./conexao";

describe("estadoConexao", () => {
  it("navegador offline é sempre vermelho", () => expect(estadoConexao(false, true, false)).toBe("offline"));
  it("rede ligada mas ping falhou é offline", () => expect(estadoConexao(true, false, false)).toBe("offline"));
  it("ping ok é online", () => expect(estadoConexao(true, true, false)).toBe("online"));
  it("revalidando após falha é verificando", () => expect(estadoConexao(true, false, true)).toBe("verificando"));
});
