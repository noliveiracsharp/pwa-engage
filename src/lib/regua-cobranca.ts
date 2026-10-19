/** Régua de cobrança: regras puras (a mesma lógica roda no motor "cobranca-regua"). */
export type Canal = "whatsapp" | "email";
export type Etapa = { dias: number; canais: Canal[]; ativo: boolean };
export type PreferenciaCliente = "" | "padrao" | "whatsapp" | "email" | "ambos" | "nenhum" | null | undefined;

export const ETAPAS_PADRAO: Etapa[] = [
  { dias: -5, canais: ["email"], ativo: true },
  { dias: -2, canais: ["whatsapp", "email"], ativo: true },
  { dias: 0, canais: ["whatsapp", "email"], ativo: true },
  { dias: 3, canais: ["whatsapp", "email"], ativo: true },
  { dias: 7, canais: ["whatsapp"], ativo: true },
];

export const MODELO_WHATSAPP_PADRAO =
  "Olá, {cliente}! Aqui é da {empresa}.\n{aviso}\n\n{descricao}\nValor: {valor}\nVencimento: {vencimento}\n\nBoleto, Pix e nota fiscal: {link}";
export const MODELO_EMAIL_ASSUNTO_PADRAO = "{empresa} — cobrança {descricao} (vence {vencimento})";

const DIA = 86_400_000;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Dias entre hoje e o vencimento: negativo = antes de vencer, positivo = em atraso. */
export function diasDoVencimento(vencimento: string, hoje: string): number {
  return Math.round((utc(hoje) - utc(vencimento)) / DIA);
}

export function rotuloEtapa(dias: number): string {
  if (dias === 0) return "No dia do vencimento";
  const n = Math.abs(dias);
  return dias < 0 ? `${n} dia${n > 1 ? "s" : ""} antes` : `${n} dia${n > 1 ? "s" : ""} após (atraso)`;
}

export function avisoEtapa(dias: number): string {
  if (dias < 0) return `Lembrete: sua fatura vence em ${Math.abs(dias)} dia(s).`;
  if (dias === 0) return "Sua fatura vence hoje.";
  return `Identificamos que a fatura está em aberto há ${dias} dia(s). Se já pagou, desconsidere.`;
}

/** Etapas ativas que caem exatamente hoje para esse vencimento. */
export function etapasDoDia(vencimento: string, hoje: string, etapas: Etapa[]): Etapa[] {
  const d = diasDoVencimento(vencimento, hoje);
  return etapas.filter((e) => e.ativo && e.dias === d);
}

/** Canais finais: canais da etapa ∩ canais ligados na empresa ∩ preferência do cliente. */
export function canaisEfetivos(etapa: Etapa, canaisEmpresa: Canal[], pref: PreferenciaCliente): Canal[] {
  const cliente: Canal[] | null =
    pref === "nenhum" ? [] : pref === "whatsapp" ? ["whatsapp"] : pref === "email" ? ["email"] : pref === "ambos" ? ["whatsapp", "email"] : null;
  return etapa.canais.filter((c) => canaisEmpresa.includes(c) && (cliente === null || cliente.includes(c)));
}

export type ModoEmissao = { modo: "nao" | "dias_antes" | "dia_mes"; dias_antes?: number; dia_mes?: number };

/** Se o boleto deve ser emitido hoje (automático). */
export function deveEmitirBoleto(vencimento: string, hoje: string, cfg: ModoEmissao, jaEmitido: boolean): boolean {
  if (jaEmitido || cfg.modo === "nao") return false;
  const d = diasDoVencimento(vencimento, hoje);
  if (d > 0) return false; // vencido não gera boleto novo
  if (cfg.modo === "dias_antes") return -d <= Math.max(0, cfg.dias_antes ?? 0);
  // dia_mes: no dia escolhido emite tudo que vence nos próximos 31 dias
  return Number(hoje.slice(8, 10)) === (cfg.dia_mes ?? 1) && -d <= 31;
}

export function preencherModelo(modelo: string, vars: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] ?? m));
}
