/** Tarifas bancárias por conta: franquia mensal gratuita e cobrança a partir da (franquia+1)ª liquidação. */
export type TarifasConta = {
  tarifa_boleto_emissao?: unknown;
  tarifa_boleto_baixa?: unknown;
  franquia_boleto?: unknown;
  tarifa_pix?: unknown;
  franquia_pix?: unknown;
};

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) && x > 0 ? x : 0;
};
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export type ModalidadeTarifa = "boleto" | "pix" | null;

export function modalidadeTarifa(forma: string): ModalidadeTarifa {
  const f = forma.trim().toLowerCase();
  if (f === "pix") return "pix";
  if (f === "boleto") return "boleto";
  return null;
}

/**
 * Calcula a tarifa de uma liquidação.
 * @param usadasNoMes liquidações da mesma modalidade/conta já registradas no mês (antes desta).
 */
export function calcularTarifa(conta: TarifasConta | null | undefined, forma: string, usadasNoMes: number) {
  const mod = modalidadeTarifa(forma);
  if (!conta || !mod) return { tarifa: 0, isento: false, sequencia: 0 };
  const sequencia = Math.max(0, Math.floor(usadasNoMes)) + 1;
  const franquia = Math.floor(n(mod === "pix" ? conta.franquia_pix : conta.franquia_boleto));
  const unit = mod === "pix" ? n(conta.tarifa_pix) : n(conta.tarifa_boleto_baixa);
  const emissao = mod === "boleto" ? n(conta.tarifa_boleto_emissao) : 0;
  const isento = sequencia <= franquia;
  return { tarifa: r2((isento ? 0 : unit) + emissao), isento: isento && unit > 0, sequencia };
}
