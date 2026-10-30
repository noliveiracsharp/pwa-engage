import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/lib/auth-guard";
import { z } from "zod";

export type LeituraComprovante = {
  valor: number | null;
  data: string | null;
  estabelecimento: string | null;
  cnpj: string | null;
  categoria: string | null;
  erro?: string;
};

const vazio: LeituraComprovante = { valor: null, data: null, estabelecimento: null, cnpj: null, categoria: null };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["valor", "data", "estabelecimento", "cnpj", "categoria"],
  properties: {
    valor: { type: ["number", "null"], description: "Valor TOTAL pago em reais" },
    data: { type: ["string", "null"], description: "Data da compra no formato AAAA-MM-DD" },
    estabelecimento: { type: ["string", "null"] },
    cnpj: { type: ["string", "null"], description: "Somente dígitos" },
    categoria: {
      type: ["string", "null"],
      enum: ["alimentacao", "combustivel", "pedagio", "estacionamento", "hospedagem", "transporte", "material", "outros", null],
    },
  },
} as const;

const PROMPT = "Este é um comprovante de despesa brasileiro (cupom fiscal, nota, recibo ou comprovante de cartão). Extraia o valor total pago, a data (AAAA-MM-DD), o nome do estabelecimento, o CNPJ (só dígitos) e a categoria mais provável entre: alimentacao, combustivel, pedagio, estacionamento, hospedagem, transporte, material, outros. Use null no que não for legível. Responda somente JSON com as chaves valor, data, estabelecimento, cnpj, categoria.";

function normalizar(txt: string): LeituraComprovante {
  const limpo = txt.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const j = JSON.parse(limpo) as LeituraComprovante;
  const valor = typeof j.valor === "string" ? Number(String(j.valor).replace(/\./g, "").replace(",", ".")) : j.valor;
  return {
    valor: typeof valor === "number" && valor > 0 ? Math.round(valor * 100) / 100 : null,
    data: j.data && /^\d{4}-\d{2}-\d{2}$/.test(j.data) ? j.data : null,
    estabelecimento: j.estabelecimento || null,
    cnpj: j.cnpj ? String(j.cnpj).replace(/\D/g, "") || null : null,
    categoria: j.categoria || null,
  };
}

/** Lê com a chave própria da empresa (Gemini/OpenAI) baixando o arquivo e enviando inline. */
async function lerComChavePropria(provedor: string, chave: string, modelo: string | null | undefined, url: string, pdf: boolean): Promise<LeituraComprovante> {
  const a = await fetch(url);
  if (!a.ok) return { ...vazio, erro: "Não foi possível baixar o comprovante." };
  const mime = pdf ? "application/pdf" : (a.headers.get("content-type") || "image/jpeg").split(";")[0];
  const buf = new Uint8Array(await a.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  if (provedor === "gemini") {
    const m = modelo || "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(chave)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: b64 } }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!r.ok) {
      console.error("gemini comprovante", r.status, await r.text().catch(() => ""));
      if (r.status === 429) return { ...vazio, erro: "Limite da chave Gemini atingido. Tente de novo em instantes." };
      if (r.status === 400 || r.status === 403) return { ...vazio, erro: "A chave Gemini da empresa recusou a leitura. Confira em Empresas → Inteligência Artificial." };
      return { ...vazio, erro: "Não foi possível ler o comprovante." };
    }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return txt.trim() ? normalizar(txt) : { ...vazio, erro: "Não foi possível ler o comprovante." };
  }
  if (provedor === "openai") {
    const parte = pdf
      ? { type: "file", file: { filename: "comprovante.pdf", file_data: `data:${mime};base64,${b64}` } }
      : { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } };
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelo || "gpt-4o-mini", response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, parte] }] }),
    });
    if (!r.ok) {
      console.error("openai comprovante", r.status);
      return { ...vazio, erro: "A chave OpenAI da empresa recusou a leitura. Confira em Empresas → Inteligência Artificial." };
    }
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const txt = j.choices?.[0]?.message?.content ?? "";
    return txt.trim() ? normalizar(txt) : { ...vazio, erro: "Não foi possível ler o comprovante." };
  }
  return { ...vazio, erro: "Provedor de IA da empresa não suporta leitura de imagem." };
}

/** Lê cupom fiscal / recibo (imagem ou PDF por URL pública) e devolve os campos para pré-preencher a despesa. */
export const lerComprovante = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ url: z.string().url().max(2000), pdf: z.boolean().optional(), token: z.string().max(5000).optional() }).parse(d))
  .handler(async ({ data }): Promise<LeituraComprovante> => {
    // 1º chave própria da empresa (Empresas → Inteligência Artificial); depois IA da plataforma.
    if (data.token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
        const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${data.token}` } },
        });
        const { data: auth } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
        const a = auth as unknown as { origem?: string; provedor?: string; chave?: string; modelo?: string | null } | null;
        if (a?.origem === "propria" && a.chave && a.provedor) {
          try {
            return await lerComChavePropria(a.provedor, a.chave, a.modelo, data.url, !!data.pdf);
          } catch (e) {
            console.error("lerComprovante propria", e);
            return { ...vazio, erro: "Não foi possível ler o comprovante." };
          }
        }
      } catch (e) { console.error("ia_autorizar comprovante", e); }
    }
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { ...vazio, erro: "Leitura automática indisponível: cadastre a chave de IA em Empresas → Inteligência Artificial." };
    const midia = data.pdf
      ? { type: "input_file", file_url: data.url }
      : { type: "input_image", image_url: data.url };
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: "comprovante", strict: true, schema: SCHEMA } },
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: "Este é um comprovante de despesa brasileiro (cupom fiscal, nota, recibo ou comprovante de cartão). Extraia o valor total pago, a data, o nome do estabelecimento, o CNPJ e a categoria mais provável. Use null no que não for legível." },
              midia,
            ],
          }],
        }),
      });
      if (!r.ok || !r.body) {
        if (r.status === 402) return { ...vazio, erro: "Créditos de IA esgotados. Preencha manualmente." };
        if (r.status === 429) return { ...vazio, erro: "Muitas leituras agora. Tente de novo em instantes." };
        return { ...vazio, erro: "Não foi possível ler o comprovante." };
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", txt = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const linhas = buf.split("\n");
        buf = linhas.pop() ?? "";
        for (const l of linhas) {
          if (!l.startsWith("data:")) continue;
          const p = l.slice(5).trim();
          if (!p || p === "[DONE]") continue;
          try {
            const ev = JSON.parse(p) as { type?: string; delta?: string };
            if (ev.type === "response.output_text.delta" && ev.delta) txt += ev.delta;
          } catch { /* frame parcial */ }
        }
      }
      if (!txt.trim()) return { ...vazio, erro: "Não foi possível ler o comprovante." };
      const j = JSON.parse(txt) as LeituraComprovante;
      return {
        valor: typeof j.valor === "number" && j.valor > 0 ? Math.round(j.valor * 100) / 100 : null,
        data: j.data && /^\d{4}-\d{2}-\d{2}$/.test(j.data) ? j.data : null,
        estabelecimento: j.estabelecimento || null,
        cnpj: j.cnpj ? j.cnpj.replace(/\D/g, "") || null : null,
        categoria: j.categoria || null,
      };
    } catch {
      return { ...vazio, erro: "Não foi possível ler o comprovante." };
    }
  });
