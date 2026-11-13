import { describe, expect, it } from "vitest";
import { filtrarPets, linkAchei, mensagemAchei, type PetVitrine } from "./pets";

const pets: PetVitrine[] = [
  { id: "1", nome: "Thor", especie: "cachorro", unidade: "101" },
  { id: "2", nome: "Mia", especie: "gato", unidade: "202", desaparecido: true },
  { id: "3", nome: "Bidu", especie: "cachorro", raca: "Poodle" },
];

describe("vitrine de pets", () => {
  it("coloca desaparecidos no topo", () => expect(filtrarPets(pets, {}).map((p) => p.id)).toEqual(["2", "3", "1"]));
  it("filtra por espécie e busca sem acento", () => {
    expect(filtrarPets(pets, { especie: "cachorro" }).map((p) => p.id)).toEqual(["3", "1"]);
    expect(filtrarPets(pets, { busca: "póodle" }).map((p) => p.id)).toEqual(["3"]);
  });
  it("filtra só perdidos", () => expect(filtrarPets(pets, { somentePerdidos: true }).map((p) => p.id)).toEqual(["2"]));
  it("monta link do WhatsApp com a mensagem", () => {
    const m = mensagemAchei({ nome: "Mia" }, "Hall do bloco A");
    expect(m).toContain("Hall do bloco A");
    expect(linkAchei("(11) 99234-1234", m)).toBe(`https://wa.me/5511992341234?text=${encodeURIComponent(m)}`);
    expect(linkAchei("1133334444", m)).toBeNull();
  });
});
