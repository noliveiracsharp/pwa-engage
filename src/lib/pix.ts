/** Pix "copia e cola" (BR Code EMV do Banco Central) — puro, sem depender de API do banco. */

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** Remove acentos e caracteres fora do padrão EMV. */
const limpar = (v: string, max: number) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .\-]/g, "").trim().toUpperCase().slice(0, max);

/** CRC16-CCITT (poly 0x1021, inicial 0xFFFF), exigido no campo 63. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Normaliza a chave: CPF/CNPJ/telefone só dígitos (telefone com +55), e-mail minúsculo, aleatória como veio. */
export function normalizarChavePix(chave: string): string {
  const c = chave.trim();
  if (c.includes("@")) return c.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(c)) return c.toLowerCase();
  const d = c.replace(/\D/g, "");
  if (c.startsWith("+")) return `+${d}`;
  return d || c;
}

export type PixOpts = { chave: string; nome: string; cidade: string; valor?: number; txid?: string; descricao?: string };

export function gerarPixCopiaECola(o: PixOpts): string {
  const chave = normalizarChavePix(o.chave);
  if (!chave) throw new Error("Conta sem chave Pix.");
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave) + (o.descricao ? campo("02", limpar(o.descricao, 40)) : "");
  const txid = (o.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  let p = campo("00", "01") + campo("26", conta) + campo("52", "0000") + campo("53", "986");
  if (o.valor && o.valor > 0) p += campo("54", o.valor.toFixed(2));
  p += campo("58", "BR") + campo("59", limpar(o.nome, 25) || "RECEBEDOR") + campo("60", limpar(o.cidade, 15) || "BRASIL");
  p += campo("62", campo("05", txid)) + "6304";
  return p + crc16(p);
}

export const BANCOS = [
  { codigo: "077", nome: "Banco Inter" },
  { codigo: "033", nome: "Santander" },
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "104", nome: "Caixa" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "403", nome: "Cora" },
  { codigo: "000", nome: "Outro" },
];
export const nomeBanco = (c: unknown) => BANCOS.find((b) => b.codigo === String(c ?? ""))?.nome ?? "Banco";

/** Mensagem de cobrança para WhatsApp. */
export function mensagemCobranca(o: { cliente: string; descricao: string; valor: string; vencimento: string; pix?: string; linha?: string; boletoUrl?: string; empresa: string }) {
  const l = [`Olá, ${o.cliente || "cliente"}!`, "", `Segue a cobrança de *${o.empresa}*:`, `📄 ${o.descricao}`, `💰 Valor: *${o.valor}*`, `📅 Vencimento: ${o.vencimento}`];
  if (o.linha) l.push("", "🏦 *Boleto — linha digitável:*", o.linha);
  if (o.boletoUrl) l.push(`🔗 Boleto em PDF: ${o.boletoUrl}`);
  if (o.pix) l.push("", "⚡ *Pix copia e cola:*", o.pix);
  l.push("", "_Mensagem automática do sistema._");
  return l.join("\n");
}
