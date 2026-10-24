import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/lib/auth-guard";
import { z } from "zod";

export type QrResult = { status: "qr"; image: string } | { status: "connected" } | { status: "error"; message: string };

export const buscarQrCode = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
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

export const desconectarWhatsApp = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) =>
    z
      .object({
        instanceId: z.string().min(1).max(200),
        token: z.string().min(1).max(500),
        clientToken: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const url = `https://api.z-api.io/instances/${encodeURIComponent(data.instanceId)}/token/${encodeURIComponent(data.token)}/disconnect`;
    const headers: Record<string, string> = {};
    if (data.clientToken) headers["Client-Token"] = data.clientToken;
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return { ok: true };
      return { ok: false, message: (await r.text()).slice(0, 200) || `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Falha ao contatar a Z-API" };
    }
  });

/** Aponta o "Ao receber" da Z-API para o endereço de recebimento do Atende.ai. */
export const configurarWebhookZapi = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) =>
    z
      .object({
        instanceId: z.string().min(1).max(200),
        token: z.string().min(1).max(500),
        clientToken: z.string().max(500).optional(),
        url: z.string().url().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const base = `https://api.z-api.io/instances/${encodeURIComponent(data.instanceId)}/token/${encodeURIComponent(data.token)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (data.clientToken) headers["Client-Token"] = data.clientToken;
    try {
      const r = await fetch(`${base}/update-webhook-received`, { method: "PUT", headers, body: JSON.stringify({ value: data.url }) });
      if (r.ok) return { ok: true };
      return { ok: false, message: (await r.text()).slice(0, 200) || `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Falha ao contatar a Z-API" };
    }
  });

const Credenciais = z.object({
  instanceId: z.string().min(1).max(200),
  token: z.string().min(1).max(500),
  clientToken: z.string().max(500).optional(),
});

/** Altera nome, recado e foto do WhatsApp conectado na Z-API. Só envia o que foi preenchido. */
export const atualizarPerfilZapi = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) =>
    Credenciais.extend({
      nome: z.string().trim().max(25).optional(),
      recado: z.string().trim().max(139).optional(),
      fotoUrl: z.string().url().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; falhas: string[] }> => {
    const base = `https://api.z-api.io/instances/${encodeURIComponent(data.instanceId)}/token/${encodeURIComponent(data.token)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (data.clientToken) headers["Client-Token"] = data.clientToken;
    const passos: Array<[string, string, string | undefined]> = [
      ["Nome", "profile-name", data.nome],
      ["Recado", "profile-description", data.recado],
      ["Foto", "profile-picture", data.fotoUrl],
    ];
    const falhas: string[] = [];
    for (const [rotulo, rota, valor] of passos) {
      if (!valor) continue;
      try {
        const r = await fetch(`${base}/${rota}`, { method: "PUT", headers, body: JSON.stringify({ value: valor }) });
        if (!r.ok) falhas.push(`${rotulo}: ${(await r.text()).slice(0, 120) || `HTTP ${r.status}`}`);
      } catch (e) {
        falhas.push(`${rotulo}: ${e instanceof Error ? e.message : "falha de rede"}`);
      }
    }
    return { ok: falhas.length === 0, falhas };
  });

/** Reinicia a instância sem precisar ler o QR Code de novo. */
export const reiniciarZapi = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => Credenciais.parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const url = `https://api.z-api.io/instances/${encodeURIComponent(data.instanceId)}/token/${encodeURIComponent(data.token)}/restart`;
    const headers: Record<string, string> = {};
    if (data.clientToken) headers["Client-Token"] = data.clientToken;
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return { ok: true };
      return { ok: false, message: (await r.text()).slice(0, 200) || `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Falha ao contatar a Z-API" };
    }
  });
