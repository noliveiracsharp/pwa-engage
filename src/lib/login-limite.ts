/** Bloqueio de tentativas de login: após MAX_TENTATIVAS falhas seguidas, bloqueia por BLOQUEIO_MS. */
export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;

export type EstadoLogin = { falhas: number; bloqueadoAte: number };

export const estadoInicial = (): EstadoLogin => ({ falhas: 0, bloqueadoAte: 0 });

export function registrarFalha(e: EstadoLogin, agora: number): EstadoLogin {
  const falhas = e.bloqueadoAte && agora >= e.bloqueadoAte ? 1 : e.falhas + 1;
  return falhas >= MAX_TENTATIVAS ? { falhas, bloqueadoAte: agora + BLOQUEIO_MS } : { falhas, bloqueadoAte: 0 };
}

export function restanteMs(e: EstadoLogin, agora: number): number {
  return Math.max(0, e.bloqueadoAte - agora);
}

const KEY = "atendeai.login.tentativas";
export function lerEstado(email: string): EstadoLogin {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, EstadoLogin>;
    return all[email.toLowerCase()] ?? estadoInicial();
  } catch {
    return estadoInicial();
  }
}
export function salvarEstado(email: string, e: EstadoLogin | null) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, EstadoLogin>;
    if (e) all[email.toLowerCase()] = e;
    else delete all[email.toLowerCase()];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignora */
  }
}
