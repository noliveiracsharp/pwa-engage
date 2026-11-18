import { describe, expect, it } from "vitest";
import { filtrarAvisos, FILTRO_AVISOS_VAZIO as V } from "./avisos-filtro";

const lista = [
  { id: "1", titulo: "Manutenção do elevador", mensagem: "<p>Dia 10</p>", tipo: "manutencao", created_at: "2026-11-09T10:00:00Z", midia_url: "x.pdf" },
  { id: "2", titulo: "Segunda-feira", mensagem: "Hoje é segunda", tipo: "geral", created_at: "2026-11-07T10:00:00Z" },
];
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("filtrarAvisos", () => {
  it("busca no título e no texto, ignorando acento", () => {
    expect(ids(filtrarAvisos(lista, { ...V, texto: "manutencao" }))).toEqual(["1"]);
    expect(ids(filtrarAvisos(lista, { ...V, texto: "hoje" }))).toEqual(["2"]);
  });
  it("filtra pelo período inclusivo", () => {
    expect(ids(filtrarAvisos(lista, { ...V, de: "2026-11-08", ate: "2026-11-09" }))).toEqual(["1"]);
  });
  it("filtra por tipo e anexo", () => {
    expect(ids(filtrarAvisos(lista, { ...V, tipo: "geral" }))).toEqual(["2"]);
    expect(ids(filtrarAvisos(lista, { ...V, anexo: "com" }))).toEqual(["1"]);
  });
});
