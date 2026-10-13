/** Central de avisos: mensagens recebidas ficam guardadas neste aparelho até o usuário apagar. */
export type AvisoTipo = "cliente" | "equipe" | "frota";
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

const KEY = "atendeai-avisos";
const EVT = "atendeai-avisos-mudou";
export const EVT_ABRIR_CHAT = "atendeai-abrir-chat";
const MAX = 300;

export function listarAvisos(): Aviso[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Aviso[]; } catch { return []; }
}
function gravar(l: Aviso[]) {
  localStorage.setItem(KEY, JSON.stringify(l.slice(0, MAX)));
  window.dispatchEvent(new Event(EVT));
}
export function adicionarAviso(a: Omit<Aviso, "id" | "em" | "lido">) {
  const atuais = listarAvisos();
  if (a.chave && atuais.some((x) => x.chave === a.chave)) return;
  gravar([{ ...a, id: crypto.randomUUID(), em: new Date().toISOString(), lido: false }, ...atuais]);
}
export const marcarTodosLidos = () => gravar(listarAvisos().map((a) => ({ ...a, lido: true })));
export const marcarLido = (id: string) => gravar(listarAvisos().map((a) => (a.id === id ? { ...a, lido: true } : a)));
export const removerAviso = (id: string) => gravar(listarAvisos().filter((a) => a.id !== id));
export const limparAvisos = () => gravar([]);
export function onAvisos(fn: () => void) {
  window.addEventListener(EVT, fn);
  window.addEventListener("storage", fn);
  return () => { window.removeEventListener(EVT, fn); window.removeEventListener("storage", fn); };
}
