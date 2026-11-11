import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TIPOS = {
  email: "um calendário de 4 pautas de e-mail marketing (uma por semana). Para cada uma: assunto, pré-cabeçalho, objetivo, roteiro do texto em 4 a 6 linhas e chamada para ação.",
  social: "um calendário de 2 semanas de postagens para Instagram, LinkedIn e Facebook (8 posts). Para cada um: dia, rede, formato (carrossel, reels, imagem), gancho de abertura, legenda curta, ideia visual e hashtags.",
  ads: "duas campanhas de anúncios: uma no Google Ads (palavras-chave sugeridas, palavras negativas, 3 títulos de até 30 caracteres, 2 descrições de até 90 caracteres) e uma no Meta Ads (público-alvo, 2 textos principais, título e criativo sugerido). Inclua orçamento diário sugerido em R$ e as métricas a acompanhar.",
} as const;

type Autorizacao = { permitido: boolean; motivo?: string; origem?: "plataforma" | "propria"; provedor?: string; modelo?: string | null; chave?: string; cota?: number | null };

const PROVEDORES: Record<string, { baseURL: string; modelo: string }> = {
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
  anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
};

/** Consultor de Marketing (IA): pautas de e-mail, redes sociais e anúncios para o público-alvo. */
export const sugerirMarketing = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    tipo: z.enum(["email", "social", "ads"]),
    empresa: z.string().max(200),
    negocio: z.string().min(3).max(2000),
    publico: z.string().min(3).max(2000),
    objetivo: z.string().max(1000).optional(),
    token: z.string().min(10).max(5000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ texto: string; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });
    const { data: userData, error: userErr } = await db.auth.getUser(data.token);
    if (userErr || !userData.user) return { texto: "", erro: "Sessão expirada. Entre novamente." };

    let a: Autorizacao = { permitido: true, origem: "plataforma" };
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (!error && auth) a = auth as unknown as Autorizacao;
    if (!a.permitido) {
      if (a.motivo === "cota") return { texto: "", erro: `Limite de ${a.cota} análises de IA no mês atingido.` };
      return { texto: "", erro: "O Consultor de Marketing está nos planos Pro e Enterprise ou com a chave própria da empresa (Empresas → Inteligência Artificial)." };
    }

    const system = "Você é um Consultor de Marketing B2B sênior no Brasil. Escreva em português do Brasil, em markdown, com linguagem prática e pronta para usar. Use somente os dados fornecidos; não invente números de clientes, prêmios ou depoimentos. Respeite a LGPD e as políticas do Google e da Meta.";
    const prompt = `Data de hoje: ${new Date().toISOString().slice(0, 10)}
Empresa: ${data.empresa || "(não informada)"}
O que vendemos: ${data.negocio}
Público-alvo: ${data.publico}
Objetivo: ${data.objetivo || "gerar novos clientes"}

Monte ${TIPOS[data.tipo]}`;

    const { streamText } = await import("ai");
    try {
      let model;
      let providerOptions: Record<string, Record<string, never> | Record<string, unknown>> | undefined;
      if (a.origem === "propria") {
        const chave = a.chave ?? "";
        if (a.provedor === "openai") {
          const { createOpenAI } = await import("@ai-sdk/openai");
          model = createOpenAI({ apiKey: chave }).responses(a.modelo || "gpt-5-mini");
        } else {
          const p = PROVEDORES[a.provedor ?? ""];
          if (!p) return { texto: "", erro: "Provedor de IA inválido." };
          const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
          model = createOpenAICompatible({ name: a.provedor!, baseURL: p.baseURL, apiKey: chave })(a.modelo || p.modelo);
        }
      } else {
        const chave = process.env["LOVABLE_API_KEY"];
        if (!chave) return { texto: "", erro: "IA da plataforma indisponível no momento." };
        const { createOpenAI } = await import("@ai-sdk/openai");
        model = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra");
        providerOptions = { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } };
      }
      const r = streamText({ model, maxRetries: 0, system, prompt, ...(providerOptions ? { providerOptions: providerOptions as never } : {}) });
      const texto = (await r.text).trim();
      return texto ? { texto } : { texto: "", erro: "A IA não retornou sugestões." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("sugerirMarketing", e);
      if (a.origem === "propria" && (status === 401 || status === 403)) return { texto: "", erro: "A chave de IA da empresa foi recusada pelo provedor." };
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível gerar as sugestões agora." };
    }
  });

/** IA: escreve os textos da sequência do SDR (e-mail + WhatsApp) para o que a empresa vende. */
export const gerarCadenciaIA = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    empresa: z.string().max(200),
    negocio: z.string().min(3).max(2000),
    publico: z.string().max(2000).optional(),
    canais: z.array(z.enum(["email", "whatsapp"])).min(1).max(8),
    dias: z.array(z.number().int().min(0).max(90)).min(1).max(8),
    token: z.string().min(10).max(5000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ passos: { assunto: string; texto: string }[]; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${data.token}` } } });
    const { data: u, error: ue } = await db.auth.getUser(data.token);
    if (ue || !u.user) return { passos: [], erro: "Sessão expirada. Entre novamente." };
    let a: Autorizacao = { permitido: true, origem: "plataforma" };
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (!error && auth) a = auth as unknown as Autorizacao;
    if (!a.permitido) return { passos: [], erro: a.motivo === "cota" ? `Limite de ${a.cota} análises de IA no mês atingido.` : "A IA está nos planos Pro e Enterprise ou com a chave própria da empresa." };

    const lista = data.canais.map((c, i) => `Passo ${i + 1}: dia ${data.dias[i] ?? 0}, canal ${c === "email" ? "e-mail" : "WhatsApp"}`).join("\n");
    const system = "Você é um SDR B2B sênior no Brasil. Escreva em português do Brasil, tom consultivo, curto e humano, sem promessas exageradas, sem inventar clientes, números ou prêmios. Respeite a LGPD. Responda somente com json válido.";
    const prompt = `Minha empresa: ${data.empresa || "(não informada)"}
O que vendemos: ${data.negocio}
Público-alvo: ${data.publico || "empresas da região"}

Escreva a sequência de prospecção abaixo. Use as variáveis {{empresa}}, {{segmento}}, {{cidade}} e {{minha_empresa}} onde fizer sentido.
E-mails: até 90 palavras, com assunto de até 60 caracteres e um pedido claro de resposta. WhatsApp: até 45 palavras, sem assunto (assunto vazio).
O primeiro passo apresenta e gera autoridade, os do meio fazem acompanhamento e o último é uma última chamada educada.
${lista}

Formato json: {"passos":[{"assunto":"...","texto":"..."}]} com exatamente ${data.canais.length} itens na mesma ordem.`;

    const { streamText } = await import("ai");
    try {
      const { model, providerOptions } = await modeloIA(a);
      if (!model) return { passos: [], erro: "Provedor de IA indisponível." };
      const r = streamText({ model, maxRetries: 0, system, prompt, ...(providerOptions ? { providerOptions: providerOptions as never } : {}) });
      const bruto = (await r.text).trim();
      const m = bruto.match(/\{[\s\S]*\}/);
      const j = m ? (JSON.parse(m[0]) as { passos?: { assunto?: unknown; texto?: unknown }[] }) : null;
      const passos = (j?.passos ?? []).map((x) => ({ assunto: String(x.assunto ?? "").slice(0, 200), texto: String(x.texto ?? "").slice(0, 3000) })).filter((x) => x.texto);
      return passos.length ? { passos } : { passos: [], erro: "A IA não retornou os textos." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("gerarCadenciaIA", e);
      if (status === 402) return { passos: [], erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { passos: [], erro: "Muitas solicitações. Tente novamente em instantes." };
      return { passos: [], erro: "Não foi possível gerar os textos agora." };
    }
  });

async function modeloIA(a: Autorizacao) {
  let model;
  let providerOptions: Record<string, unknown> | undefined;
  if (a.origem === "propria") {
    const chave = a.chave ?? "";
    if (a.provedor === "openai") {
      const { createOpenAI } = await import("@ai-sdk/openai");
      model = createOpenAI({ apiKey: chave }).responses(a.modelo || "gpt-5-mini");
    } else {
      const p = PROVEDORES[a.provedor ?? ""];
      if (!p) return { model: null };
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      model = createOpenAICompatible({ name: a.provedor!, baseURL: p.baseURL, apiKey: chave })(a.modelo || p.modelo);
    }
  } else {
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { model: null };
    const { createOpenAI } = await import("@ai-sdk/openai");
    model = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: chave, headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } }).responses("openai/gpt-6-astra");
    providerOptions = { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } };
  }
  return { model, providerOptions };
}

/** Assistente de IA para redigir avisos de condomínio (título, tipo e texto HTML). */
export const redigirAvisoIA = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    ideia: z.string().min(5).max(3000),
    tom: z.enum(["informativo", "cordial", "firme", "urgente"]),
    condominio: z.string().max(200),
    token: z.string().min(10).max(5000),
  }).parse(d))
  .handler(async ({ data }): Promise<{ titulo: string; tipo: string; html: string; erro?: string }> => {
    const vazio = { titulo: "", tipo: "geral", html: "" };
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${data.token}` } } });
    const { data: u, error: ue } = await db.auth.getUser(data.token);
    if (ue || !u.user) return { ...vazio, erro: "Sessão expirada. Entre novamente." };
    let a: Autorizacao = { permitido: true, origem: "plataforma" };
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (!error && auth) a = auth as unknown as Autorizacao;
    if (!a.permitido) return { ...vazio, erro: a.motivo === "cota" ? `Limite de ${a.cota} usos de IA no mês atingido.` : "A IA está nos planos Pro e Enterprise ou com a chave própria da empresa." };

    const TONS = {
      informativo: "informativo e neutro: claro, direto e profissional",
      cordial: "cordial e educativo: gentil, explica o porquê da regra",
      firme: "firme, de notificação: respeitoso, sem ofensas, cita a regra e as consequências sem expor ninguém",
      urgente: "urgente, de alerta: frases curtas, a ação esperada logo no início",
    } as const;
    const system = "Você é redator de comunicados de uma administradora de condomínios no Brasil. Escreva em português do Brasil, linguagem simples para todos os moradores. Use somente os fatos fornecidos: não invente datas, horários, nomes, valores ou empresas; se faltar algo importante, deixe um marcador como [informar horário]. Nunca exponha nomes ou unidades de moradores em casos de reclamação (LGPD). Responda somente com json válido.";
    const prompt = `Condomínio: ${data.condominio || "(não informado)"}
Tom: ${TONS[data.tom]}
O que o síndico quer comunicar: ${data.ideia}

Monte o aviso:
- titulo: até 80 caracteres, objetivo.
- tipo: um destes valores: geral, emergencia, assembleia, obras, financeiro.
- html: corpo em HTML simples (apenas <p>, <b>, <i>, <ul>, <li>, <br>), começando com "Prezados moradores," ou saudação adequada ao tom, parágrafos curtos, lista para datas/horários/orientações quando houver, e encerrando com "Atenciosamente,<br>Administração do {{condominio}}". Até 180 palavras.

Formato json: {"titulo":"...","tipo":"...","html":"..."}`;

    const { streamText } = await import("ai");
    try {
      const { model, providerOptions } = await modeloIA(a);
      if (!model) return { ...vazio, erro: "Provedor de IA indisponível." };
      const r = streamText({ model, maxRetries: 0, system, prompt, ...(providerOptions ? { providerOptions: providerOptions as never } : {}) });
      const bruto = (await r.text).trim();
      const m = bruto.match(/\{[\s\S]*\}/);
      const j = m ? (JSON.parse(m[0]) as { titulo?: unknown; tipo?: unknown; html?: unknown }) : null;
      const tipos = ["geral", "emergencia", "assembleia", "obras", "financeiro"];
      const tipo = tipos.includes(String(j?.tipo)) ? String(j?.tipo) : "geral";
      const html = String(j?.html ?? "").replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, "").replace(/\son\w+="[^"]*"/gi, "").slice(0, 8000);
      if (!html) return { ...vazio, erro: "A IA não retornou o texto. Tente novamente." };
      return { titulo: String(j?.titulo ?? "").slice(0, 150), tipo, html };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("redigirAvisoIA", e);
      if (status === 402) return { ...vazio, erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { ...vazio, erro: "Muitas solicitações. Tente novamente em instantes." };
      return { ...vazio, erro: "Não foi possível redigir o aviso agora." };
    }
  });

/** IA: gera uma imagem ilustrativa (sem texto) para um aviso de condomínio. Devolve data URL. */
export const gerarImagemAvisoIA = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ ideia: z.string().min(5).max(3000), token: z.string().min(10).max(5000) }).parse(d))
  .handler(async ({ data }): Promise<{ imagem: string; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${data.token}` } } });
    const { data: u, error: ue } = await db.auth.getUser(data.token);
    if (ue || !u.user) return { imagem: "", erro: "Sessão expirada. Entre novamente." };
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    const a = (!error && auth ? auth : { permitido: true }) as Autorizacao;
    if (!a.permitido) return { imagem: "", erro: a.motivo === "cota" ? `Limite de ${a.cota} usos de IA no mês atingido.` : "A IA está nos planos Pro e Enterprise." };
    const ideia = data.ideia.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, 600);
    const prompt = `Ilustração moderna, limpa e profissional para um comunicado de condomínio residencial no Brasil. Tema (use apenas como inspiração visual, sem reproduzir datas, horários, nomes ou sites): ${ideia}. Estilo vetorial/3D suave, cores agradáveis, fundo claro. NÃO escreva nenhum texto, letra ou número na imagem. Não mostre rostos identificáveis.`;
    try {
      const { generateImage } = await import("@lovable.dev/ai-gateway");
      const r = await generateImage({ model: "google/gemini-3.1-flash-lite-image", prompt });
      const b64 = r.data?.[0]?.b64_json ?? "";
      return b64 ? { imagem: `data:image/png;base64,${b64}` } : { imagem: "", erro: "A IA não retornou a imagem. Tente novamente." };
    } catch (e) {
      console.error("gerarImagemAvisoIA", e);
      const st = (e as { httpStatus?: number }).httpStatus;
      if (st === 402) return { imagem: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (st === 429) return { imagem: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { imagem: "", erro: "Não foi possível criar a imagem agora. O texto foi mantido; clique em Tentar gerar imagem." };
    }
  });
