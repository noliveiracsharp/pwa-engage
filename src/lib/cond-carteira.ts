/** Resumo da carteira: quantas empresas de cada papel e quantos condomínios cada uma atende. */
export type CondGestao = { id: string; administradora_id?: string | null; facilities_id?: string | null; tipo_gestao?: string | null };
export type SindGestao = { condominio_id: string; modalidade?: string | null; empresa_id?: string | null };
export type GrupoCarteira = { empresas: number; condominios: number; ranking: { empresaId: string; condominios: string[] }[] };

function agrupar(pares: [string, string][]): GrupoCarteira {
  const m = new Map<string, Set<string>>();
  for (const [emp, cond] of pares) if (emp) m.set(emp, (m.get(emp) ?? new Set()).add(cond));
  const ranking = [...m.entries()].map(([empresaId, cs]) => ({ empresaId, condominios: [...cs] })).sort((a, b) => b.condominios.length - a.condominios.length);
  return { empresas: m.size, condominios: new Set(pares.filter(([e]) => e).map(([, c]) => c)).size, ranking };
}

export function resumoCarteira(conds: CondGestao[], sind: SindGestao[]) {
  const ids = new Set(conds.map((c) => c.id));
  const sindValidos = sind.filter((x) => ids.has(x.condominio_id));
  return {
    administradoras: agrupar(conds.filter((c) => c.tipo_gestao !== "autogestao").map((c) => [c.administradora_id ?? "", c.id])),
    autogestao: conds.filter((c) => c.tipo_gestao === "autogestao").length,
    facilities: agrupar(conds.map((c) => [c.facilities_id ?? "", c.id])),
    sindicatura: agrupar(sindValidos.filter((x) => x.modalidade === "profissional").map((x) => [x.empresa_id ?? "", x.condominio_id])),
    sindicoMorador: sindValidos.filter((x) => x.modalidade === "morador").length,
  };
}

/** Condomínio padrão só vale se ainda estiver na lista visível ao usuário. */
export function condominioInicial(padrao: string | null, disponiveis: string[]): string {
  if (padrao && disponiveis.includes(padrao)) return padrao;
  return disponiveis.length === 1 ? disponiveis[0]! : "";
}
