import type { Row } from "@/lib/row";

export function contasDaEmpresa(contas: Row[], empresaId: string): Row[] {
  if (!empresaId) return [];
  return contas.filter((c) => String(c["empresa_id"] ?? "") === empresaId)
    .sort((a, b) => String(a["descricao"] ?? "").localeCompare(String(b["descricao"] ?? ""), "pt-BR"));
}

export function saldoConsultado(conta: Row): number | null {
  if (!conta["saldo_consultado_em"] || conta["saldo_atual"] == null || conta["saldo_atual"] === "") return null;
  const valor = Number(conta["saldo_atual"]);
  return Number.isFinite(valor) ? valor : null;
}

export function somarSaldos(contas: Row[]) {
  const valores = contas.map(saldoConsultado).filter((v): v is number => v !== null);
  return { total: valores.length ? Math.round(valores.reduce((s, v) => s + v, 0) * 100) / 100 : null,
    consultadas: valores.length, pendentes: contas.length - valores.length };
}