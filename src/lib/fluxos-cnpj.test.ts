import { describe, it, expect } from "vitest";
import { executarCnpj } from "./fluxos-externo";

const ok = (j: unknown) => async () => new Response(JSON.stringify(j), { status: 200 });

describe("bloco Consultar CNPJ", () => {
  it("limpa pontuação e preenche variáveis com prefixo", async () => {
    let pedido = "";
    const r = await executarCnpj({ origem: "cnpj", prefixo: "empresa" }, { cnpj: "14.167.063/0001-41" },
      async (c) => { pedido = c; return ok({ cnpj: "14167063000141", razao_social: "ACME LTDA", municipio: "SAO PAULO", uf: "SP" })(); });
    expect(pedido).toBe("14167063000141");
    expect(r.saida).toBe("encontrado");
    expect(r.variaveis["empresa_razao_social"]).toBe("ACME LTDA");
    expect(r.variaveis["empresa_cidade"]).toBe("SAO PAULO");
  });
  it("CNPJ incompleto segue por não encontrado sem consultar", async () => {
    let chamou = false;
    const r = await executarCnpj({}, { cnpj: "123" }, async () => { chamou = true; return new Response("{}"); });
    expect(chamou).toBe(false);
    expect(r.saida).toBe("nao_encontrado");
  });
  it("CNPJ inexistente segue por não encontrado", async () => {
    const r = await executarCnpj({}, { cnpj: "11111111111111" }, async () => new Response("{}", { status: 404 }));
    expect(r.saida).toBe("nao_encontrado");
  });
});

describe("salvar no contato", () => {
  it("só grava campos quando a opção está ligada", async () => {
    const f = async () => new Response(JSON.stringify({ cnpj: "14167063000141", razao_social: "ACME" }), { status: 200 });
    const lig = await executarCnpj({ salvar_contato: true }, { cnpj: "14167063000141" }, f);
    expect(lig.campos).toContainEqual({ chave: "razao_social", valor: "ACME" });
    const des = await executarCnpj({}, { cnpj: "14167063000141" }, f);
    expect(des.campos).toBeUndefined();
  });
});
