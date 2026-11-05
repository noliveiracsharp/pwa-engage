import { describe, expect, it } from "vitest";
import { normalizarPlaca, sortearVagas } from "./sorteio-vagas";

const vagas = [{ id: "V1" }, { id: "V2", pcd: true }, { id: "V3", idoso: true }, { id: "V4" }];
const parts = [{ unidadeId: "101" }, { unidadeId: "102", pcd: true }, { unidadeId: "103", idoso: true }, { unidadeId: "104" }, { unidadeId: "105" }];

describe("sortearVagas", () => {
  it("mesma semente gera o mesmo resultado, independente da ordem de entrada", () => {
    const a = sortearVagas(vagas, parts, "ABC");
    const b = sortearVagas([...vagas].reverse(), [...parts].reverse(), "ABC");
    expect(a).toEqual(b);
  });
  it("unidade PCD recebe a vaga PCD e idoso a vaga de idoso", () => {
    const r = sortearVagas(vagas, parts, "XYZ");
    expect(r.find((x) => x.unidadeId === "102")?.vagaId).toBe("V2");
    expect(r.find((x) => x.unidadeId === "103")?.vagaId).toBe("V3");
  });
  it("cada vaga vai para uma única unidade e quem sobra fica sem vaga", () => {
    const r = sortearVagas(vagas, parts, "S1");
    const ids = r.map((x) => x.vagaId).filter(Boolean);
    expect(new Set(ids).size).toBe(4);
    expect(r.filter((x) => x.criterio === "sem_vaga")).toHaveLength(1);
  });
});

describe("normalizarPlaca", () => {
  it("aceita padrão antigo e Mercosul", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca("ABC1D23")).toBe("ABC1D23");
    expect(normalizarPlaca("AB1234")).toBeNull();
  });
});
