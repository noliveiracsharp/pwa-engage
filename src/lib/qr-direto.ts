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

type NoAtalho = { id: string; type?: string; data?: Record<string, unknown> };

/** Tags configuradas no bloco "Mover no Kanban" (campo atalho, separado por vírgula). */
export function tagsDoNo(no: NoAtalho): string[] {
  return String(no.data?.["atalho"] ?? "").split(",").map((t) => tagDoKanban(t.replace(/^#/, ""))).filter(Boolean);
}

/**
 * Bloco onde a conversa entra pelo atalho: primeiro o bloco Kanban com a tag configurada;
 * senão, o bloco Kanban que move para a mesma etapa resolvida pelo nome do quadro.
 */
export function noDoAtalho(nos: NoAtalho[], tag: string, etapaId?: string | null): string | null {
  const kanban = nos.filter((n) => (n.data?.["tipo"] ?? n.type) === "kanban");
  const porTag = kanban.find((n) => tagsDoNo(n).includes(tag));
  if (porTag) return porTag.id;
  const porEtapa = etapaId ? kanban.find((n) => String(n.data?.["etapa_id"] ?? "") === String(etapaId)) : undefined;
  return porEtapa?.id ?? null;
}
