import { pick, type Row } from "@/lib/row";
import { A } from "@/lib/atendimentos";

const RE_ENCERRADO = /encerr|finaliz|conclu|fechad/i;

/** Chamado na fila: humano (não IA), sem responsável e não encerrado. */
export function estaAguardando(a: Row): boolean {
  if (pick(a, A.responsavel)) return false;
  if (String(pick(a, A.modo) ?? "").toUpperCase() === "IA") return false;
  return !RE_ENCERRADO.test(String(pick(a, A.status) ?? ""));
}
