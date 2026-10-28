import { describe, expect, it, vi } from "vitest";
import { confirmarSalvamento, reconciliarLinhasSalvas } from "./oferta-salvamento";
import { novaLinha } from "./orcamentos";

describe("salvamento dos itens da revisão", () => {
  it("não marca a Oferta como salva enquanto a gravação estiver pendente", async () => {
    let concluir: (value: string) => void = () => {};
    const pendente = new Promise<string>((resolve) => { concluir = resolve; });
    const confirmar = vi.fn();
    const tarefa = confirmarSalvamento(() => pendente, confirmar);
    expect(confirmar).not.toHaveBeenCalled();
    concluir("salva");
    await tarefa;
    expect(confirmar).toHaveBeenCalledWith("salva");
  });
  it("mantém as alterações locais quando a gravação falha", async () => {
    const confirmar = vi.fn();
    await expect(confirmarSalvamento(() => Promise.reject(new Error("falha")), confirmar)).rejects.toThrow("falha");
    expect(confirmar).not.toHaveBeenCalled();
  });
  it("preserva a exclusão e os valores alterados após salvar a Rev. 2", () => {
    const enviada = { ...novaLinha(), key: "local", id: "mantido", item_id: "camera", quantidade: "3", valor_unitario: "150" };
    const resultado = reconciliarLinhasSalvas([{ id: "mantido", item_id: "camera", quantidade: 3, valor_unitario: 150 }], [enviada]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ id: "mantido", key: "local", quantidade: "3", valor_unitario: "150" });
    expect(resultado.some((linha) => linha.id === "removido")).toBe(false);
  });
  it("associa o ID gravado à linha nova sem mudar a chave do editor", () => {
    const enviada = { ...novaLinha(), key: "nova-local", item_id: "novo" };
    expect(reconciliarLinhasSalvas([{ id: "id-gerado", item_id: "novo", quantidade: 1 }], [enviada])[0]).toMatchObject({ id: "id-gerado", key: "nova-local" });
  });
});