export const SEM_CLASSIFICACAO = "__sem__";

/** Empty selection = all; SEM_CLASSIFICACAO matches rows without classificacao_id. */
export function passaClassificacao(sel: string[], classificacaoId: unknown): boolean {
  if (sel.length === 0) return true;
  const id = classificacaoId == null ? "" : String(classificacaoId);
  return id ? sel.includes(id) : sel.includes(SEM_CLASSIFICACAO);
}
