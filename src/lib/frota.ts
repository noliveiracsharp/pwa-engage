export type Abastecimento = { id?: string; km: number; litros: number; tanque_cheio: boolean; data: string };

/**
 * Consumo real (km/l) de um abastecimento com tanque cheio:
 * km rodados desde o último tanque cheio ÷ litros colocados depois dele (incluindo este).
 * Retorna null quando não há tanque cheio anterior ou o abastecimento não é de tanque cheio.
 */
export function consumoReal(anteriores: Abastecimento[], atual: Abastecimento): number | null {
  if (!atual.tanque_cheio) return null;
  const antes = anteriores
    .filter((a) => (atual.id == null || a.id !== atual.id) && a.km < atual.km)
    .sort((a, b) => a.km - b.km);
  let idx = -1;
  for (let i = antes.length - 1; i >= 0; i--) if (antes[i]!.tanque_cheio) { idx = i; break; }
  if (idx < 0) return null;
  const base = antes[idx]!;
  const litros = antes.slice(idx + 1).reduce((s, a) => s + a.litros, 0) + atual.litros;
  const km = atual.km - base.km;
  if (km <= 0 || litros <= 0) return null;
  return Math.round((km / litros) * 100) / 100;
}

/** Consumo esperado do veículo para o combustível abastecido. */
export function consumoEsperado(veiculo: { consumo_gasolina?: unknown; consumo_alcool?: unknown }, combustivel: string): number | null {
  const v = combustivel === "alcool" ? veiculo.consumo_alcool : veiculo.consumo_gasolina;
  const n = Number(v);
  return v == null || v === "" || !n ? null : n;
}

/** Diferença percentual do real em relação ao esperado (negativo = pior). */
export function desvioConsumo(real: number | null, esperado: number | null): number | null {
  if (real == null || esperado == null || !esperado) return null;
  return Math.round(((real - esperado) / esperado) * 1000) / 10;
}

/** Alerta quando o real fica 15% ou mais abaixo do esperado. */
export const ALERTA_DESVIO = -15;

export type PlanoManutencao = { intervalo_km?: number | null; intervalo_dias?: number | null; ultimo_km?: number | null; ultima_data?: string | null };
export type StatusManutencao = { proximoKm: number | null; proximaData: string | null; status: "ok" | "proximo" | "vencido" };

/** Antecedência para avisar: 500 km ou 15 dias antes do vencimento. */
export const AVISO_KM = 500;
export const AVISO_DIAS = 15;

/** Próxima manutenção por KM e/ou tempo (o que vencer primeiro manda no status). */
export function statusManutencao(p: PlanoManutencao, kmAtual: number, hoje: Date = new Date()): StatusManutencao {
  const proximoKm = p.intervalo_km ? Number(p.ultimo_km ?? 0) + Number(p.intervalo_km) : null;
  let proximaData: string | null = null;
  let dias: number | null = null;
  if (p.intervalo_dias && p.ultima_data) {
    const d = new Date(`${String(p.ultima_data).slice(0, 10)}T00:00:00`);
    d.setDate(d.getDate() + Number(p.intervalo_dias));
    proximaData = d.toISOString().slice(0, 10);
    const h = new Date(hoje.toISOString().slice(0, 10) + "T00:00:00");
    dias = Math.round((d.getTime() - h.getTime()) / 86400000);
  }
  const faltaKm = proximoKm == null ? null : proximoKm - kmAtual;
  let status: StatusManutencao["status"] = "ok";
  if ((faltaKm != null && faltaKm <= 0) || (dias != null && dias <= 0)) status = "vencido";
  else if ((faltaKm != null && faltaKm <= AVISO_KM) || (dias != null && dias <= AVISO_DIAS)) status = "proximo";
  return { proximoKm, proximaData, status };
}
