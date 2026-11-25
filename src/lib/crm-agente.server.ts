import { formatoAudio } from "@/lib/audio-formato";
import { lerAcaoAgente, promptAgente, type AcaoAgente } from "@/lib/crm-agente";

const GW = "https://ai.gateway.lovable.dev/v1";

/** Transcreve o áudio do colaborador pelo AI Gateway. Devolve o texto ou o motivo da falha (curto, para o colaborador). */
export async function transcreverAgente(url: string, opts: { clientToken?: string | undefined; mimeType?: string | undefined } = {}): Promise<{ texto: string; motivo?: string }> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) { console.error("crm-agente transcricao: LOVABLE_API_KEY ausente no servidor"); return { texto: "", motivo: "chave de IA (LOVABLE_API_KEY) não configurada no servidor" }; }
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
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([buf], `audio.${fmt.ext}`, { type: fmt.mime }));
  form.append("language", "pt");
  const r = await fetch(`${GW}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${chave}`, "X-Lovable-AIG-SDK": "fetch" }, body: form }).catch((e: unknown) => { console.error("crm-agente transcricao rede", e); return null; });
  if (!r) return { texto: "", motivo: "sem conexão com a IA" };
  if (!r.ok) { const t = await r.text().catch(() => ""); console.error("crm-agente transcricao", r.status, t); return { texto: "", motivo: `IA recusou o áudio (${r.status}, ${fmt.mime}, ${buf.byteLength} bytes)` }; }
  const texto = String(((await r.json()) as { text?: string }).text ?? "").trim();
  return texto ? { texto } : { texto: "", motivo: "áudio sem fala reconhecida" };
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
