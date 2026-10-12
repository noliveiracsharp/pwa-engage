/**
 * Bloco "Perguntar à IA": monta a base de conhecimento (texto, sites e arquivos)
 * e chama o modelo escolhido pelo Lovable AI Gateway. Só roda no servidor.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { MODELO_IA_PADRAO } from "@/lib/fluxos";
import { interpolar } from "@/lib/fluxos-motor";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const SEM_RESPOSTA = "NAO_SEI";
const LIMITE_BASE = 60_000;

const cacheSites = new Map<string, { em: number; texto: string }>();

export function htmlParaTexto(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function lerSite(url: string) {
  const c = cacheSites.get(url);
  if (c && Date.now() - c.em < 30 * 60_000) return c.texto;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return "";
    const r = await fetch(u.toString(), { headers: { "User-Agent": "AtendeAI-Bot/1.0" } });
    if (!r.ok) return "";
    const texto = htmlParaTexto(await r.text()).slice(0, 30_000);
    cacheSites.set(url, { em: Date.now(), texto });
    return texto;
  } catch {
    return "";
  }
}

export async function montarBase(d: Record<string, unknown>) {
  const partes: string[] = [];
  const digitada = String(d["base_texto"] ?? "").trim();
  if (digitada) partes.push(`## Informações da empresa\n${digitada}`);
  const urls = String(d["base_urls"] ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 5);
  for (const u of urls) {
    const t = await lerSite(u);
    if (t) partes.push(`## Site ${u}\n${t}`);
  }
  const arquivos = Array.isArray(d["base_arquivos"]) ? (d["base_arquivos"] as { nome?: string; texto?: string }[]) : [];
  for (const a of arquivos) if (a?.texto) partes.push(`## Arquivo ${a.nome ?? ""}\n${a.texto}`);
  return partes.join("\n\n").slice(0, LIMITE_BASE);
}

export async function perguntarIA(d: Record<string, unknown>, vars: Record<string, string>) {
  const chave = process.env.LOVABLE_API_KEY;
  if (!chave) throw new Error("Chave da IA não configurada");
  const modelo = String(d["modelo"] || MODELO_IA_PADRAO);
  const base = await montarBase(d);
  const persona = interpolar(String(d["instrucoes"] ?? ""), vars).trim() || "Você é um assistente de atendimento cordial e objetivo.";
  const system = [
    persona,
    "Responda em português do Brasil, em texto curto próprio para WhatsApp (sem markdown pesado).",
    base
      ? `Use SOMENTE a base de conhecimento abaixo. Se a resposta não estiver nela, responda exatamente ${SEM_RESPOSTA}.\n\n# Base de conhecimento\n${base}`
      : `Se não tiver certeza da resposta, responda exatamente ${SEM_RESPOSTA}.`,
  ].join("\n\n");
  const pergunta = vars["ultima_mensagem"] ?? "";
  const headers = { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" };

  const result = modelo.startsWith("openai/")
    ? streamText({
        model: createOpenAI({ baseURL: GATEWAY, apiKey: chave, headers }).responses(modelo),
        system,
        prompt: pergunta,
        providerOptions: {
          openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
        },
      })
    : streamText({
        model: createOpenAICompatible({ name: "lovable", baseURL: GATEWAY, headers })(modelo),
        system,
        prompt: pergunta,
      });
  const texto = (await result.text).trim();
  const naoSabe = !texto || texto.toUpperCase().includes(SEM_RESPOSTA);
  return { texto: naoSabe ? "" : texto, naoSabe };
}
