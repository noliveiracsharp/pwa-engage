/** QR Code "direto para o Comercial": a marca no texto inicial faz a conversa pular o robô. */
export const MARCA_COMERCIAL = "[#COMERCIAL]";

export function ehDiretoComercial(texto: string): boolean {
  return /\[#comercial\]/i.test(texto ?? "");
}

/** Link wa.me com a mensagem inicial já preenchida e a marca no final. */
export function linkDiretoComercial(telefone: string, mensagem: string): string {
  const fone = String(telefone ?? "").replace(/\D/g, "");
  const texto = `${(mensagem || "Olá! Gostaria de falar com o time Comercial.").trim()} ${MARCA_COMERCIAL}`;
  return `https://wa.me/${fone}?text=${encodeURIComponent(texto)}`;
}
