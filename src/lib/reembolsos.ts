import type { Row } from "@/lib/row";

export type Modalidade = "reembolso" | "cartao";
export type StatusDespesa = "pendente" | "aprovado" | "reprovado";

export const CATEGORIAS_DESPESA: Record<string, string> = {
  alimentacao: "Alimentação",
  combustivel: "Combustível",
  pedagio: "Pedágio",
  estacionamento: "Estacionamento",
  hospedagem: "Hospedagem",
  transporte: "Transporte / App",
  material: "Material",
  outros: "Outros",
};

export const STATUS_DESPESA: Record<StatusDespesa, { label: string; badge: string }> = {
  pendente: { label: "Pendente", badge: "bg-warning text-warning-foreground" },
  aprovado: { label: "Aprovado", badge: "bg-success text-success-foreground" },
  reprovado: { label: "Reprovado", badge: "bg-destructive text-destructive-foreground" },
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Gasto do cartão no mês (AAAA-MM), ignorando despesas reprovadas. */
export function usoCartaoMes(lancamentos: Row[], cartaoId: string, mes: string): number {
  return r2(
    lancamentos
      .filter((l) => l["modalidade"] === "cartao" && String(l["cartao_id"] ?? "") === cartaoId)
      .filter((l) => l["status"] !== "reprovado" && String(l["data"] ?? "").slice(0, 7) === mes)
      .reduce((s, l) => s + n(l["valor"]), 0),
  );
}

/** Limite disponível do cartão no mês; nunca negativo. */
export function disponivelCartao(limite: unknown, usado: number): number {
  return r2(Math.max(0, n(limite) - usado));
}

/** Totais por situação para os cards da tela. */
export function resumoDespesas(lancamentos: Row[]) {
  const out = { pendente: 0, aprovado: 0, reprovado: 0, reembolsar: 0 };
  for (const l of lancamentos) {
    const s = String(l["status"] ?? "pendente") as StatusDespesa;
    const v = n(l["valor"]);
    if (s in out) out[s] = r2(out[s] + v);
    if (s !== "reprovado" && l["modalidade"] === "reembolso" && !l["titulo_id"]) out.reembolsar = r2(out.reembolsar + v);
  }
  return out;
}

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Lê "10, 25" (ou array) em dias válidos 1-31, ordenados e sem repetição. */
export function diasPagamento(v: unknown): number[] {
  const arr = Array.isArray(v) ? v : String(v ?? "").split(/[^\d]+/);
  return [...new Set(arr.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))].sort((a, b) => a - b);
}

/**
 * Próxima data de pagamento de reembolso conforme a política da empresa.
 * A despesa precisa ser lançada pelo menos `corte` dias antes do dia de pagamento;
 * sábado/domingo passam para a segunda-feira. Sem dias configurados, retorna a própria base.
 */
export function proximaDataPagamento(baseISO: string, dias: number[], corte = 0): string {
  const [y, m, d] = baseISO.slice(0, 10).split("-").map(Number);
  const base = new Date(y!, m! - 1, d!);
  if (!dias.length) return isoLocal(base);
  const limite = new Date(base); limite.setDate(limite.getDate() + Math.max(0, corte));
  for (let i = 0; i < 24; i++) {
    const ano = base.getFullYear(), mes = base.getMonth() + i;
    const ultimo = new Date(ano, mes + 1, 0).getDate();
    for (const dia of dias) {
      const alvo = new Date(ano, mes, Math.min(dia, ultimo));
      if (alvo < limite) continue;
      while (alvo.getDay() === 0 || alvo.getDay() === 6) alvo.setDate(alvo.getDate() + 1);
      return isoLocal(alvo);
    }
  }
  return isoLocal(base);
}
