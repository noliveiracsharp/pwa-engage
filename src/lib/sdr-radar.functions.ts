import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type LeadEncontrado = {
  ref: string;
  nome: string;
  segmento: string;
  telefone: string;
  email: string;
  site: string;
  endereco: string;
  cidade: string;
  uf: string;
};

async function validarSessao(token: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(token);
  return !error && !!data.user;
}

const UF: Record<string, string> = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF",
  "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG",
  "Pará": "PA", "Paraíba": "PB", "Paraná": "PR", "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO",
};

/** Descobre empresas por segmento + cidade em base pública de mapas (OpenStreetMap). */
export const buscarLeads = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ segmento: z.string().trim().min(2).max(120), cidade: z.string().trim().min(2).max(120), token: z.string().min(10).max(5000) }).parse(d))
  .handler(async ({ data }): Promise<{ leads: LeadEncontrado[]; erro?: string }> => {
    if (!(await validarSessao(data.token))) return { leads: [], erro: "Sessão expirada. Entre novamente." };
    const q = `${data.segmento}, ${data.cidade}`;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=50&countrycodes=br&q=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Atende.ai Radar de Leads (contato@atende.ai)", "Accept-Language": "pt-BR" } });
      if (!r.ok) return { leads: [], erro: "Serviço de busca indisponível no momento. Tente de novo em instantes." };
      const lista = (await r.json()) as Array<Record<string, unknown>>;
      const IGNORAR = new Set(["highway", "boundary", "place", "natural", "waterway", "railway", "route"]);
      const leads = lista
        .filter((x) => !IGNORAR.has(String(x["category"] ?? "")))
        .map((x): LeadEncontrado => {
          const ad = (x["address"] ?? {}) as Record<string, string>;
          const ex = (x["extratags"] ?? {}) as Record<string, string>;
          const nome = String(x["name"] || ((x["namedetails"] ?? {}) as Record<string, string>)["name"] || "").trim();
          return {
            ref: `osm:${x["osm_type"]}:${x["osm_id"]}`,
            nome,
            segmento: data.segmento,
            telefone: (ex["phone"] || ex["contact:phone"] || ex["contact:mobile"] || "").split(";")[0]!.trim(),
            email: (ex["email"] || ex["contact:email"] || "").trim(),
            site: (ex["website"] || ex["contact:website"] || "").trim(),
            endereco: [ad["road"], ad["house_number"], ad["suburb"]].filter(Boolean).join(", "),
            cidade: ad["city"] || ad["town"] || ad["village"] || ad["municipality"] || "",
            uf: UF[ad["state"] ?? ""] ?? "",
          };
        })
        .filter((l) => l.nome);
      return { leads };
    } catch {
      return { leads: [], erro: "Não foi possível consultar a busca agora." };
    }
  });

export type DadosCnpj = { razao_social: string; atividade: string; email: string; telefone: string; cidade: string; uf: string; socios: { nome: string; cargo: string }[] };

/** Enriquecimento pelo CNPJ (dados públicos da Receita via BrasilAPI). */
export const enriquecerCnpj = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ cnpj: z.string().regex(/^\d{14}$/), token: z.string().min(10).max(5000) }).parse(d))
  .handler(async ({ data }): Promise<{ dados?: DadosCnpj; erro?: string }> => {
    if (!(await validarSessao(data.token))) return { erro: "Sessão expirada. Entre novamente." };
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${data.cnpj}`);
      if (r.status === 404) return { erro: "CNPJ não encontrado." };
      if (!r.ok) return { erro: "Consulta de CNPJ indisponível no momento." };
      const j = (await r.json()) as Record<string, unknown>;
      const qsa = (j["qsa"] ?? []) as Array<Record<string, string>>;
      const ddd = String(j["ddd_telefone_1"] ?? "").trim();
      return {
        dados: {
          razao_social: String(j["razao_social"] ?? ""),
          atividade: String(j["cnae_fiscal_descricao"] ?? ""),
          email: String(j["email"] ?? "").toLowerCase(),
          telefone: ddd,
          cidade: String(j["municipio"] ?? ""),
          uf: String(j["uf"] ?? ""),
          socios: qsa.map((s) => ({ nome: s["nome_socio"] ?? "", cargo: s["qualificacao_socio"] ?? "" })),
        },
      };
    } catch {
      return { erro: "Consulta de CNPJ indisponível no momento." };
    }
  });
