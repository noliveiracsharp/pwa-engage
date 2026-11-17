import { describe, expect, it } from "vitest";
import { chamadoAberto, entraNaGestao, permsMorador, visibilidadesDocumento } from "./morador-acesso";

describe("acesso do morador", () => {
  it("Equipe & Diretoria é só leitura (sem Adicionar)", () => expect(permsMorador("equipe").canCreate).toBe(false));
  it("Meu Condomínio não permite editar", () => expect(permsMorador("meu").canUpdate).toBe(false));
  it("Obras é só visualização", () => { const p = permsMorador("obras"); expect(p.canCreate || p.canUpdate || p.canDelete).toBe(false); });
  it("morador abre os próprios chamados", () => expect(permsMorador("atendimentos").canCreate).toBe(true));
  it("seções administrativas ficam ocultas", () => { expect(permsMorador("unidades").canRead).toBe(false); expect(permsMorador("manutencoes").canRead).toBe(false); });
  it("inquilino não vê documentos de proprietários", () => expect(visibilidadesDocumento("inquilino")).toEqual(["moradores"]));
  it("proprietário vê documentos de proprietários", () => expect(visibilidadesDocumento("proprietario")).toContain("proprietarios"));
  it("login Master em unidade de morador não vai para a gestão", () => expect(entraNaGestao(false)).toBe(false));
  it("chamado finalizado não conta como aberto", () => { expect(chamadoAberto("finalizado")).toBe(false); expect(chamadoAberto("respondida")).toBe(true); });
});

import { permsFichaMorador as pf } from "./morador-acesso";
describe("permsFichaMorador", () => {
  it("condomínio permite e perfil permite: libera", () => expect(pf(true, true).canUpdate).toBe(true));
  it("condomínio não permite: bloqueia", () => expect(pf(true, false).canUpdate).toBe(false));
  it("config ausente: bloqueia", () => expect(pf(true, undefined).canCreate).toBe(false));
  it("perfil sem alteração: bloqueia mesmo com condomínio liberando", () => expect(pf(false, true).canUpdate).toBe(false));
});
