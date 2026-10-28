import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dicaDoModulo } from "@/lib/relatorio-modulos";
import { ehTipoGrafico, type GraficoConfig } from "@/lib/relatorio-grafico";

export type RelatorioIa = {
  nome: string;
  descricao: string;
  tabela_base: string;
  colunas: string[];
  relacoes?: string[];
  filtros: { campo: string; operador: string; valor: string }[];
  grafico?: GraficoConfig | null;
};

const SYSTEM =
  "Você monta relatórios de um ERP brasileiro. Recebe o pedido do usuário e o catálogo de tabelas com suas colunas. " +
  "Escolha UMA tabela base do catálogo, as colunas mais úteis (somente colunas existentes daquela tabela, no máximo 12) e filtros fixos opcionais " +
  "(operadores: eq, neq, gt, lt, ilike; datas no formato AAAA-MM-DD; para ilike use %texto%). " +
  "Pense no nível de detalhe certo: para perguntas sobre ITENS de ofertas (produtos/serviços mais oferecidos, quantidades), use a tabela orcamento_itens (colunas natureza = produto/servico, quantidade, valor_unitario, item_id, orcamento_id), não a tabela orcamentos. " +
  "Relações opcionais (joins) no formato tabela(coluna1,coluna2), ex.: itens(nome) a partir de orcamento_itens; no resultado o campo vira 'itens.nome'. " +
  "Filtros podem usar campos de uma relação no formato 'tabela.coluna' (ex.: projetos_status.descricao ilike %erro%) desde que a relação esteja em 'relacoes'. Para status/situação por nome, prefira ilike. " +
  "Para rankings, totais, evolução ou quando o usuário pedir gráfico, preencha 'grafico' com tipo: 'barras' (ranking horizontal), 'colunas' (comparação vertical), 'pizza' ou 'rosca' (proporção), 'linha' ou 'area' (evolução no tempo). " +
  "Para evolução no tempo use 'agrupar' = coluna de data e 'periodo' = 'dia'|'mes'|'ano'. Respeite o tipo de gráfico pedido pelo usuário. " +
  "'agrupar' = campo das categorias (pode ser 'tabela.coluna' de uma relação), 'separar' = campo opcional para séries (ex.: natureza para separar produto e serviço), " +
  "'medida' = 'contagem' ou o nome de uma coluna numérica para somar (ex.: quantidade). Inclua nas colunas os campos usados no gráfico. Caso contrário grafico = null. " +
  "Responda SOMENTE um JSON válido, sem markdown: {\"nome\":string,\"descricao\":string,\"tabela_base\":string,\"colunas\":string[],\"relacoes\":string[],\"filtros\":[{\"campo\":string,\"operador\":string,\"valor\":string}],\"grafico\":{\"tipo\":string,\"agrupar\":string,\"separar\":string,\"medida\":string,\"periodo\":string|null}|null}.";

/** IA transforma o pedido em texto na configuração de um relatório (tabela, colunas e filtros). */
export const montarRelatorioIa = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      pedido: z.string().min(3).max(2000),
      modulo: z.string().max(40).optional(),
      token: z.string().min(10).max(5000),
      catalogo: z.record(z.string(), z.array(z.string()).max(300)),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ relatorio?: RelatorioIa; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });
    const { data: u, error: ue } = await db.auth.getUser(data.token);
    if (ue || !u.user) return { erro: "Sessão expirada. Entre novamente." };

    type Aut = { permitido: boolean; motivo?: string; origem?: "plataforma" | "propria"; provedor?: string; modelo?: string | null; chave?: string; cota?: number | null };
    let a: Aut = { permitido: true, origem: "plataforma" };
    const { data: auth, error: ae } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (!ae && auth) a = auth as unknown as Aut;
    if (!a.permitido) {
      if (a.motivo === "cota") return { erro: `Limite de ${a.cota} usos de IA no mês atingido.` };
      return { erro: "A IA está nos planos Pro e Enterprise ou com a chave própria da empresa (Empresas → Inteligência Artificial)." };
    }

    const catalogo = Object.entries(data.catalogo).map(([t, c]) => `${t}: ${c.join(", ")}`).join("\n");
    const mod = dicaDoModulo(data.modulo);
    const contexto = mod ? `Módulo escolhido pelo usuário: ${mod.nome}. Use SOMENTE tabelas deste módulo. ${mod.dica}\n` : "";
    const prompt = `Hoje: ${new Date().toISOString().slice(0, 10)}\n${contexto}Catálogo:\n${catalogo}\n\nPedido: ${data.pedido}`;
    try {
      const { streamText } = await import("ai");
      let r;
      if (a.origem === "propria") {
        const chave = a.chave ?? "";
        let model;
        if (a.provedor === "openai") {
          const { createOpenAI } = await import("@ai-sdk/openai");
          model = createOpenAI({ apiKey: chave }).responses(a.modelo || "gpt-5-mini");
        } else {
          const P: Record<string, { baseURL: string; modelo: string }> = {
            gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
            anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
          };
          const p = P[a.provedor ?? ""];
          if (!p) return { erro: "Provedor de IA inválido. Confira em Empresas → Inteligência Artificial." };
          const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
          model = createOpenAICompatible({ name: a.provedor!, baseURL: p.baseURL, apiKey: chave })(a.modelo || p.modelo);
        }
        r = streamText({ model, maxRetries: 0, system: SYSTEM, prompt });
      } else {
        const chave = process.env["LOVABLE_API_KEY"];
        if (!chave) return { erro: "IA do plano indisponível. Cadastre a chave própria em Empresas → Inteligência Artificial." };
        const { createOpenAI } = await import("@ai-sdk/openai");
        r = streamText({
          model: createOpenAI({
            baseURL: "https://ai.gateway.lovable.dev/v1",
            apiKey: chave,
            headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          }).responses("openai/gpt-6-astra"),
          maxRetries: 0,
          system: SYSTEM,
          prompt,
          providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
        });
      }
      const txt = (await r.text).trim();
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) return { erro: "A IA não conseguiu montar o relatório. Descreva com mais detalhes." };
      const j = JSON.parse(m[0]) as RelatorioIa;
      const cols = data.catalogo[j.tabela_base];
      if (!cols) return { erro: "A IA escolheu uma tabela que você não pode acessar. Reformule o pedido." };
      const ok = new Set(cols);
      const relacoes = (j.relacoes ?? []).filter((r) => {
        const m2 = /^(\w+)\(([\w,\s]+)\)$/.exec(String(r).trim());
        const cs = m2 ? data.catalogo[m2[1]!] : undefined;
        return Boolean(cs && m2![2]!.split(",").every((c) => cs.includes(c.trim())));
      });
      const g = j.grafico;
      const periodo = g && ["dia", "mes", "ano"].includes(String(g.periodo)) ? (g.periodo as GraficoConfig["periodo"]) : undefined;
      const grafico: GraficoConfig | null = g && g.agrupar && ehTipoGrafico(g.tipo)
        ? { tipo: g.tipo, agrupar: String(g.agrupar), ...(g.separar ? { separar: String(g.separar) } : {}), medida: String(g.medida || "contagem"), ...(periodo ? { periodo } : {}) }
        : null;
      const relTabelas = new Map(relacoes.map((r) => { const m3 = /^(\w+)\(([\w,\s]+)\)$/.exec(String(r).trim())!; return [m3[1]!, m3[2]!.split(",").map((c) => c.trim())]; }));
      const campoOk = (c: string) => {
        if (ok.has(c)) return true;
        const [t, col] = c.split(".");
        return Boolean(t && col && relTabelas.get(t)?.includes(col));
      };
      return {
        relatorio: {
          nome: String(j.nome ?? "Relatório").slice(0, 120),
          descricao: String(j.descricao ?? "").slice(0, 500),
          tabela_base: j.tabela_base,
          colunas: (j.colunas ?? []).filter((c) => ok.has(c)),
          relacoes,
          grafico,
          filtros: (j.filtros ?? []).filter((f) => campoOk(String(f.campo)) && ["eq", "neq", "gt", "lt", "ilike"].includes(f.operador)),
        },
      };
    } catch (e) {
      const s = (e as { statusCode?: number }).statusCode;
      console.error("montarRelatorioIa", e);
      if (a.origem === "propria" && (s === 401 || s === 403)) return { erro: "A chave de IA da empresa foi recusada. Confira em Empresas → Inteligência Artificial." };
      if (s === 402) return { erro: "Créditos de IA esgotados." };
      if (s === 429) return { erro: "Muitas solicitações. Tente em instantes." };
      return { erro: "Não foi possível montar o relatório agora." };
    }
  });
