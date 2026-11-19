import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/lib/auth-guard";

export type ArtigoLido = { origem: "convencao" | "regimento" | "outro"; capitulo: string | null; numero: string | null; titulo: string | null; tema: string | null; texto: string };

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["artigos", "fim"],
  properties: {
    fim: { type: "boolean", description: "true quando não há mais artigos depois destes no documento" },
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

const PROMPT_LER = "Este PDF (possivelmente escaneado) contém a Convenção de Condomínio e/ou o Regimento Interno de um condomínio brasileiro. Faça a leitura (OCR) de TODAS as páginas e transcreva TODOS os artigos na ordem, sem resumir e sem inventar. Marque origem 'convencao' ou 'regimento' conforme a parte do documento; cabeçalhos, preâmbulos e anexos vão como 'outro'. Corrija apenas erros óbvios de OCR.";

const SISTEMA_PERGUNTA = "Você é o assistente do condomínio. Responda em português do Brasil, de forma simples e curta, usando SOMENTE os artigos fornecidos. Cite sempre a origem (Convenção ou Regimento) e o número do artigo. Se a resposta não estiver nos artigos, diga que o documento não trata do assunto e sugira falar com a administração.";

type Aut = { permitido?: boolean; motivo?: string; cota?: number | null; origem?: string; provedor?: string; modelo?: string | null; chave?: string };
type Res = { txt: string; erro?: string };

/** Descobre qual IA a empresa usa (Empresas → Inteligência Artificial). */
async function autorizar(token?: string): Promise<Aut> {
  if (!token) return { permitido: true, origem: "plataforma" };
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await db.rpc("ia_autorizar" as never, { _recurso: "documentos" } as never);
    if (!error && data) return data as unknown as Aut;
    if (error) console.error("ia_autorizar documentos", error);
  } catch (e) { console.error("ia_autorizar documentos", e); }
  return { permitido: true, origem: "plataforma" };
}

async function baixarBase64(url: string): Promise<string | null> {
  const a = await fetch(url);
  if (!a.ok) return null;
  const buf = new Uint8Array(await a.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Chama a chave própria da empresa (Gemini ou OpenAI). */
async function chavePropria(a: Aut, system: string, prompt: string, pdfUrl?: string, json?: boolean): Promise<Res> {
  const chave = a.chave ?? "";
  const b64 = pdfUrl ? await baixarBase64(pdfUrl) : null;
  if (pdfUrl && !b64) return { txt: "", erro: "Não foi possível baixar o arquivo." };
  if (a.provedor === "gemini") {
    const m = a.modelo || "gemini-2.5-flash";
    const parts: unknown[] = [{ text: prompt }];
    if (b64) parts.push({ inlineData: { mimeType: "application/pdf", data: b64 } });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(chave)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }], generationConfig: { ...(json ? { responseMimeType: "application/json" } : {}), maxOutputTokens: 65000 } }),
    });
    if (!r.ok) {
      console.error("gemini documentos", r.status, await r.text().catch(() => ""));
      if (r.status === 429) return { txt: "", erro: "Limite da chave Gemini atingido. Tente de novo em instantes." };
      if (r.status === 400 || r.status === 401 || r.status === 403) return { txt: "", erro: "A chave Gemini da empresa recusou a leitura. Confira em Empresas → Inteligência Artificial." };
      return { txt: "", erro: "A IA não conseguiu ler o documento." };
    }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return { txt: j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "" };
  }
  if (a.provedor === "openai") {
    const content: unknown[] = [{ type: "text", text: prompt }];
    if (b64) content.push({ type: "file", file: { filename: "documento.pdf", file_data: `data:application/pdf;base64,${b64}` } });
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: a.modelo || "gpt-4o-mini", ...(json ? { response_format: { type: "json_object" } } : {}), messages: [{ role: "system", content: system }, { role: "user", content }] }),
    });
    if (!r.ok) {
      console.error("openai documentos", r.status, await r.text().catch(() => ""));
      if (r.status === 429) return { txt: "", erro: "Limite da chave OpenAI atingido. Tente de novo em instantes." };
      return { txt: "", erro: "A chave OpenAI da empresa recusou a leitura. Confira em Empresas → Inteligência Artificial." };
    }
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return { txt: j.choices?.[0]?.message?.content ?? "" };
  }
  return { txt: "", erro: "O provedor de IA da empresa não lê PDF. Use OpenAI ou Gemini em Empresas → Inteligência Artificial." };
}

async function gateway(body: unknown): Promise<Res> {
  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) return { txt: "", erro: "IA da plataforma indisponível. Cadastre a chave da empresa em Empresas → Inteligência Artificial." };
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
  .inputValidator((d) => z.object({ url: z.string().url().max(3000), token: z.string().max(5000).optional(), depois: z.string().max(600).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ artigos: ArtigoLido[]; fim: boolean; erro?: string }> => {
    try {
      const parte = data.depois
        ? `\n\nCONTINUAÇÃO: os trechos até "${data.depois}" já foram transcritos. Comece IMEDIATAMENTE depois dele, sem repetir nada.`
        : "\n\nComece do início do documento.";
      const PEDIDO = `${PROMPT_LER}${parte}\nTranscreva no máximo 25 artigos nesta resposta e marque fim=false se ainda houver artigos depois; fim=true só quando chegar ao final do documento. Nunca escreva notas ou comentários sobre a transcrição.`;
      const a = await autorizar(data.token);
      if (a.permitido === false) return { artigos: [], fim: true, erro: a.motivo === "cota" ? `Limite de ${a.cota} usos de IA no mês atingido.` : "A IA está nos planos Pro e Enterprise ou com a chave própria da empresa (Empresas → Inteligência Artificial)." };
      const { txt, erro } = a.origem === "propria" && a.chave
        ? await chavePropria(a, "Você transcreve documentos condominiais brasileiros. Responda somente JSON válido.", `${PEDIDO}\n\nResponda em JSON no formato {"fim":false,"artigos":[{"origem":"convencao|regimento|outro","capitulo":null,"numero":"Art. 1","titulo":null,"tema":"palavra-chave","texto":"texto integral"}]}.`, data.url, true)
        : await gateway({
        model: "openai/gpt-6.1-sol",
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "artigos", strict: true, schema: SCHEMA } },
        input: [{ role: "user", content: [
          { type: "input_text", text: PEDIDO },
          { type: "input_file", file_url: data.url },
        ] }],
      });
      if (erro) return { artigos: [], fim: true, erro };
      const limpo = txt.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      const j = JSON.parse(limpo) as { artigos?: ArtigoLido[]; fim?: boolean };
      const ORIG = ["convencao", "regimento", "outro"];
      const artigos = (j.artigos ?? []).filter((x) => x.texto?.trim() && !/transcri[çc][ãa]o (parcial|integral)|nota sobre a transcri/i.test(`${x.titulo ?? ""} ${x.texto.slice(0, 200)}`)).map((x) => ({ ...x, origem: ORIG.includes(x.origem) ? x.origem : "outro", capitulo: x.capitulo ?? null, numero: x.numero ?? null, titulo: x.titulo ?? null, tema: x.tema ?? null }));
      const fim = j.fim !== false || !artigos.length;
      return artigos.length || data.depois ? { artigos, fim } : { artigos: [], fim: true, erro: "Nenhum artigo encontrado no documento." };
    } catch (e) {
      console.error("lerDocumentoIA", e);
      return { artigos: [], fim: true, erro: "A IA não conseguiu ler o documento." };
    }
  });

/** Responde perguntas usando só os artigos fornecidos, citando-os. */
export const perguntarRegimento = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ pergunta: z.string().min(3).max(1000), contexto: z.string().max(400000), token: z.string().max(5000).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ resposta: string; erro?: string }> => {
    try {
      const a = await autorizar(data.token);
      if (a.permitido === false) return { resposta: "", erro: a.motivo === "cota" ? `Limite de ${a.cota} usos de IA no mês atingido.` : "A IA está nos planos Pro e Enterprise ou com a chave própria da empresa." };
      const prompt = `ARTIGOS:\n${data.contexto}\n\nPERGUNTA: ${data.pergunta}`;
      const { txt, erro } = a.origem === "propria" && a.chave ? await chavePropria(a, SISTEMA_PERGUNTA, prompt) : await gateway({
        model: "openai/gpt-6.1-sol",
        instructions: SISTEMA_PERGUNTA,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      });
      if (erro) return { resposta: "", erro };
      return { resposta: txt.trim() || "Não consegui responder agora." };
    } catch (e) {
      console.error("perguntarRegimento", e);
      return { resposta: "", erro: "Não consegui responder agora." };
    }
  });
