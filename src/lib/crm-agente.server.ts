import { lerAcaoAgente, promptAgente, type AcaoAgente } from "@/lib/crm-agente";

const GW = "https://ai.gateway.lovable.dev/v1";

/** Transcreve o áudio do colaborador pelo AI Gateway da plataforma. */
export async function transcreverAgente(url: string): Promise<string> {
  const chave = process.env["LOVABLE_API_KEY"];
  const u = new URL(url);
  if (!chave || u.protocol !== "https:") return "";
  const a = await fetch(u.toString());
  if (!a.ok) return "";
  const buf = await a.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 20 * 1024 * 1024) return "";
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([buf], "audio.ogg", { type: "audio/ogg" }));
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
