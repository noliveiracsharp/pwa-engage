/** Valores de teste dos fluxos (telefone, e-mail…): ficam só neste navegador e nunca são usados em produção. */
const CHAVE = "fluxos-dados-teste";
export const PADRAO_TESTE: Record<string, string> = { protocolo: "2026-000123", nome: "Cliente Teste", telefone: "5511999999999", email: "" };
export function lerDadosTeste(): Record<string, string> {
  if (typeof window === "undefined") return { ...PADRAO_TESTE };
  try { return { ...PADRAO_TESTE, ...(JSON.parse(localStorage.getItem(CHAVE) || "{}") as Record<string, string>) }; } catch { return { ...PADRAO_TESTE }; }
}
export function salvarDadosTeste(v: Record<string, string>) {
  try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem armazenamento */ }
}
