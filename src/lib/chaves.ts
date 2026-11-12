/** Regras puras do Claviculário (prazo de devolução de chaves). */
export const PRAZOS_CHAVE = [
  { minutos: 30, label: "30 min" },
  { minutos: 60, label: "1 hora" },
  { minutos: 120, label: "2 horas" },
  { minutos: 240, label: "4 horas" },
] as const;

/** Faltando até este tempo o prazo entra em "atenção". */
export const AVISO_MINUTOS = 15;

export type SituacaoPrazo = "sem_prazo" | "no_prazo" | "atencao" | "atrasada";

export function previstoPara(retirada: Date, minutos: number | null): Date | null {
  if (!minutos || minutos <= 0) return null;
  return new Date(retirada.getTime() + minutos * 60_000);
}

export function situacaoPrazo(previsto: Date | null, agora: Date): SituacaoPrazo {
  if (!previsto) return "sem_prazo";
  const resta = (previsto.getTime() - agora.getTime()) / 60_000;
  if (resta < 0) return "atrasada";
  if (resta <= AVISO_MINUTOS) return "atencao";
  return "no_prazo";
}

export function duracaoTexto(minutos: number): string {
  const m = Math.max(0, Math.round(Math.abs(minutos)));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h}h ${r}min` : `${h}h`;
  const d = Math.floor(h / 24), hr = h % 24;
  return hr ? `${d}d ${hr}h` : `${d}d`;
}

/** Texto curto para o selo de prazo. */
export function textoPrazo(previsto: Date | null, agora: Date): string {
  if (!previsto) return "Sem prazo";
  const resta = (previsto.getTime() - agora.getTime()) / 60_000;
  return resta < 0 ? `Atrasada há ${duracaoTexto(resta)}` : `Resta ${duracaoTexto(resta)}`;
}
