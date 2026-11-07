import { describe, expect, it } from "vitest";
import { imagensDoHtml, papelNoPublico, planejarEnvios, preencherAviso, tipoMidiaAviso, validarAviso, validarMidiaAviso, type Destinatario } from "./cond-avisos";

const d = (o: Partial<Destinatario>): Destinatario => ({ condominio_id: "c1", cond_unidade_id: "u1", unidade: "101", bloco: "Torre 1", usuario_id: "p1", nome: "Ana Lima", email: "ana@x.com", celular: "(11) 99999-0000", papel: "proprietario", ...o });

describe("avisos do condomínio", () => {
  it("proprietários não inclui inquilino", () => {
    expect(papelNoPublico("inquilino", "proprietarios")).toBe(false);
    expect(papelNoPublico("proprietario", "proprietarios")).toBe(true);
  });
  it("titulares exclui família; todos inclui família", () => {
    expect(papelNoPublico("familiar", "titulares")).toBe(false);
    expect(papelNoPublico("familiar", "todos")).toBe(true);
  });
  it("prestador nunca recebe aviso", () => {
    expect(papelNoPublico("prestador", "todos")).toBe(false);
  });
  it("pessoa com duas unidades no mesmo condomínio recebe uma mensagem por canal", () => {
    const r = planejarEnvios([d({}), d({ cond_unidade_id: "u2", unidade: "102" })], "todos", ["whatsapp", "email"]);
    expect(r.envios).toHaveLength(2);
    expect(r.envios[0]!.unidades).toBe("Torre 1 · 101, Torre 1 · 102");
  });
  it("mesma pessoa em condomínios diferentes recebe em cada um", () => {
    const r = planejarEnvios([d({}), d({ condominio_id: "c2" })], "todos", ["email"]);
    expect(r.envios).toHaveLength(2);
  });
  it("conta quem não tem contato no canal escolhido", () => {
    const r = planejarEnvios([d({ celular: null })], "todos", ["whatsapp"]);
    expect(r.envios).toHaveLength(0);
    expect(r.semContato).toBe(1);
  });
  it("preenche variáveis com o primeiro nome", () => {
    expect(preencherAviso("Olá {{nome}}, unidade {{unidade}} do {{condominio}}", { nome: "Ana Lima", unidade: "101", condominio: "Solar" })).toBe("Olá Ana, unidade 101 do Solar");
  });
  it("exige ao menos um canal", () => {
    expect(validarAviso({ titulo: "a", mensagemTexto: "b", canais: [], condominios: ["c1"] })).toMatch(/canal/);
  });
});

describe("anexo do aviso", () => {
  it("aceita imagem, vídeo MP4 e PDF", () => {
    expect(tipoMidiaAviso("image/png")).toBe("imagem");
    expect(tipoMidiaAviso("video/mp4")).toBe("video");
    expect(tipoMidiaAviso("application/pdf")).toBe("documento");
    expect(tipoMidiaAviso("application/zip", "a.zip")).toBeNull();
  });
  it("recusa vídeo acima de 16 MB", () => {
    expect(validarMidiaAviso({ type: "video/mp4", name: "v.mp4", size: 17 * 1024 * 1024 })).toMatch(/16 MB/);
    expect(validarMidiaAviso({ type: "video/mp4", name: "v.mp4", size: 15 * 1024 * 1024 })).toBeNull();
  });
});

describe("imagem dentro do texto do aviso", () => {
  const base = { titulo: "Festa", canais: ["whatsapp" as const], condominios: ["c1"] };
  it("aceita aviso que é só uma imagem", () => {
    expect(validarAviso({ ...base, mensagemTexto: "", temImagem: true })).toBeNull();
    expect(validarAviso({ ...base, mensagemTexto: "" })).toMatch(/imagem/);
  });
  it("lista as imagens http(s) em ordem, sem repetir e ignorando data:", () => {
    expect(imagensDoHtml('<p>a</p><img src="https://x/1.png"><img src=\'https://x/2.jpg\'><img src="https://x/1.png"><img src="data:image/png;base64,AA">')).toEqual(["https://x/1.png", "https://x/2.jpg"]);
  });
});
