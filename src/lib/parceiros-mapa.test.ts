import { describe, expect, it } from "vitest";
import { categoriaPin, coordenadas } from "./parceiros-mapa";

describe("parceiros-mapa", () => {
  it("inativo é cinza mesmo sendo cliente", () => expect(categoriaPin({ status: false, is_cliente: true })).toBe("inativo"));
  it("cliente e fornecedor = ambos", () => expect(categoriaPin({ is_cliente: true, is_fornecedor: true })).toBe("ambos"));
  it("só fornecedor", () => expect(categoriaPin({ is_fornecedor: true })).toBe("fornecedor"));
  it("ignora 0,0 e vazio", () => { expect(coordenadas({ latitude: 0, longitude: 0 })).toBeNull(); expect(coordenadas({})).toBeNull(); });
  it("aceita texto numérico", () => expect(coordenadas({ latitude: "-23.5", longitude: "-46.6" })).toEqual([-23.5, -46.6]));
});
