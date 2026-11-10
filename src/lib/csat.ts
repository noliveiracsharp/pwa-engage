/** Pesquisa de satisfação (CSAT) enviada ao encerrar o atendimento pelo WhatsApp. */

export const CSAT_OPCOES = [
  "1 ⭐ Ruim",
  "2 ⭐⭐ Regular",
  "3 ⭐⭐⭐ Bom",
  "4 ⭐⭐⭐⭐ Muito bom",
  "5 ⭐⭐⭐⭐⭐ Excelente",
];

/** A lista devolve o id da linha; em ordem crescente, linha N = nota N (também vale para o texto numerado de reserva). */
export const notaDaLinha = (id: string): number | null => {
  const i = Number(id);
  return Number.isInteger(i) && i >= 0 && i <= CSAT_OPCOES.length ? i : null;
};

export const CSAT_AGRADECIMENTO_PADRAO =
  "Muito obrigado pela sua avaliação! Registramos sua nota com sucesso. Se precisar de um novo atendimento, estamos à sua disposição. 👋";

/**
 * Reconhece uma nota de 0 a 5 em respostas curtas: "5", "nota 4", "5 estrelas", "⭐⭐⭐", "5 ⭐⭐⭐⭐⭐ Excelente".
 * Mensagens longas ou sem nota clara retornam null (seguem como conversa nova).
 */
export function detectarNota(texto: string): number | null {
  const t = (texto ?? "").trim();
  if (!t || t.length > 40) return null;
  const linha = CSAT_OPCOES.findIndex((o) => o.toLowerCase() === t.toLowerCase());
  if (linha >= 0) return linha + 1;
  const nums = t.match(/\d+/g) ?? [];
  if (nums.length === 1) {
    const n = Number(nums[0]);
    const resto = t.replace(/\d+/g, "").replace(/[⭐★✨!.,:\-\s]/g, "").toLowerCase();
    const palavras = /^(nota|estrelas?|excelente|otimo|ótimo|muitobom|bom|regular|ruim|pessimo|péssimo)*$/;
    if (n >= 0 && n <= 5 && palavras.test(resto)) return n;
    return null;
  }
  if (nums.length === 0) {
    const estrelas = (t.match(/⭐|★/g) ?? []).length;
    const resto = t.replace(/⭐|★|\s|\uFE0F/g, "");
    if (estrelas >= 1 && estrelas <= 5 && !resto) return estrelas;
  }
  return null;
}
