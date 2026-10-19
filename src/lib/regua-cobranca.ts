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

const escHtml = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: unknown) => { const s = String(iso ?? "").slice(0, 10); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ""; };

export type DadosEmailCobranca = {
  empresaNome: string; logo?: string | null; cor: string; cliente: string; dias: number;
  descricao: string; valor: number; vencimento: string; linhaDigitavel?: string; link: string; pixel?: string;
};

/** Layout oficial do e-mail de cobrança (espelhado na Edge Function cobranca-regua). */
export function montarEmailCobrancaHtml(d: DadosEmailCobranca): string {
  const cor = d.cor || "#2563eb";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:100%">
<tr><td style="background:${cor};padding:20px;color:#fff;font-size:18px;font-weight:bold">${d.logo ? `<img src="${escHtml(d.logo)}" height="36" alt="">` : escHtml(d.empresaNome)}</td></tr>
<tr><td style="padding:24px;color:#18181b;font-size:15px;line-height:1.5">
<p>Olá, ${escHtml(d.cliente)}!</p><p>${escHtml(avisoEtapa(d.dias))}</p>
<table width="100%" style="background:#f4f4f5;border-radius:8px;padding:12px;margin:16px 0">
<tr><td>${escHtml(d.descricao)}</td></tr><tr><td style="font-size:22px;font-weight:bold">${brl(d.valor)}</td></tr><tr><td>Vencimento: ${dataBR(d.vencimento)}</td></tr></table>
<p style="text-align:center"><a href="${escHtml(d.link)}" style="background:${cor};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Ver boleto, Pix e nota fiscal</a></p>
${d.linhaDigitavel ? `<p style="font-size:12px;color:#52525b">Linha digitável:<br><b>${escHtml(d.linhaDigitavel)}</b></p>` : ""}
<p style="font-size:12px;color:#71717a">Se já realizou o pagamento, desconsidere esta mensagem.</p>
</td></tr></table></td></tr></table>${d.pixel ? `<img src="${escHtml(d.pixel)}" width="1" height="1" alt="">` : ""}</body></html>`;
}

/** Dados fictícios usados na prévia e no e-mail de teste. */
export const EXEMPLO_EMAIL = { cliente: "Cliente Exemplo", dias: -5, descricao: "Mensalidade — exemplo", valor: 299.9, linhaDigitavel: "00190.00009 01234.567890 12345.678901 1 23450000029990" };
