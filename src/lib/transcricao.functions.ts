import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/lib/auth-guard";

const LIMITE = 20 * 1024 * 1024;

/** Transcreve o áudio de uma mensagem (WhatsApp/Z-API) usando o Lovable AI Gateway. */
export const transcreverAudio = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ url: z.string().url().max(2000), token: z.string().max(5000).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ texto?: string; erro?: string }> => {
    // Ordem: chave OpenAI da empresa (BYOK) → OPENAI_API_KEY → GROQ_API_KEY → gateway da plataforma
    let destino: { url: string; chave: string; modelo: string; extra?: Record<string, string> } | null = null;
    if (data.token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
        const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${data.token}` } },
        });
        const { data: auth } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
        const a = auth as unknown as { permitido?: boolean; origem?: string; provedor?: string; chave?: string } | null;
        if (a?.origem === "propria" && a.provedor === "openai" && a.chave)
          destino = { url: "https://api.openai.com/v1/audio/transcriptions", chave: a.chave, modelo: "whisper-1" };
      } catch (e) { console.error("ia_autorizar transcricao", e); }
    }
    const openai = process.env["OPENAI_API_KEY"];
    const groq = process.env["GROQ_API_KEY"];
    const lov = process.env["LOVABLE_API_KEY"];
    if (!destino && openai) destino = { url: "https://api.openai.com/v1/audio/transcriptions", chave: openai, modelo: "whisper-1" };
    if (!destino && groq) destino = { url: "https://api.groq.com/openai/v1/audio/transcriptions", chave: groq, modelo: "whisper-large-v3" };
    if (!destino && lov) destino = { url: "https://ai.gateway.lovable.dev/v1/audio/transcriptions", chave: lov, modelo: "openai/gpt-transcribe", extra: { "X-Lovable-AIG-SDK": "fetch" } };
    if (!destino) return { erro: "Transcrição indisponível: cadastre uma chave OpenAI em Empresas → Inteligência Artificial." };
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
      form.append("model", destino.modelo);
      form.append("file", new File([buf], `audio.${ext}`, { type: tipo }));
      form.append("response_format", "json");
      form.append("language", "pt");
      const r = await fetch(destino.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${destino.chave}`, ...(destino.extra ?? {}) },
        body: form,
      });
      if (r.status === 401) return { erro: "Chave de IA inválida. Confira em Empresas → Inteligência Artificial." };
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
