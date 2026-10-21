import { describe, expect, it } from "vitest";
import { limiteGrupoCartao } from "./financeiro";

const cartoes = [
  { id: "fis", limite_total: 54800 },
  { id: "vir", limite_total: 54800, cartao_titular_id: "fis" },
  { id: "outro", limite_total: 1000 },
];
const titulos = [
  { cartao_id: "fis", status: "aberto", valor: 19998.48 },
  { cartao_id: "vir", status: "aberto", valor: 15589.65 },
  { cartao_id: "outro", status: "aberto", valor: 100 },
];

describe("limite compartilhado", () => {
  it("físico e virtual mostram o mesmo disponível do grupo", () => {
    expect(limiteGrupoCartao(cartoes, titulos, "fis").disponivel).toBe(19211.87);
    expect(limiteGrupoCartao(cartoes, titulos, "vir").disponivel).toBe(19211.87);
  });
  it("virtual usa o limite do titular", () => {
    expect(limiteGrupoCartao([{ id: "fis", limite_total: 54800 }, { id: "vir", limite_total: 0, cartao_titular_id: "fis" }], [], "vir").limite).toBe(54800);
  });
  it("cartão sem vínculo segue isolado", () => {
    expect(limiteGrupoCartao(cartoes, titulos, "outro").disponivel).toBe(900);
  });
});
