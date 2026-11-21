import type { Row } from "@/lib/row";

export type ContextoFinanceiro = { id: string; nome: string; documento: string; tipo: "administradora" | "condominio"; empresa: Row };

/** A seleção só vale enquanto a entidade continua na carteira autorizada. */
export function contextoFinanceiroAtual(opcoes: ContextoFinanceiro[], id: string, origemId: string) {
  return opcoes.find((o) => o.id === id) ?? opcoes.find((o) => o.id === origemId) ?? null;
}

export function empresaDaConsulta(escopoFinanceiro: boolean, isMaster: boolean, empresaId: string, usuarioEmpresaId: string) {
  return escopoFinanceiro || isMaster ? empresaId || "__sem_empresa__" : usuarioEmpresaId || "__sem_empresa__";
}