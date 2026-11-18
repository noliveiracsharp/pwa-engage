import { htmlParaTexto } from "@/lib/html-texto";

export type FiltroAvisos = { texto: string; tipo: string; de: string; ate: string; anexo: "todos" | "com" | "sem" };
export const FILTRO_AVISOS_VAZIO: FiltroAvisos = { texto: "", tipo: "", de: "", ate: "", anexo: "todos" };

const s = (v: unknown) => (v == null ? "" : String(v));
const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Filtra avisos por título/texto (sem acento), tipo, período de publicação (AAAA-MM-DD, inclusivo) e anexo. */
export function filtrarAvisos<T extends Record<string, unknown>>(avisos: T[], f: FiltroAvisos): T[] {
  const q = norm(f.texto.trim());
  return avisos.filter((a) => {
    if (q && !norm(`${s(a["titulo"])} ${htmlParaTexto(s(a["mensagem"] ?? a["texto"]))}`).includes(q)) return false;
    if (f.tipo && s(a["tipo"]) !== f.tipo) return false;
    const d = s(a["enviado_em"] ?? a["created_at"]).slice(0, 10);
    if (f.de && (!d || d < f.de)) return false;
    if (f.ate && (!d || d > f.ate)) return false;
    const temAnexo = !!s(a["midia_url"]);
    if (f.anexo === "com" && !temAnexo) return false;
    if (f.anexo === "sem" && temAnexo) return false;
    return true;
  });
}
