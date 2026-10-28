/** Central de avisos: mensagens recebidas ficam guardadas neste aparelho até o usuário apagar. */
export type AvisoTipo = "cliente" | "equipe" | "frota" | "projeto" | "lead";
export type Aviso = {
  id: string;
  titulo: string;
  texto: string;
  link?: string;
  em: string;
  lido: boolean;
  tipo?: AvisoTipo;
  /** Chave para evitar avisos repetidos (ex.: plano de manutenção + status + dia). */
  chave?: string;
  /** Conversa do chat interno a abrir ao clicar. */
  chat?: { grupo?: string; usuario?: string };
};

const EVT = "atendeai-avisos-mudou";
// Avisos isolados por usuário logado: quem entra no mesmo aparelho não vê os avisos de outro.
let dono = "anon";
export function definirUsuarioAvisos(id: unknown) {
  const novo = id == null || id === "" ? "anon" : String(id);
  if (novo === dono) return;
  dono = novo;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVT));
}
const chaveUsuario = () => `atendeai-avisos:${dono}`;
const chaveDescartados = () => `atendeai-avisos-projetos-descartados:${dono}`;
export const EVT_ABRIR_CHAT = "atendeai-abrir-chat";
const MAX = 300;

export function listarAvisos(): Aviso[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(chaveUsuario()) ?? "[]") as Aviso[]; } catch { return []; }
}
function gravar(l: Aviso[]) {
  localStorage.setItem(chaveUsuario(), JSON.stringify(l.slice(0, MAX)));
  window.dispatchEvent(new Event(EVT));
}
function projetosDescartados(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const chaves: unknown = JSON.parse(localStorage.getItem(chaveDescartados()) ?? "[]");
    return Array.isArray(chaves) ? chaves.filter((chave): chave is string => typeof chave === "string") : [];
  } catch { return []; }
}
function descartarProjetos(avisos: Aviso[]) {
  const chaves = avisos.flatMap((a) => (a.chave?.startsWith("projeto:") || a.chave?.startsWith("lead:")) ? [a.chave] : []);
  if (chaves.length === 0) return;
  // Guarda apenas IDs, antes de apagar: o polling não pode recriar eventos descartados.
  localStorage.setItem(chaveDescartados(), JSON.stringify([...new Set([...projetosDescartados(), ...chaves])]));
}
export function adicionarAviso(a: Omit<Aviso, "id" | "em" | "lido">) {
  const atuais = listarAvisos();
  if (a.chave && (atuais.some((x) => x.chave === a.chave) || projetosDescartados().includes(a.chave))) return;
  gravar([{ ...a, id: crypto.randomUUID(), em: new Date().toISOString(), lido: false }, ...atuais]);
}
export const marcarTodosLidos = () => gravar(listarAvisos().map((a) => ({ ...a, lido: true })));
export const marcarLido = (id: string) => gravar(listarAvisos().map((a) => (a.id === id ? { ...a, lido: true } : a)));
export const removerAviso = (id: string) => {
  const atuais = listarAvisos();
  descartarProjetos(atuais.filter((a) => a.id === id));
  gravar(atuais.filter((a) => a.id !== id));
};
export const limparAvisos = () => {
  descartarProjetos(listarAvisos());
  gravar([]);
};
export function onAvisos(fn: () => void) {
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  return () => { window.removeEventListener(EVT, fn); window.removeEventListener("storage", fn); };
}
