import { pick, type Row } from "@/lib/row";
import { text } from "@/lib/crud";

/** Nomes de colunas aceitos (schema tolerante). */
export const A = {
  pessoa: ["pessoa_id", "pessoas_id", "contato_id"],
  instancia: ["instancia_id", "empresas_instancias_id", "empresa_instancia_id"],
  kanban: ["kanban_nome_id", "kanban_id"],
  etapa: ["kanban_etapa_id", "kanban_etapas_id", "etapa_id"],
  status: ["status_atendimento", "situacao", "status"],
  modo: ["modo", "modo_atendimento", "atendido_por"],
  responsavel: ["usuario_responsavel_id", "responsavel_id"],
  naoLidas: ["nao_lidas", "qtd_nao_lidas", "mensagens_nao_lidas"],
  data: ["ultima_mensagem_em", "updated_at", "atualizado_em", "created_at", "criado_em"],
};

export const M = {
  atendimento: ["atendimento_id", "atendimentos_id"],
  texto: ["mensagem", "conteudo", "texto", "body", "descricao"],
  tipo: ["tipo", "tipo_mensagem", "message_type"],
  midia: ["midia_url", "url_midia", "url", "arquivo_url", "media_url"],
  interna: ["msg_interna", "interna", "nota_interna"],
  usuario: ["usuario_id", "enviado_por", "alterado_por"],
  data: ["created_at", "criado_em", "data_envio", "enviado_em"],
};

export function nomePessoa(p: Row | undefined) {
  return pick<string>(p, ["nome", "nome_completo", "razao_social", "apelido"], "Contato sem nome") ?? "";
}
export function telefonePessoa(p: Row | undefined) {
  return pick<string>(p, ["telefone", "celular", "whatsapp", "fone"], "") ?? "";
}
export function fotoPessoa(p: Row | undefined) {
  return pick<string>(p, ["foto", "foto_url", "avatar", "avatar_url", "imagem"]);
}
export function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?";
}

export type StatusAt = "aguardando" | "atendimento" | "encerrado";
export function statusDe(a: Row): StatusAt {
  const s = text(pick(a, A.status)).toLowerCase();
  if (/encerr|finaliz|fechad|conclu/.test(s)) return "encerrado";
  if (/aguard|pendente|fila|novo|aberto/.test(s) || s === "") return "aguardando";
  return "atendimento";
}
export const STATUS_LABEL: Record<StatusAt, string> = {
  aguardando: "Aguardando",
  atendimento: "Em atendimento",
  encerrado: "Encerrado",
};

export function isIA(a: Row) {
  const m = text(pick(a, A.modo)).toLowerCase();
  if (m) return /ia|bot|robo|ai/.test(m) && !/human/.test(m);
  return pick(a, A.responsavel) === undefined && statusDe(a) !== "encerrado";
}

/** Mensagem do cliente (entrada) x atendente/sistema (saída). */
export function isCliente(m: Row) {
  const fromMe = m["from_me"] ?? m["fromMe"] ?? m["enviada"];
  if (typeof fromMe === "boolean") return !fromMe;
  const dir = text(pick(m, ["direcao", "remetente", "origem", "autor"])).toLowerCase();
  if (dir) return /cliente|entrada|in|contato|recebid/.test(dir) && !/saida|out/.test(dir);
  return pick(m, M.usuario) === undefined;
}

export type TipoMidia = "texto" | "imagem" | "audio" | "video" | "documento" | "figurinha";
export function tipoMidia(m: Row): TipoMidia {
  const t = text(pick(m, M.tipo)).toLowerCase();
  const url = text(pick(m, M.midia)).toLowerCase();
  if (/sticker|figurinha/.test(t)) return "figurinha";
  if (/image|imagem|foto/.test(t) || /\.(png|jpe?g|gif|webp)(\?|$)/.test(url)) return "imagem";
  if (/audio|ptt|voz/.test(t) || /\.(ogg|mp3|m4a|opus|wav)(\?|$)/.test(url)) return "audio";
  if (/video/.test(t) || /\.(mp4|mov|webm)(\?|$)/.test(url)) return "video";
  if (/doc|pdf|arquivo|file/.test(t) || (url && !t)) return "documento";
  return "texto";
}

export function dataDe(r: Row | undefined, keys: string[]) {
  const v = pick<string>(r, keys);
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function horaCurta(d: Date | null) {
  if (!d) return "";
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function corEtiqueta(e: Row | undefined) {
  return pick<string>(e, ["cor_hex", "cor"], "#64748b") ?? "#64748b";
}

/** Etapas de um kanban, ordenadas. */
export function etapasDoKanban(etapas: Row[], kanbanId: string) {
  return etapas
    .filter((e) => text(pick(e, ["kanban_nome_id", "kanban_id"])) === kanbanId)
    .sort((a, b) => Number(pick(a, ["ordem", "posicao"]) ?? 0) - Number(pick(b, ["ordem", "posicao"]) ?? 0));
}
/** Etapa marcada com is_default_humano no kanban (ou a primeira, como fallback). */
export function etapaHumano(etapas: Row[], kanbanId: string) {
  const lista = etapasDoKanban(etapas, kanbanId);
  return lista.find((e) => e["is_default_humano"] === true) ?? lista[0];
}
/** Payload com todas as variações da coluna de etapa (filterPayload mantém a real). */
export function etapaPayload(etapaId: unknown) {
  const v = etapaId ?? null;
  return { kanban_etapa_id: v, kanban_etapas_id: v, etapa_id: v };
}
