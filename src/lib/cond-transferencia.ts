/** Regras puras de exclusão/transferência de unidades (espelhadas nas RPCs do SQL). */

export type Impacto = {
  pessoas: number;
  veiculos: number;
  pets: number;
  contatos: number;
  documentos: number;
  vagas: number;
  agendamentos: number;
  agendamentos_lista?: { espaco: string; inicio: string; fim?: string | null; titular?: string | null }[];
};

export type Opcoes = {
  veiculos: boolean;
  pets: boolean;
  contatos: boolean;
  documentos: boolean;
  vagas: boolean;
  agendamentos: boolean;
};

export const OPCOES_PADRAO: Opcoes = { veiculos: true, pets: true, contatos: true, documentos: true, vagas: true, agendamentos: true };

export const ITENS_IMPACTO: { k: keyof Opcoes | "pessoas"; l: string }[] = [
  { k: "pessoas", l: "Pessoas vinculadas" },
  { k: "veiculos", l: "Veículos" },
  { k: "pets", l: "Pets" },
  { k: "contatos", l: "Contatos de emergência" },
  { k: "documentos", l: "Documentos" },
  { k: "vagas", l: "Vagas de garagem" },
  { k: "agendamentos", l: "Agendamentos ativos" },
];

export function unidadeVazia(i: Impacto): boolean {
  return ITENS_IMPACTO.every((x) => (i[x.k] ?? 0) === 0);
}

/** Ocupação derivada dos papéis dos vínculos restantes. */
export function ocupacaoPorPapeis(papeis: string[]): "alugada" | "propria" | "vazia" {
  if (papeis.includes("inquilino")) return "alugada";
  if (papeis.some((p) => p === "proprietario" || p === "preposto")) return "propria";
  return "vazia";
}

/** Exclusão em cascata exige digitar exatamente o número da unidade. */
export function confirmacaoValida(digitado: string, numero: string): boolean {
  return digitado.trim().toLowerCase() === numero.trim().toLowerCase() && numero.trim() !== "";
}
