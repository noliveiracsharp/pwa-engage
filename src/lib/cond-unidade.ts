/** Regras puras da unidade: veículos ativos, locação e transferência de bloco. */

/** Pode ligar mais um veículo? `limite` null/undefined = sem limite. */
export function podeAtivarVeiculo(ativosAtuais: number, limite: number | null | undefined): boolean {
  if (limite === null || limite === undefined) return true;
  return ativosAtuais < limite;
}

/** Limite que vale para a unidade: o próprio dela; se vazio, o padrão do condomínio; se ambos vazios, sem limite. */
export function limiteVeiculosUnidade(daUnidade: unknown, padrao: unknown): number | null {
  const n = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return n(daUnidade) ?? n(padrao);
}

/** Números de unidade que já existem no bloco de destino (comparação sem maiúsculas). */
export function numerosEmConflito(origem: string[], destino: string[]): string[] {
  const d = new Set(destino.map((n) => n.trim().toLowerCase()));
  return origem.filter((n) => d.has(n.trim().toLowerCase()));
}

/** Confirmação de exclusão em cascata: precisa digitar exatamente o nome do bloco. */
export function nomeConfere(digitado: string, nome: string): boolean {
  return digitado.trim().toLowerCase() === nome.trim().toLowerCase() && nome.trim() !== "";
}

/** Próxima ação de locação conforme a ocupação atual. */
export function acaoLocacao(ocupacao: string): "iniciar" | "encerrar" | null {
  if (ocupacao === "alugada") return "encerrar";
  if (ocupacao === "propria") return "iniciar";
  return null;
}
