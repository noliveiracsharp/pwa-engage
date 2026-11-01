/** Atalho de acesso: "#nome-do-kanban" na primeira mensagem pula o robô e cai direto no Kanban. */

/** Normaliza o nome do Kanban para virar tag: sem acento, minúsculo, sem espaços. */
export function tagDoKanban(nome: string): string {
  return String(nome ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Extrai a tag (#oferta, [#OFERTA]) da mensagem; null quando não há. */
export function extrairTagAcesso(texto: string): string | null {
  const m = /(?:^|[\s[(])#([\p{L}0-9_-]{2,40})/u.exec(String(texto ?? ""));
  return m ? tagDoKanban(m[1]!) || null : null;
}

/** Link wa.me com a mensagem inicial e a tag do Kanban no final. */
export function linkAcessoKanban(telefone: string, mensagem: string, kanbanNome: string): string {
  const fone = String(telefone ?? "").replace(/\D/g, "");
  const texto = `${(mensagem || "Olá!").trim()} #${tagDoKanban(kanbanNome)}`;
  return `https://wa.me/${fone}?text=${encodeURIComponent(texto)}`;
}
