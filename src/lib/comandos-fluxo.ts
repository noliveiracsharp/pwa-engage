/** Comandos globais do fluxo (#inicio, #atendente, #sair): valem em qualquer etapa da conversa. */
import type { DadosNo } from "@/lib/fluxos";

export type ComandoFluxo = "inicio" | "atendente" | "sair";

/** Palavras de fábrica — toda empresa já nasce com elas. */
export const COMANDOS_PADRAO: Record<ComandoFluxo, string[]> = {
  inicio: ["inicio", "menu", "comecar", "reiniciar", "voltar"],
  atendente: ["atendente", "humano", "falarcomatendente", "pessoa"],
  sair: ["sair", "cancelar", "parar"],
};

export const MENSAGENS_PADRAO = {
  atendente: "Entendido! Estou transferindo você para um de nossos atendentes. Aguarde um instante...",
  sair: "Atendimento encerrado. Quando precisar, é só mandar uma mensagem!",
};

const norm = (s: string) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9#]+/g, "");

const extras = (v: unknown) => String(v ?? "").split(",").map((p) => norm(p).replace(/^#/, "")).filter(Boolean);

/**
 * Detecta o comando. Aceita "#palavra" em qualquer lugar da mensagem, ou a palavra
 * sozinha (sem #) quando é a mensagem inteira. Palavras extras da empresa ficam no bloco Início.
 */
export function detectarComando(texto: string, config: DadosNo = {}): ComandoFluxo | null {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return null;
  const tags = [...bruto.matchAll(/#([\p{L}0-9_-]{1,40})/gu)].map((m) => norm(m[1]!));
  const inteira = norm(bruto).replace(/^#/, "");
  for (const cmd of ["atendente", "inicio", "sair"] as ComandoFluxo[]) {
    const lista = [...COMANDOS_PADRAO[cmd], ...extras(config[`cmd_${cmd}`])];
    if (tags.some((t) => lista.includes(t)) || lista.includes(inteira)) return cmd;
  }
  return null;
}

export const mensagemComando = (cmd: "atendente" | "sair", config: DadosNo = {}) =>
  String(config[`msg_${cmd}`] ?? "").trim() || MENSAGENS_PADRAO[cmd];
