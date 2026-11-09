/** Regras puras da unidade: veículos ativos, locação e transferência de bloco. */

/** Pode ligar mais um veículo? `limite` null/undefined = sem limite. */
export function podeAtivarVeiculo(ativosAtuais: number, limite: number | null | undefined): boolean {
  if (limite === null || limite === undefined) return true;
  return ativosAtuais < limite;
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
