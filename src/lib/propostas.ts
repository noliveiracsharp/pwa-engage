import { formatBRL, formatDate, num } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

export type BlocoTipo = "CAPA" | "APRESENTACAO" | "ORCAMENTO" | "FECHAMENTO" | "CONTRATO";

export type Bloco = { tipo: BlocoTipo; ativo: boolean; titulo: string; conteudo: string };

export const BLOCO_LABEL: Record<BlocoTipo, string> = {
  CAPA: "Capa",
  APRESENTACAO: "Apresentação",
  ORCAMENTO: "Tabela de custos",
  FECHAMENTO: "Fechamento e garantia",
  CONTRATO: "Contrato",
};

export const TAGS = [
  "{{cliente_nome}}",
  "{{cliente_documento}}",
  "{{empresa_nome}}",
  "{{empresa_documento}}",
  "{{numero}}",
  "{{valor_total}}",
  "{{data}}",
  "{{validade}}",
  "{{vendedor_nome}}",
  "{{forma_pagamento}}",
];

const ORDEM: BlocoTipo[] = ["CAPA", "APRESENTACAO", "ORCAMENTO", "FECHAMENTO", "CONTRATO"];

/** Texto jurídico exibido no rodapé de todas as páginas da proposta. */
export const BASE_LEGAL =
  "Documento apto a aceite e assinatura eletrônica, com validade jurídica nos termos do art. 10, § 2º, da MP nº 2.200-2/2001 e da Lei nº 14.063/2020.";

const PADRAO: Record<BlocoTipo, Omit<Bloco, "tipo">> = {
  CAPA: {
    ativo: true,
    titulo: "Proposta Executiva",
    conteudo: "Preparada exclusivamente para {{cliente_nome}}",
  },
  APRESENTACAO: {
    ativo: true,
    titulo: "Diagnóstico e escopo recomendado",
    conteudo:
      "O que identificamos\nResumo das necessidades e riscos levantados com {{cliente_nome}}.\n\nO que vamos entregar\n• Pilar 1 — descreva o resultado esperado\n• Pilar 2 — descreva o resultado esperado\n• Pilar 3 — descreva o resultado esperado\n\nPor que a {{empresa_nome}}\nExperiência comprovada, equipe própria e garantias por contrato.",
  },
  ORCAMENTO: { ativo: true, titulo: "Investimento", conteudo: "" },
  FECHAMENTO: {
    ativo: true,
    titulo: "Cronograma, garantia e próximos passos",
    conteudo:
      "Cronograma de implantação\nSemana 1 — Levantamento e laudo técnico\nSemana 2 — Cadastros e configuração\nSemana 3 — Implantação e capacitação\nSemana 4 — Homologação e entrega oficial\n\nGarantia\nSe algo não entregar o prometido, ajustamos sem custo.\n\nPróximos passos\n1. Aprove e assine eletronicamente esta proposta.\n2. Agendamos o início da implantação.\n\nProposta válida até {{validade}}. Forma de pagamento: {{forma_pagamento}}.",
  },

  CONTRATO: {
    ativo: false,
    titulo: "Contrato de prestação de serviços",
    conteudo:
      "CONTRATANTE: {{cliente_nome}}, inscrito sob {{cliente_documento}}.\nCONTRATADA: {{empresa_nome}}, inscrita sob {{empresa_documento}}.\n\nCláusula 1ª — Objeto: fornecimento dos itens e serviços descritos na proposta nº {{numero}}.\nCláusula 2ª — Valor: {{valor_total}}, pago conforme {{forma_pagamento}}.\nCláusula 3ª — Garantia: conforme seção de prazos e garantia desta proposta.\nCláusula 4ª — Foro: fica eleito o foro da comarca da CONTRATADA.",
  },
};

/** Normaliza o JSON salvo, completando blocos ausentes na ordem padrão. */
export function blocosDe(valor: unknown): Bloco[] {
  let arr: unknown = valor;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }
  const salvos = Array.isArray(arr) ? (arr as Partial<Bloco>[]) : [];
  const out: Bloco[] = [];
  for (const s of salvos) {
    if (s && ORDEM.includes(s.tipo as BlocoTipo) && !out.some((b) => b.tipo === s.tipo)) {
      const p = PADRAO[s.tipo as BlocoTipo];
      out.push({
        tipo: s.tipo as BlocoTipo,
        ativo: s.ativo ?? p.ativo,
        titulo: s.titulo ?? p.titulo,
        conteudo: s.conteudo ?? p.conteudo,
      });
    }
  }
  for (const t of ORDEM) if (!out.some((b) => b.tipo === t)) out.push({ tipo: t, ...PADRAO[t] });
  return out;
}

const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "null" || s === "undefined" ? "" : s;
};

export type Contexto = {
  orcamento: Row;
  empresa?: Row | null | undefined;
  cliente?: Row | null | undefined;
  vendedor?: Row | null | undefined;
};

export function aplicarTags(texto: string, c: Contexto): string {
  const o = c.orcamento;
  const mapa: Record<string, string> = {
    cliente_nome: txt(pick(c.cliente ?? {}, ["razao_social", "nome_fantasia", "nome"])) || "Cliente",
    cliente_documento: txt(pick(c.cliente ?? {}, ["documento", "cnpj_cpf", "cpf", "cnpj"])) || "—",
    empresa_nome:
      txt(pick(c.empresa ?? {}, ["nome_fantasia", "nome", "razao_social", "titulo"])) || "Empresa",
    empresa_documento: txt(pick(c.empresa ?? {}, ["cnpj_cpf", "cnpj", "documento"])) || "—",
    numero: txt(o["numero"]),
    valor_total: formatBRL(num(o["total_liquido"])),
    data: formatDate(o["dt_orcamento"]),
    validade: formatDate(o["validade_orcamento"]),
    vendedor_nome: txt(pick(c.vendedor ?? {}, ["nome", "email"])),
    forma_pagamento: txt(o["forma_pagamento"]) || "condições acordadas",
  };
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => mapa[k] ?? m);
}

export async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const linkProposta = (token: unknown) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/proposta/${String(token ?? "")}`;

/** Imprime somente o elemento indicado (A4 retrato, quebras por bloco). */
export function imprimirElemento(id: string) {
  const src = document.getElementById(id);
  if (!src) return;
  const host = document.createElement("div");
  host.className = "orc-print-host";
  host.style.display = "none";
  host.appendChild(src.cloneNode(true));
  document.body.appendChild(host);
  document.documentElement.classList.add("orc-printing");
  const limpar = () => {
    document.documentElement.classList.remove("orc-printing");
    host.remove();
    window.removeEventListener("afterprint", limpar);
  };
  window.addEventListener("afterprint", limpar);
  setTimeout(() => window.print(), 80);
}
