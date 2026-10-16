import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Primeiro e último dia do mês vigente (horário local) em YYYY-MM-DD. */
export function periodoMesVigente(base: Date = new Date()): { de: string; ate: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  const y = base.getFullYear();
  const m = base.getMonth();
  const ultimo = new Date(y, m + 1, 0).getDate();
  return { de: `${y}-${p(m + 1)}-01`, ate: `${y}-${p(m + 1)}-${p(ultimo)}` };
}
