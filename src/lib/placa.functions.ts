import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/lib/auth-guard";

export type DadosPlaca = { ok: boolean; motivo?: string; marca?: string; modelo?: string; cor?: string; ano?: string; tipo?: string; municipio?: string };

/**
 * Consulta dados do veículo pela placa (provedor WDAPI — wdapi2.com.br).
 * Requer o segredo PLACA_API_TOKEN; sem ele, o cadastro segue manual.
 */
export const consultarPlaca = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ placa: z.string().regex(/^[A-Z]{3}\d[A-Z0-9]\d{2}$/) }).parse(d))
  .handler(async ({ data }): Promise<DadosPlaca> => {
    const token = process.env["PLACA_API_TOKEN"];
    if (!token) return { ok: false, motivo: "Consulta de placa não configurada. Preencha manualmente." };
    try {
      const r = await fetch(`https://wdapi2.com.br/consulta/${data.placa}/${encodeURIComponent(token)}`);
      if (!r.ok) return { ok: false, motivo: "Placa não encontrada. Preencha manualmente." };
      const j = (await r.json()) as Record<string, unknown>;
      const t = (k: string) => (j[k] == null ? undefined : String(j[k]));
      if (!t("MARCA") && !t("modelo") && !t("MODELO")) return { ok: false, motivo: "Placa não encontrada. Preencha manualmente." };
      return {
        ok: true,
        marca: t("MARCA") ?? t("marca"),
        modelo: t("MODELO") ?? t("modelo"),
        cor: t("cor") ?? t("COR"),
        ano: t("anoModelo") ?? t("ano"),
        tipo: t("segmento") ?? t("tipo"),
        municipio: [t("municipio"), t("uf")].filter(Boolean).join("/") || undefined,
      };
    } catch {
      return { ok: false, motivo: "Serviço de placas indisponível. Preencha manualmente." };
    }
  });
