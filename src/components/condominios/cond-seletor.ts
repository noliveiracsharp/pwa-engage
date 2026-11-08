import { useSyncExternalStore } from "react";

/** Seletor de condomínio publicado pela página de Condomínios e exibido no cabeçalho. */
export type CondSeletor = {
  opcoes: { value: string; label: string; hint?: string | undefined }[];
  valor: string;
  padrao: string;
  onChange: (id: string) => void;
  onPadrao: (id: string) => void;
} | null;

let atual: CondSeletor = null;
const ouvintes = new Set<() => void>();

export function publicarSeletor(s: CondSeletor) {
  atual = s;
  ouvintes.forEach((f) => f());
}

export function useCondSeletor(): CondSeletor {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => atual,
    () => null,
  );
}
