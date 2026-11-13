/** Regras puras da Vitrine de Pets do condomínio. */
import { linkWhats } from "./cond-contatos";

export type PetVitrine = {
  id: string; nome: string; especie: string; raca?: string | null; porte?: string | null; cor?: string | null;
  foto_url?: string | null; observacoes?: string | null; bloco?: string | null; unidade?: string | null;
  tutor?: string | null; telefone?: string | null; desaparecido?: boolean; desaparecido_em?: string | null;
  desaparecido_obs?: string | null; meu?: boolean;
};

export const ESPECIES_PET = [
  { value: "cachorro", label: "Cachorro" }, { value: "gato", label: "Gato" },
  { value: "outro", label: "Outro" }, { value: "passaro", label: "Pássaro" },
];
export const especieLabel = (v?: string | null) => ESPECIES_PET.find((e) => e.value === v)?.label ?? "Outro";

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Filtra e ordena: desaparecidos primeiro, depois por nome. */
export function filtrarPets(pets: PetVitrine[], f: { busca?: string; especie?: string; somentePerdidos?: boolean }): PetVitrine[] {
  const t = norm(f.busca).trim();
  return pets
    .filter((p) => (!f.especie || f.especie === "todas" || p.especie === f.especie)
      && (!f.somentePerdidos || p.desaparecido)
      && (!t || [p.nome, p.raca, p.cor, p.unidade, p.bloco, especieLabel(p.especie)].some((x) => norm(x).includes(t))))
    .sort((a, b) => Number(!!b.desaparecido) - Number(!!a.desaparecido) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Mensagem pronta para o tutor ao encontrar o pet. */
export function mensagemAchei(pet: Pick<PetVitrine, "nome">, local: string, quem?: string): string {
  const l = local.trim();
  return `Olá! Encontrei o(a) ${pet.nome}${l ? ` em: ${l}` : ""}.${quem?.trim() ? ` Sou ${quem.trim()}.` : ""} Estou avisando pelo app do condomínio.`;
}

/** Link do WhatsApp do tutor com a mensagem; null quando não há celular válido. */
export function linkAchei(telefone: string | null | undefined, msg: string): string | null {
  const base = linkWhats(String(telefone ?? ""));
  return base ? `${base}?text=${encodeURIComponent(msg)}` : null;
}
