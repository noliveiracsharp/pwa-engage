import { createServerFn } from "@tanstack/react-start";

// IPCA acumulado 12 meses — série 13522 do SGS/Banco Central (pública).
let cache: { at: number; valor: number; data: string } | null = null;

export const buscarIpca12m = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.at < 12 * 3600_000) return { ok: true as const, valor: cache.valor, data: cache.data };
  try {
    const r = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json", { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`BCB ${r.status}`);
    const j = (await r.json()) as { data: string; valor: string }[];
    const ult = j[j.length - 1];
    const valor = Number(String(ult?.valor).replace(",", "."));
    if (!ult || !Number.isFinite(valor)) throw new Error("resposta inválida");
    cache = { at: Date.now(), valor, data: ult.data };
    return { ok: true as const, valor, data: ult.data };
  } catch (e) {
    console.error("IPCA BCB:", e);
    return { ok: false as const, valor: 0, data: "" };
  }
});
