import DOMPurify from "dompurify";
import { formatBRL, formatDate, modalidadeLabel, modalidadeOf, naturezaOf, num } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";

export type BlocoTipo = "CAPA" | "APRESENTACAO" | "ORCAMENTO" | "FECHAMENTO" | "CONTRATO";

export type CampoRodape = { rotulo: string; valor: string; ativo: boolean };

/** Aparência personalizável da capa (opcional; ausente = visual padrão). */
export type EstiloCapa = {
  fundo?: string; // preset (chave de FUNDOS_CAPA) ou cor hex
  texto?: "claro" | "escuro";
  destaque?: string; // cor hex usada nos títulos das páginas internas
  logo?: "esquerda" | "centro" | "direita" | "oculto";
  alinhamento?: "esquerda" | "centro";
  etiqueta?: string;
  tamanhoTitulo?: number;
  rodape?: CampoRodape[];
};

export type Bloco = {
  tipo: BlocoTipo;
  ativo: boolean;
  titulo: string;
  conteudo: string;
  estilo?: EstiloCapa;
};

export const FUNDOS_CAPA: Record<string, { nome: string; css: string; texto: "claro" | "escuro" }> = {
  azul: { nome: "Azul", css: "linear-gradient(160deg, #0b2545 0%, #13426f 60%, #0ea5e9 140%)", texto: "claro" },
  grafite: { nome: "Grafite", css: "linear-gradient(160deg, #0f1115 0%, #262a33 70%, #3b4252 130%)", texto: "claro" },
  verde: { nome: "Verde", css: "linear-gradient(160deg, #052e1f 0%, #0f5132 60%, #22c55e 150%)", texto: "claro" },
  vinho: { nome: "Vinho", css: "linear-gradient(160deg, #2a0a12 0%, #5c1426 60%, #e11d48 150%)", texto: "claro" },
  claro: { nome: "Claro", css: "linear-gradient(160deg, #ffffff 0%, #f1f5f9 100%)", texto: "escuro" },
};

export const RODAPE_PADRAO: CampoRodape[] = [
  { rotulo: "Emissão", valor: "{{data}}", ativo: true },
  { rotulo: "Válida até", valor: "{{validade}}", ativo: true },
  { rotulo: "Consultor", valor: "{{vendedor_nome}}", ativo: true },
];

export function estiloCapa(e?: EstiloCapa) {
  const fundoKey = e?.fundo ?? "azul";
  const preset = FUNDOS_CAPA[fundoKey];
  const fundo = preset ? preset.css : fundoKey;
  const texto = e?.texto ?? preset?.texto ?? "claro";
  return {
    fundo,
    texto,
    destaque: e?.destaque || "#0ea5e9",
    logo: e?.logo ?? "esquerda",
    alinhamento: e?.alinhamento ?? "esquerda",
    etiqueta: e?.etiqueta ?? "Proposta {{numero}}",
    tamanhoTitulo: e?.tamanhoTitulo ?? 40,
    rodape: e?.rodape ?? RODAPE_PADRAO,
  };
}

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
  "{{modalidade}}",
  "{{mensalidade}}",
  "{{vigencia}}",
  "{{taxa_instalacao}}",
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
        ...(s.estilo && typeof s.estilo === "object" ? { estilo: s.estilo } : {}),
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
    modalidade: modalidadeLabel(o["modalidade"]),
    mensalidade: formatBRL(num(o["total_recorrente"])),
    vigencia: `${num(o["vigencia_meses"]) || 36} meses`,
    taxa_instalacao: formatBRL(num(o["taxa_instalacao"])),
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

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Indica se o conteúdo salvo já é HTML (blocos antigos eram texto puro). */
export const ehHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

/** Converte texto puro legado em parágrafos HTML; HTML passa direto. */
export function paraHtml(s: string): string {
  if (!s) return "";
  if (ehHtml(s)) return s;
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Remove scripts/eventos do HTML antes de exibir (o link público é aberto por terceiros). */
export function htmlSeguro(html: string): string {
  if (typeof window === "undefined" || typeof DOMPurify.sanitize !== "function") return "";
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "form", "input", "script", "iframe"] });
}

/* ------------------------------------------------------------------ */
/* Contrato modular: condições gerais + anexos conforme a oferta       */
/* ------------------------------------------------------------------ */

const por = (n: number) =>
  ({ 12: "doze", 24: "vinte e quatro", 36: "trinta e seis", 48: "quarenta e oito", 60: "sessenta" })[n];

/**
 * Monta o contrato em HTML injetando somente os anexos aplicáveis:
 *  A (licença de software) e B (manutenção) pelos serviços recorrentes,
 *  C (comodato) pela modalidade, D (venda com reserva de domínio) quando há produtos vendidos.
 * O texto resultante continua editável no editor da proposta.
 */
export function gerarContratoModular(c: Contexto & { linhas: Row[]; itens: Row[] }): string {
  const o = c.orcamento;
  const itemById = new Map(c.itens.map((i) => [String(i["id"] ?? ""), i]));
  const desc = (l: Row) => {
    const it = itemById.get(String(l["item_id"] ?? ""));
    return { it, nome: `${txt(it?.["descricao"])} ${txt(l["detalhe"])}`.toLowerCase() };
  };
  const nat = (l: Row) => naturezaOf(l["natureza"], desc(l).it?.["tipo"]);
  const recorrentes = c.linhas.filter((l) => nat(l) === "recorrente");
  const produtos = c.linhas.filter((l) => nat(l) === "produto");
  const modalidade = modalidadeOf(o["modalidade"]);
  const meses = num(o["vigencia_meses"]) || 36;
  const reajuste = txt(o["reajuste_indice"]) || "IPCA";
  const extenso = por(meses);
  const mesesTxt = extenso ? `${meses} (${extenso})` : String(meses);

  const ehSoftware = (l: Row) => /licen|software|app|saas|sistema|plataforma|shield/.test(desc(l).nome);
  const ehManut = (l: Row) => /manuten|blindagem|suporte|preventiv|corretiv/.test(desc(l).nome);
  let anexoA = recorrentes.some(ehSoftware);
  let anexoB = recorrentes.some(ehManut);
  if (recorrentes.length && !anexoA && !anexoB) anexoA = anexoB = true;
  const anexoC = modalidade === "comodato";
  const anexoD = !anexoC && produtos.length > 0;
  const isenta = o["taxa_instalacao_isenta"] === true && num(o["taxa_instalacao"]) > 0;

  const partes: string[] = [];
  partes.push(`<h2>Condições gerais de prestação de serviços e tecnologia</h2>
<h3>1. Partes</h3>
<p><strong>CONTRATADA:</strong> {{empresa_nome}}, inscrita sob o n.º {{empresa_documento}}.<br><strong>CONTRATANTE:</strong> {{cliente_nome}}, inscrito sob o n.º {{cliente_documento}}, identificado na oferta {{numero}}.</p>
<h3>2. Objeto do contrato</h3>
<p>O presente instrumento estabelece as condições gerais que regem a relação comercial entre as partes. Os serviços, licenças e equipamentos contratados estão detalhados na oferta {{numero}} e são regidos pelos anexos modulares vinculados a este documento.</p>
<h3>3. Vigência e rescisão</h3>
<p>3.1. O contrato tem duração de ${mesesTxt} meses, com início na data de ativação dos serviços, renovando-se automaticamente por períodos iguais e sucessivos.</p>
<p>3.2. Qualquer das partes poderá rescindir este contrato imotivadamente, mediante aviso prévio escrito de 30 (trinta) dias.</p>
${isenta ? `<p>3.3. A taxa de instalação, no valor de {{taxa_instalacao}}, foi isentada mediante permanência mínima de ${mesesTxt} meses. A rescisão antecipada por parte do CONTRATANTE implicará a cobrança integral e corrigida dessa taxa.</p>` : ""}
<h3>4. Condições financeiras e faturamento</h3>
<p>4.1. Implantação na modalidade <strong>{{modalidade}}</strong>, no valor de {{valor_total}}, conforme {{forma_pagamento}}.</p>
${recorrentes.length ? `<p>4.2. Mensalidade dos serviços recorrentes: <strong>{{mensalidade}}</strong>, reajustada a cada 12 (doze) meses pela variação do ${reajuste}.</p>` : ""}
<p>4.3. O atraso no pagamento sujeitará o CONTRATANTE a multa moratória de 2% (dois por cento) e juros de 1% (um por cento) ao mês.</p>
<p>4.4. A inadimplência superior a 10 (dez) dias corridos confere à CONTRATADA o direito de suspender os acessos e serviços de suporte, mediante notificação prévia, com reativação após a regularização.</p>
<h3>5. Confidencialidade e proteção de dados (LGPD)</h3>
<p>5.1. A CONTRATADA atua em conformidade com a Lei n.º 13.709/2018 (LGPD), garantindo a confidencialidade e a segurança no tratamento dos dados do CONTRATANTE, moradores e colaboradores.</p>
<p>5.2. As partes comprometem-se a utilizar os dados a que tenham acesso exclusivamente para a execução deste contrato.</p>
<h3>6. Disposições gerais e foro</h3>
<p>6.1. Este contrato não estabelece vínculo trabalhista ou societário entre as partes.</p>
<p>6.2. Elege-se o foro da Comarca de São Paulo/SP para dirimir eventuais litígios deste contrato.</p>`);

  if (anexoA)
    partes.push(`<h3>Anexo A — Licenciamento de software (SaaS)</h3>
<p>A.1. A CONTRATADA concede ao CONTRATANTE licença de uso do sistema (web e aplicativo), de caráter não exclusivo e intransferível. Todos os direitos de propriedade intelectual pertencem à CONTRATADA.</p>
<p>A.2. A CONTRATADA assegura disponibilidade (SLA) de 98% do sistema, salvo força maior ou falhas dos fornecedores de internet do CONTRATANTE.</p>
<p>A.3. A gestão de acessos, a guarda das credenciais e a inserção de dados são de responsabilidade exclusiva dos usuários.</p>`);
  if (anexoB)
    partes.push(`<h3>Anexo B — Manutenção preventiva e corretiva</h3>
<p>B.1. A CONTRATADA executará a manutenção preventiva e corretiva dos equipamentos e da infraestrutura indicados na oferta.</p>
<p>B.2. Exclusões: não estão cobertos danos por vandalismo, descargas atmosféricas, picos de tensão, pragas, mau uso, obras civis ou intervenções de terceiros, que serão objeto de oferta à parte.</p>
<p>B.3. Os tempos de resposta para emergências respeitarão a matriz de criticidade estipulada na proposta técnica.</p>`);
  if (anexoC)
    partes.push(`<h3>Anexo C — Comodato de equipamentos</h3>
<p>C.1. A CONTRATADA cede ao CONTRATANTE, a título de comodato, os equipamentos listados na oferta, destinados exclusivamente à operação do sistema contratado.</p>
<p>C.2. Os bens permanecem propriedade da CONTRATADA. O CONTRATANTE obriga-se a guardá-los e conservá-los, sendo proibida sua cessão, venda ou remoção para outro endereço.</p>
<p>C.3. Ao final do contrato, por qualquer motivo, o CONTRATANTE devolverá os equipamentos em estado normal de conservação, sob pena de indenização pelo valor de reposição.</p>`);
  if (anexoD)
    partes.push(`<h3>Anexo D — Venda de equipamentos e instalação</h3>
<p>D.1. Este anexo rege a venda e a instalação dos equipamentos detalhados na oferta.</p>
<p>D.2. Garantia: equipamentos novos possuem garantia de 12 (doze) meses contra defeitos de fabricação; a instalação possui garantia de 90 (noventa) dias.</p>
<p>D.3. Reserva de domínio: nos termos do art. 521 do Código Civil, a propriedade dos bens só será transferida ao CONTRATANTE após o pagamento integral. Em caso de inadimplência superior a 30 (trinta) dias, a CONTRATADA poderá reaver os equipamentos.</p>`);

  return partes.join("\n");
}
