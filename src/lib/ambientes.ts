// Ambientes de acesso: um mesmo login pode ser da empresa (gestão) e morador de unidades.

export type VinculoAcesso = {
  vinculo_id: string;
  unidade_id: string;
  condominio_id: string;
  condominio_nome: string;
  bloco: string | null;
  numero: string;
  papel: string;
};

export type Ambiente =
  | { tipo: "empresa"; id: "empresa"; titulo: string; subtitulo: string }
  | { tipo: "unidade"; id: string; titulo: string; subtitulo: string; vinculo: VinculoAcesso };

export const AMBIENTE_KEY = "atendeai.ambiente";

const PAPEIS: Record<string, string> = {
  proprietario: "Proprietário", inquilino: "Inquilino", familiar: "Familiar", preposto: "Preposto",
  prestador: "Prestador", colaborador: "Colaborador", visitante: "Visitante",
};
export const rotuloPapel = (p: string) => PAPEIS[p] ?? p;

/** Monta a lista de ambientes; a gestão da empresa sempre vem primeiro. */
export function montarAmbientes(empresa: { nome: string; perfil: string } | null, vinculos: VinculoAcesso[]): Ambiente[] {
  const lista: Ambiente[] = [];
  if (empresa) lista.push({ tipo: "empresa", id: "empresa", titulo: empresa.nome, subtitulo: empresa.perfil || "Gestão da empresa" });
  const vistos = new Set<string>();
  const ordenados = [...vinculos].sort((a, b) =>
    a.condominio_nome.localeCompare(b.condominio_nome, "pt-BR") || `${a.bloco ?? ""}${a.numero}`.localeCompare(`${b.bloco ?? ""}${b.numero}`, "pt-BR", { numeric: true }));
  for (const v of ordenados) {
    if (vistos.has(v.unidade_id)) continue;
    vistos.add(v.unidade_id);
    const local = [v.bloco, `Unidade ${v.numero}`].filter(Boolean).join(" · ");
    lista.push({ tipo: "unidade", id: v.unidade_id, titulo: v.condominio_nome, subtitulo: `${rotuloPapel(v.papel)} · ${local}`, vinculo: v });
  }
  return lista;
}

/** Só pergunta "onde entrar" quando há mais de um ambiente. */
export const precisaEscolher = (ambientes: Ambiente[]) => ambientes.length > 1;

export const destinoDoAmbiente = (a: Ambiente) => (a.tipo === "empresa" ? "/dashboard" : "/minha-unidade");
