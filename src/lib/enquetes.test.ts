import { describe, expect, it } from "vitest";
import { agregarEscala, agregarOpcoes, elegivel, errosPublicacao, idade, statusEfetivo, validarRespostas, type Pergunta, type Pessoa } from "./enquetes";

const ref = new Date(2026, 10, 11);
const base: Pessoa = { papel: "proprietario", bloco_id: "A", genero: "F", data_nascimento: "1960-01-01", is_residente: true };
const unica: Pergunta = { id: "q1", ordem: 0, texto: "Cor?", tipo: "unica", obrigatoria: true, opcoes: [{ id: "a", texto: "Azul" }, { id: "b", texto: "Verde" }] };

describe("enquetes", () => {
  it("idade conta aniversário", () => { expect(idade("2014-11-12", ref)).toBe(11); expect(idade("2014-11-11", ref)).toBe(12); });
  it("melhor idade só 60+", () => {
    expect(elegivel(base, { idade_min: 60 }, ref)).toBe(true);
    expect(elegivel({ ...base, data_nascimento: "1990-01-01" }, { idade_min: 60 }, ref)).toBe(false);
  });
  it("crianças até 12 e sem data de nascimento fica fora", () => {
    expect(elegivel({ ...base, papel: "familiar", data_nascimento: "2018-05-01" }, { idade_max: 12 }, ref)).toBe(true);
    expect(elegivel({ ...base, data_nascimento: null }, { idade_max: 12 }, ref)).toBe(false);
  });
  it("só mulheres", () => { expect(elegivel({ ...base, genero: "M" }, { generos: ["F"] }, ref)).toBe(false); });
  it("prestador nunca vota", () => { expect(elegivel({ ...base, papel: "prestador" }, {}, ref)).toBe(false); });
  it("filtra por torre", () => { expect(elegivel(base, { blocos: ["B"] }, ref)).toBe(false); });
  it("ativa com prazo vencido vira encerrada", () => {
    expect(statusEfetivo("ativa", "2026-11-10T00:00:00Z", ref)).toBe("encerrada");
    expect(statusEfetivo("rascunho", "2026-11-10T00:00:00Z", ref)).toBe("rascunho");
  });
  it("publicar exige 2 opções", () => { expect(errosPublicacao("T", [{ ...unica, opcoes: [unica.opcoes[0]!] }])).toHaveLength(1); });
  it("escolha única aceita só uma opção", () => {
    expect(validarRespostas([unica], [{ pergunta_id: "q1", opcoes: ["a", "b"] }])).toMatch(/apenas uma/);
    expect(validarRespostas([unica], [{ pergunta_id: "q1", opcoes: ["a"] }])).toBeNull();
    expect(validarRespostas([unica], [])).toMatch(/Responda/);
  });
  it("pizza soma 100%", () => {
    const r = agregarOpcoes(unica, [{ opcoes: ["a"] }, { opcoes: ["a"] }, { opcoes: ["b"] }, { opcoes: ["a"] }]);
    expect(r.fatias.map((f) => f.pct)).toEqual([75, 25]);
  });
  it("média da escala", () => { expect(agregarEscala([{ nota: 5 }, { nota: 4 }, { nota: null }]).media).toBe(4.5); });
});
