/** Conciliação bancária: casa movimentações do extrato com títulos em aberto. Funções puras. */
export type Movimento = { data: string; operacao: "C" | "D"; valor: number; descricao: string; titulo: string; tipo?: string };
export type TituloAberto = { id: string; tipo: string; valor: number; valor_pago?: number | null; vencimento: string; nome?: string; descricao?: string };
export type Par = { mov: number; tituloId: string; confianca: "alta" | "media"; dias: number };

export const JANELA_DIAS = 10;

const dias = (a: string, b: string) => Math.abs((Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000);
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const saldo = (t: TituloAberto) => Math.round((t.valor - (Number(t.valor_pago) || 0)) * 100) / 100;

/** Alguma palavra (4+ letras) do nome do cliente/fornecedor aparece no extrato? */
export function nomeConfere(mov: Movimento, nome?: string) {
  if (!nome) return false;
  const texto = norm(`${mov.titulo} ${mov.descricao}`);
  return norm(nome).split(/[^a-z0-9]+/).some((p) => p.length >= 4 && texto.includes(p));
}

/**
 * Entrada (C) casa com contas a receber; saída (D) com contas a pagar.
 * Exige mesmo valor (centavos) e vencimento a até 10 dias. Cada título é usado uma vez.
 * Confiança alta: único candidato ou nome confere; média: escolhido pela data mais próxima.
 */
export function sugerirConciliacao(movs: Movimento[], titulos: TituloAberto[]): Par[] {
  const usados = new Set<string>();
  const pares: Par[] = [];
  movs.forEach((m, i) => {
    const tipo = m.operacao === "C" ? "receber" : "pagar";
    const cands = titulos
      .filter((t) => t.tipo === tipo && !usados.has(t.id) && Math.abs(saldo(t) - m.valor) < 0.01 && dias(t.vencimento, m.data) <= JANELA_DIAS)
      .map((t) => ({ t, d: dias(t.vencimento, m.data), nome: nomeConfere(m, t.nome) }))
      .sort((a, b) => Number(b.nome) - Number(a.nome) || a.d - b.d);
    const melhor = cands[0];
    if (!melhor) return;
    usados.add(melhor.t.id);
    const alta = cands.length === 1 || (melhor.nome && !cands[1]?.nome);
    pares.push({ mov: i, tituloId: melhor.t.id, confianca: alta ? "alta" : "media", dias: melhor.d });
  });
  return pares;
}
