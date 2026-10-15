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
