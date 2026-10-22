/** Divide a tarifa de baixa entre as linhas, proporcional ao valor; a última fecha o centavo. */
export function tarifaPorLinha(tarifa: number, valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(tarifa > 0) || total <= 0) return valores.map(() => 0);
  let acc = 0;
  return valores.map((v, i) => {
    if (i === valores.length - 1) return Math.round((tarifa - acc) * 100) / 100;
    const t = Math.round(((tarifa * Math.max(0, v)) / total) * 100) / 100;
    acc += t;
    return t;
  });
}
