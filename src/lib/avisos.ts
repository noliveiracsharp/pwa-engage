/** Central de avisos: mensagens recebidas ficam guardadas neste aparelho até o usuário apagar. */
export type Aviso = { id: string; titulo: string; texto: string; link?: string; em: string; lido: boolean };

const KEY = "atendeai-avisos";
const EVT = "atendeai-avisos-mudou";
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
  gravar([{ ...a, id: crypto.randomUUID(), em: new Date().toISOString(), lido: false }, ...listarAvisos()]);
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
