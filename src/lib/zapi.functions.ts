import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type QrResult = { status: "qr"; image: string } | { status: "connected" } | { status: "error"; message: string };

export const buscarQrCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        instanceId: z.string().min(1).max(200),
        token: z.string().min(1).max(500),
        clientToken: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<QrResult> => {
    const base = `https://api.z-api.io/instances/${encodeURIComponent(data.instanceId)}/token/${encodeURIComponent(data.token)}`;
    const headers: Record<string, string> = {};
    if (data.clientToken) headers["Client-Token"] = data.clientToken;
    try {
      const r = await fetch(`${base}/qr-code/image`, { headers });
      const body = await r.text();
      let j: Record<string, unknown> = {};
      try {
        j = JSON.parse(body) as Record<string, unknown>;
      } catch {
        /* not json */
      }
      if (j["connected"] === true) return { status: "connected" };
      const value = typeof j["value"] === "string" ? (j["value"] as string) : "";
      if (r.ok && value) {
        const image = value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
        return { status: "qr", image };
      }
      const msg = String(j["error"] ?? j["message"] ?? (body.slice(0, 200) || `HTTP ${r.status}`));
      if (/already connected|conectad/i.test(msg)) return { status: "connected" };
      return { status: "error", message: msg };
    } catch (e) {
      return { status: "error", message: e instanceof Error ? e.message : "Falha ao contatar a Z-API" };
    }
  });
