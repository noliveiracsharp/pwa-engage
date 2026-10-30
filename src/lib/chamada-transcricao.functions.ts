import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/lib/auth-guard";

const LIMITE = 24 * 1024 * 1024;
const GW = "https://ai.gateway.lovable.dev/v1";

/** Lê o stream SSE da Responses API e devolve o texto final. */
async function lerTexto(r: Response): Promise<string> {
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const linha = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!linha.startsWith("data:")) continue;
      const d = linha.slice(5).trim();
      if (d === "[DONE]") continue;
      try {
        const j = JSON.parse(d) as { type?: string; delta?: string };
        if (j.type === "response.output_text.delta" && j.delta) out += j.delta;
      } catch { /* ignora */ }
    }
  }
  return out.trim();
}

/** Transcreve o áudio gravado da chamada e gera resumo + próximas ações. */
export const transcreverChamada = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ audio: z.string().max(34_000_000), tipo: z.string().max(80), participantes: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ texto?: string; erro?: string }> => {
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { erro: "Transcrição indisponível no momento." };
    const bin = atob(data.audio);
    if (!bin.length || bin.length > LIMITE) return { erro: "Gravação vazia ou muito longa para transcrever." };
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const tipo = data.tipo.split(";")[0] || "audio/webm";
    const ext = tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm";

    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", new File([bytes], `chamada.${ext}`, { type: tipo }));
    form.append("response_format", "json");
    form.append("language", "pt");
    const t = await fetch(`${GW}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${chave}`, "X-Lovable-AIG-SDK": "fetch" }, body: form });
    if (!t.ok) {
      console.error("transcricao chamada", t.status, await t.text().catch(() => ""));
      if (t.status === 402) return { erro: "Créditos de IA esgotados." };
      if (t.status === 429) return { erro: "Muitas transcrições agora. Tente de novo em instantes." };
      return { erro: "Não foi possível transcrever a chamada." };
    }
    const fala = (((await t.json()) as { text?: string }).text ?? "").trim();
    if (!fala) return { erro: "Nenhuma fala identificada na gravação." };

    const r = await fetch(`${GW}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": chave, Authorization: `Bearer ${chave}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: "Você resume chamadas de atendimento em português do Brasil. Responda em texto simples (sem markdown com #), com as seções: 'Resumo:' (3 a 6 linhas), 'Combinados:' e 'Próximas ações:' (listas com '- '). Seja fiel ao que foi dito.",
        input: `Participantes: ${data.participantes || "não informado"}\n\nTranscrição:\n${fala.slice(0, 60000)}`,
      }),
    });
    let resumo = "";
    if (r.ok && r.body) resumo = await lerTexto(r).catch(() => "");
    else console.error("resumo chamada", r.status, await r.text().catch(() => ""));
    const texto = (resumo ? `${resumo}\n\n` : "") + `Transcrição completa:\n${fala}`;
    return { texto };
  });
