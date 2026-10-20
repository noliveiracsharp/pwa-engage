import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/lib/auth-guard";

const LIMITE = 20 * 1024 * 1024;

/** Transcreve o áudio de uma mensagem (WhatsApp/Z-API) usando o Lovable AI Gateway. */
export const transcreverAudio = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ texto?: string; erro?: string }> => {
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { erro: "Transcrição indisponível no momento." };
    const u = new URL(data.url);
    if (u.protocol !== "https:") return { erro: "Endereço do áudio inválido." };
    try {
      const a = await fetch(u.toString());
      if (!a.ok) return { erro: "Não foi possível baixar o áudio." };
      const tamanho = Number(a.headers.get("content-length") ?? 0);
      if (tamanho > LIMITE) return { erro: "Áudio muito grande para transcrever." };
      const buf = await a.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > LIMITE) return { erro: "Áudio vazio ou muito grande." };
      let tipo = (a.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!tipo.startsWith("audio/")) tipo = /\.mp3/i.test(u.pathname) ? "audio/mpeg" : "audio/ogg";
      const ext = tipo.includes("mpeg") ? "mp3" : tipo.includes("mp4") || tipo.includes("m4a") ? "m4a" : tipo.includes("wav") ? "wav" : "ogg";
      const form = new FormData();
      form.append("model", "openai/gpt-transcribe");
      form.append("file", new File([buf], `audio.${ext}`, { type: tipo }));
      form.append("response_format", "json");
      form.append("language", "pt");
      const r = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "X-Lovable-AIG-SDK": "fetch" },
        body: form,
      });
      if (!r.ok) {
        if (r.status === 402) return { erro: "Créditos de IA esgotados." };
        if (r.status === 429) return { erro: "Muitas transcrições agora. Tente de novo em instantes." };
        if (r.status === 403) return { erro: "Transcrição bloqueada para esta conta." };
        return { erro: "Não foi possível transcrever o áudio." };
      }
      const j = (await r.json()) as { text?: string };
      const texto = (j.text ?? "").trim();
      return texto ? { texto } : { erro: "Nenhuma fala identificada no áudio." };
    } catch {
      return { erro: "Não foi possível transcrever o áudio." };
    }
  });
