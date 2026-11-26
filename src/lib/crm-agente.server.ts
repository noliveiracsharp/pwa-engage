import { formatoAudio } from "@/lib/audio-formato";
import { lerAcaoAgente, promptAgente, type AcaoAgente } from "@/lib/crm-agente";

const GW = "https://ai.gateway.lovable.dev/v1";

/** IA da empresa (Empresas → Inteligência Artificial), resolvida por crm_agente_ia. */
export type IaAgente = { permitido?: boolean; motivo?: string; origem?: string; provedor?: string; modelo?: string | null; chave?: string } | null;

const COMPATIVEIS: Record<string, { baseURL: string; modelo: string }> = {
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
  anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
};

const propria = (ia: IaAgente) => (ia?.origem === "propria" && ia.chave ? ia : null);

/** Transcreve o áudio do colaborador com a IA da empresa (ou do servidor). Devolve o texto ou o motivo da falha. */
export async function transcreverAgente(url: string, opts: { clientToken?: string | undefined; mimeType?: string | undefined; ia?: IaAgente } = {}): Promise<{ texto: string; motivo?: string }> {
  const ia = propria(opts.ia ?? null);
  let destino: { url: string; chave: string; modelo: string; extra?: Record<string, string> } | null = null;
  let gemini: { chave: string; modelo: string } | null = null;
  if (ia?.provedor === "openai") destino = { url: "https://api.openai.com/v1/audio/transcriptions", chave: ia.chave!, modelo: "whisper-1" };
  else if (ia?.provedor === "gemini") gemini = { chave: ia.chave!, modelo: ia.modelo || "gemini-2.5-flash" };
  if (!destino && !gemini) {
    const openai = process.env["OPENAI_API_KEY"], groq = process.env["GROQ_API_KEY"], lov = process.env["LOVABLE_API_KEY"];
    if (openai) destino = { url: "https://api.openai.com/v1/audio/transcriptions", chave: openai, modelo: "whisper-1" };
    else if (groq) destino = { url: "https://api.groq.com/openai/v1/audio/transcriptions", chave: groq, modelo: "whisper-large-v3" };
    else if (lov) destino = { url: `${GW}/audio/transcriptions`, chave: lov, modelo: "openai/gpt-transcribe", extra: { "X-Lovable-AIG-SDK": "fetch" } };
  }
  if (!destino && !gemini) return { texto: "", motivo: "a IA da empresa não transcreve áudio — use OpenAI ou Gemini em Empresas → Inteligência Artificial" };

  let u: URL;
  try { u = new URL(url); } catch { return { texto: "", motivo: "link do áudio inválido" }; }
  if (u.protocol !== "https:") return { texto: "", motivo: "link do áudio sem https" };
  // A Z-API às vezes entrega o link antes do arquivo ficar pronto ou devolve um erro curto com status 200.
  const baixar = async (h?: Record<string, string>) => {
    const r = await fetch(u.toString(), h ? { headers: h } : undefined).catch((e: unknown) => { console.error("crm-agente download rede", e); return null; });
    if (!r || !r.ok) return { erro: `download status ${r?.status ?? "rede"}` } as const;
    const tipo = (r.headers.get("content-type") || "").toLowerCase();
    const b = await r.arrayBuffer();
    if (b.byteLength < 1000 || /json|html|xml|text\//.test(tipo)) return { erro: `download inválido (${tipo || "?"}, ${b.byteLength} bytes)`, amostra: new TextDecoder().decode(b.slice(0, 200)) } as const;
    return { buf: b, tipo } as const;
  };
  let res: { erro: string; amostra?: string } | { buf: ArrayBuffer; tipo: string } = { erro: "não tentou" };
  for (let i = 0; i < 4; i++) {
    res = await baixar();
    if (!("buf" in res) && opts.clientToken) res = await baixar({ "Client-Token": opts.clientToken });
    if ("buf" in res) break;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  if (!("buf" in res)) { console.error("crm-agente download audio", res.erro, res.amostra ?? ""); return { texto: "", motivo: res.erro }; }
  const buf = res.buf;
  const real = formatoAudio(new Uint8Array(buf.slice(0, 16)));
  const informado = (opts.mimeType || res.tipo || "audio/ogg").split(";")[0]!.trim();
  const fmt = real ?? { ext: "ogg", mime: informado.startsWith("audio/") ? informado : "audio/ogg" };

  if (gemini) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gemini.modelo)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": gemini.chave },
      body: JSON.stringify({ contents: [{ role: "user", parts: [
        { text: "Transcreva este áudio em português do Brasil, palavra por palavra. Responda somente com o texto falado." },
        { inline_data: { mime_type: fmt.mime, data: btoa(bin) } },
      ] }] }),
    }).catch(() => null);
    if (!r) return { texto: "", motivo: "sem conexão com a IA" };
    if (!r.ok) { console.error("crm-agente gemini", r.status, await r.text().catch(() => "")); return { texto: "", motivo: `chave Gemini da empresa recusou o áudio (${r.status})` }; }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const texto = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return texto ? { texto } : { texto: "", motivo: "áudio sem fala reconhecida" };
  }

  const form = new FormData();
  form.append("model", destino!.modelo);
  form.append("file", new File([buf], `audio.${fmt.ext}`, { type: fmt.mime }));
  form.append("language", "pt");
  const r = await fetch(destino!.url, { method: "POST", headers: { Authorization: `Bearer ${destino!.chave}`, ...(destino!.extra ?? {}) }, body: form }).catch((e: unknown) => { console.error("crm-agente transcricao rede", e); return null; });
  if (!r) return { texto: "", motivo: "sem conexão com a IA" };
  if (!r.ok) { const t = await r.text().catch(() => ""); console.error("crm-agente transcricao", r.status, t); return { texto: "", motivo: `IA recusou o áudio (${r.status}, ${fmt.mime}, ${buf.byteLength} bytes)` }; }
  const texto = String(((await r.json()) as { text?: string }).text ?? "").trim();
  return texto ? { texto } : { texto: "", motivo: "áudio sem fala reconhecida" };
}

/** Pede à IA (da empresa ou do servidor) a interpretação do relato do colaborador. */
export async function interpretarAgente(texto: string, iaEmpresa: IaAgente = null, equipe: string[] = []): Promise<AcaoAgente | null> {
  const { generateText } = await import("ai");
  const ia = propria(iaEmpresa);
  let model;
  if (ia?.provedor === "openai") {
    const { createOpenAI } = await import("@ai-sdk/openai");
    model = createOpenAI({ apiKey: ia.chave! }).responses(ia.modelo || "gpt-5-mini");
  } else if (ia && COMPATIVEIS[ia.provedor ?? ""]) {
    const p = COMPATIVEIS[ia.provedor!]!;
    const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
    model = createOpenAICompatible({ name: ia.provedor!, baseURL: p.baseURL, apiKey: ia.chave! })(ia.modelo || p.modelo);
  } else if (process.env["LOVABLE_API_KEY"]) {
    const chave = process.env["LOVABLE_API_KEY"];
    const { createOpenAI } = await import("@ai-sdk/openai");
    model = createOpenAI({ baseURL: GW, apiKey: chave, headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } }).responses("openai/gpt-6-astra");
  } else if (process.env["OPENAI_API_KEY"]) {
    const { createOpenAI } = await import("@ai-sdk/openai");
    model = createOpenAI({ apiKey: process.env["OPENAI_API_KEY"] }).responses("gpt-5-mini");
  } else return null;
  const r = await generateText({ model, maxRetries: 0, system: promptAgente(new Date(), equipe), prompt: texto.slice(0, 6000) });
  return lerAcaoAgente(r.text);
}
