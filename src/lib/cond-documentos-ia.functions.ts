import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/lib/auth-guard";

export type ArtigoLido = { origem: "convencao" | "regimento" | "outro"; capitulo: string | null; numero: string | null; titulo: string | null; tema: string | null; texto: string };

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["artigos"],
  properties: {
    artigos: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["origem", "capitulo", "numero", "titulo", "tema", "texto"],
        properties: {
          origem: { type: "string", enum: ["convencao", "regimento", "outro"] },
          capitulo: { type: ["string", "null"] },
          numero: { type: ["string", "null"], description: "Ex.: Art. 12" },
          titulo: { type: ["string", "null"] },
          tema: { type: ["string", "null"], description: "Uma palavra-chave: animais, mudança, silêncio, vagas, áreas comuns, obras, multas, assembleia, condôminos, administração, finanças, outros" },
          texto: { type: "string", description: "Texto integral do artigo, com parágrafos e incisos" },
        },
      },
    },
  },
} as const;

async function gateway(body: unknown): Promise<{ txt: string; erro?: string }> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return { txt: "", erro: "IA indisponível no momento." };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ ...(body as object), stream: true, store: false }),
  });
  if (!r.ok || !r.body) {
    if (r.status === 402) return { txt: "", erro: "Créditos de IA esgotados." };
    if (r.status === 429) return { txt: "", erro: "Muitas leituras agora. Tente de novo em instantes." };
    console.error("documentos-ia", r.status, await r.text().catch(() => ""));
    return { txt: "", erro: "A IA não conseguiu ler o documento." };
  }
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf = "", txt = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const linhas = buf.split("\n"); buf = linhas.pop() ?? "";
    for (const l of linhas) {
      if (!l.startsWith("data:")) continue;
      const p = l.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try { const ev = JSON.parse(p) as { type?: string; delta?: string }; if (ev.type === "response.output_text.delta" && ev.delta) txt += ev.delta; } catch { /* parcial */ }
    }
  }
  return { txt };
}

/** Lê o PDF (inclusive escaneado) e devolve os artigos da convenção e do regimento. */
export const lerDocumentoIA = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ url: z.string().url().max(3000) }).parse(d))
  .handler(async ({ data }): Promise<{ artigos: ArtigoLido[]; erro?: string }> => {
    try {
      const { txt, erro } = await gateway({
        model: "openai/gpt-6.1-sol",
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "artigos", strict: true, schema: SCHEMA } },
        input: [{ role: "user", content: [
          { type: "input_text", text: "Este PDF (possivelmente escaneado) contém a Convenção de Condomínio e/ou o Regimento Interno de um condomínio brasileiro. Faça a leitura (OCR) de TODAS as páginas e transcreva TODOS os artigos na ordem, sem resumir e sem inventar. Marque origem 'convencao' ou 'regimento' conforme a parte do documento; cabeçalhos, preâmbulos e anexos vão como 'outro'. Corrija apenas erros óbvios de OCR." },
          { type: "input_file", file_url: data.url },
        ] }],
      });
      if (erro) return { artigos: [], erro };
      const j = JSON.parse(txt) as { artigos?: ArtigoLido[] };
      const artigos = (j.artigos ?? []).filter((a) => a.texto?.trim());
      return artigos.length ? { artigos } : { artigos: [], erro: "Nenhum artigo encontrado no documento." };
    } catch (e) {
      console.error("lerDocumentoIA", e);
      return { artigos: [], erro: "A IA não conseguiu ler o documento." };
    }
  });

/** Responde perguntas usando só os artigos fornecidos, citando-os. */
export const perguntarRegimento = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ pergunta: z.string().min(3).max(1000), contexto: z.string().max(400000) }).parse(d))
  .handler(async ({ data }): Promise<{ resposta: string; erro?: string }> => {
    try {
      const { txt, erro } = await gateway({
        model: "openai/gpt-6.1-sol",
        instructions: "Você é o assistente do condomínio. Responda em português do Brasil, de forma simples e curta, usando SOMENTE os artigos fornecidos. Cite sempre a origem (Convenção ou Regimento) e o número do artigo. Se a resposta não estiver nos artigos, diga que o documento não trata do assunto e sugira falar com a administração.",
        input: [{ role: "user", content: [{ type: "input_text", text: `ARTIGOS:\n${data.contexto}\n\nPERGUNTA: ${data.pergunta}` }] }],
      });
      if (erro) return { resposta: "", erro };
      return { resposta: txt.trim() || "Não consegui responder agora." };
    } catch (e) {
      console.error("perguntarRegimento", e);
      return { resposta: "", erro: "Não consegui responder agora." };
    }
  });
