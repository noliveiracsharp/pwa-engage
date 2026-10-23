/** Finalidade da instância de WhatsApp: separa atendimento (robô/CRM) de avisos do sistema. */
export type Finalidade = "atendimento" | "notificacoes" | "ambos";

type Inst = Record<string, unknown>;

export const finalidadeDe = (i: Inst): Finalidade => {
  const f = String(i["finalidade"] ?? "").toLowerCase();
  return f === "atendimento" || f === "notificacoes" ? f : "ambos";
};

const ativa = (i: Inst) => i["status"] !== false && i["ativo"] !== false && String(i["tipo"] ?? "") !== "chat";

/** Escolhe a instância para envios automáticos (cotações, ofertas, avisos): Notificações > Ambos > Atendimento. */
export function instanciaParaAvisos<T extends Inst>(lista: T[]): T | undefined {
  const ok = lista.filter(ativa);
  const peso = (i: T) => ({ notificacoes: 0, ambos: 1, atendimento: 2 })[finalidadeDe(i)];
  return [...ok].sort((a, b) => peso(a) - peso(b))[0];
}

/** Ordena a lista para seletores: instâncias de avisos primeiro. */
export function ordenarParaAvisos<T extends Inst>(lista: T[]): T[] {
  const peso = (i: T) => ({ notificacoes: 0, ambos: 1, atendimento: 2 })[finalidadeDe(i)];
  return [...lista].sort((a, b) => peso(a) - peso(b));
}

const AUTO_RESPOSTA = [
  /mensagem autom[aá]tica/i,
  /resposta autom[aá]tica/i,
  /obrigad[oa] (pelo|por entrar em) contato/i,
  /nosso hor[aá]rio de atendimento/i,
  /em breve (retornaremos|responderemos|entraremos)/i,
  /no momento n[aã]o (estamos|podemos)/i,
  /fora do hor[aá]rio/i,
  /assim que poss[ií]vel (retornaremos|responderemos)/i,
];

/** Detecta respostas automáticas comerciais (que não devem acionar o robô). */
export const ehRespostaAutomatica = (texto: string) => AUTO_RESPOSTA.some((r) => r.test(texto ?? ""));
