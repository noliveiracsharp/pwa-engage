import { lerAcaoAgente, promptAgente, type AcaoAgente } from "@/lib/crm-agente";

const GW = "https://ai.gateway.lovable.dev/v1";

/** Transcreve o áudio do colaborador pelo AI Gateway da plataforma. Mídia da Z-API pode exigir o Client-Token. */
export async function transcreverAgente(url: string, opts: { clientToken?: string | undefined; mimeType?: string | undefined } = {}): Promise<string> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) { console.error("crm-agente transcricao: LOVABLE_API_KEY ausente no servidor"); return ""; }
  let u: URL;
  try { u = new URL(url); } catch { console.error("crm-agente transcricao: url inválida"); return ""; }
  if (u.protocol !== "https:") return "";
  let a = await fetch(u.toString()).catch(() => null);
  if ((!a || !a.ok) && opts.clientToken) a = await fetch(u.toString(), { headers: { "Client-Token": opts.clientToken } }).catch(() => null);
  if (!a || !a.ok) { console.error("crm-agente download audio", a?.status ?? "rede"); return ""; }
  const buf = await a.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 20 * 1024 * 1024) { console.error("crm-agente audio tamanho", buf.byteLength); return ""; }
  const mime = (opts.mimeType || a.headers.get("content-type") || "audio/ogg").split(";")[0]!.trim();
  const ext = mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac") ? "m4a" : mime.includes("wav") ? "wav" : mime.includes("webm") ? "webm" : "ogg";
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([buf], `audio.${ext}`, { type: mime.startsWith("audio/") ? mime : "audio/ogg" }));
  form.append("language", "pt");
  const r = await fetch(`${GW}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${chave}`, "X-Lovable-AIG-SDK": "fetch" }, body: form });
  if (!r.ok) { console.error("crm-agente transcricao", r.status, await r.text().catch(() => "")); return ""; }
  return String(((await r.json()) as { text?: string }).text ?? "").trim();
}

/** Pede à IA a interpretação do relato do colaborador. */
export async function interpretarAgente(texto: string): Promise<AcaoAgente | null> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return null;
  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const r = await generateText({
    model: createOpenAI({ baseURL: GW, apiKey: chave, headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } }).responses("openai/gpt-6-astra"),
    maxRetries: 0,
    system: promptAgente(new Date()),
    prompt: texto.slice(0, 6000),
    providerOptions: { openai: { store: false } },
  });
  return lerAcaoAgente(r.text);
}
