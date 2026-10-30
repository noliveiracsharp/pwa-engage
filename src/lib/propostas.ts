import DOMPurify from "dompurify";
import { formatBRL, formatDate, modalidadeLabel, modalidadeOf, naturezaOf, num, textoDetalhe } from "@/lib/orcamentos";
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
  /** Anexos do contrato marcados pelo vendedor (ausente = todos). */
  anexos?: AnexoContrato[];
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
    ativo: true,
    titulo: "Contrato de prestação de serviços",
    conteudo:
      "CONTRATANTE: {{cliente_nome}}, inscrito sob {{cliente_documento}}.\nCONTRATADA: {{empresa_nome}}, inscrita sob {{empresa_documento}}.\n\nCláusula 1ª — Objeto: fornecimento dos itens e serviços descritos na proposta nº {{numero}}.\nCláusula 2ª — Valor: {{valor_total}}, pago conforme {{forma_pagamento}}.\nCláusula 3ª — Garantia: conforme seção de prazos e garantia desta proposta.\nCláusula 4ª — Foro: fica eleito o foro da comarca da CONTRATADA.",
  },
};

/** Normaliza o JSON salvo, completando blocos ausentes na ordem padrão. */
/** Contrato ainda no texto antigo/vazio: deve receber o modelo guarda-chuva padrão. */
export const contratoPadraoPendente = (b: Bloco) =>
  b.tipo === "CONTRATO" && (!b.conteudo.trim() || b.conteudo.startsWith("CONTRATANTE: {{cliente_nome}}"));

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
        ...(Array.isArray(s.anexos) ? { anexos: s.anexos } : {}),
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

export type AnexoContrato = "A" | "B" | "C" | "D";
export const ANEXOS_CONTRATO: Array<{ id: AnexoContrato; label: string; descricao: string }> = [
  { id: "A", label: "Anexo A — Licença de software (SaaS)", descricao: "Licença de uso, nuvem, SLA 98% e suporte do aplicativo" },
  { id: "B", label: "Anexo B — Manutenção física e SLA", descricao: "Preventiva/corretiva, tabela de atendimento e exclusões" },
  { id: "C", label: "Anexo C — Comodato de equipamentos", descricao: "Cessão gratuita, guarda, devolução e taxa de instalação" },
  { id: "D", label: "Anexo D — Venda com reserva de domínio", descricao: "Garantias e propriedade só após a quitação" },
];
export const ANEXOS_PADRAO: AnexoContrato[] = ["A", "B", "C", "D"];

export type SecaoContrato = "geral" | AnexoContrato;
/** Textos personalizados por empresa (Documentos → Contrato da Oferta). Ausente = padrão. */
export type ModelosContrato = Partial<Record<SecaoContrato, string>>;
export const SECOES_CONTRATO: Array<{ id: SecaoContrato; label: string }> = [
  { id: "geral", label: "Condições gerais" },
  ...ANEXOS_CONTRATO.map((a) => ({ id: a.id as SecaoContrato, label: a.label })),
];
/** Variáveis exclusivas do contrato da Oferta (além das tags comuns). */
export const TAGS_CONTRATO = ["{{vigencia_meses}}", "{{reajuste_indice}}", "{{lista_equipamentos}}"];

type VarsContrato = { mesesTxt: string; reajuste: string; listaEquip: string; isenta: boolean; temTaxa: boolean; recorrentes: boolean };

function secoesPadrao(v: VarsContrato): Record<SecaoContrato, string> {
  const { mesesTxt, reajuste, listaEquip, isenta, temTaxa } = v;
  const recorrentes = { length: v.recorrentes ? 1 : 0 };
  return {
    geral: `<h2>Condições gerais de prestação de serviços e tecnologia</h2>
<p>Este instrumento único reúne as regras comuns da relação entre as partes. Os serviços efetivamente contratados são definidos pela oferta {{numero}} e pelos anexos abaixo, que dela fazem parte integrante.</p>
<h3>1. Partes e objeto</h3>
<p><strong>CONTRATADA:</strong> {{empresa_nome}}, inscrita sob o n.º {{empresa_documento}}.<br><strong>CONTRATANTE:</strong> {{cliente_nome}}, inscrito sob o n.º {{cliente_documento}}.</p>
<p>1.1. Objeto: fornecimento dos serviços, licenças e equipamentos descritos na oferta {{numero}}, nos termos dos anexos vinculados.</p>
<h3>2. Vigência e rescisão</h3>
<p>2.1. Prazo de ${mesesTxt} meses a partir da ativação dos serviços, renovável automaticamente por iguais períodos.</p>
<p>2.2. Qualquer parte pode rescindir mediante aviso prévio escrito de 30 (trinta) dias.</p>
<p>2.3. A rescisão antecipada imotivada pelo CONTRATANTE gera multa de 20% (vinte por cento) sobre as mensalidades restantes até o fim da vigência.</p>
${isenta ? `<p>2.4. A taxa de instalação de {{taxa_instalacao}} foi isentada mediante permanência mínima de ${mesesTxt} meses; havendo rescisão antecipada, será cobrada integralmente e corrigida.</p>` : ""}
<h3>3. Condições financeiras</h3>
<p>3.1. Implantação na modalidade <strong>{{modalidade}}</strong>, no valor de {{valor_total}}, conforme {{forma_pagamento}}.</p>
${recorrentes.length ? `<p>3.2. Mensalidade dos serviços recorrentes: <strong>{{mensalidade}}</strong>.</p>` : ""}
<p>3.3. Reajuste anual a cada 12 (doze) meses pela variação do ${reajuste}.</p>
<p>3.4. Atrasos sujeitam o CONTRATANTE a multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês.</p>
<p>3.5. Inadimplência superior a 10 (dez) dias permite à CONTRATADA suspender serviços e acessos, mediante aviso prévio, até a regularização.</p>
<h3>4. Proteção de dados (LGPD) e confidencialidade</h3>
<p>4.1. As partes tratarão os dados pessoais de moradores, colaboradores e visitantes conforme a Lei n.º 13.709/2018, exclusivamente para a execução deste contrato.</p>
<p>4.2. Informações técnicas, senhas e dados de acesso são confidenciais durante a vigência e por 2 (dois) anos após o término.</p>
<h3>5. Disposições gerais e foro</h3>
<p>5.1. Não há vínculo trabalhista ou societário entre as partes.</p>
<p>5.2. Este contrato pode ser assinado eletronicamente, com plena validade jurídica.</p>
<p>5.3. Fica eleito o foro da comarca da sede da CONTRATADA para dirimir quaisquer litígios.</p>`,
    A: `<h3>Anexo A — Licença de software (SaaS)</h3>
<ul><li>Licença de uso do sistema (web e aplicativo), não exclusiva e intransferível, durante a vigência.</li>
<li>Disponibilidade mínima de 98% ao mês, salvo manutenções programadas, força maior ou falhas de internet do CONTRATANTE.</li>
<li>Atualizações e melhorias incluídas; suporte técnico da plataforma em horário comercial.</li>
<li>Guarda de senhas e cadastro de usuários são de responsabilidade do CONTRATANTE.</li>
<li>Toda propriedade intelectual do software pertence à CONTRATADA.</li></ul>`,
    B: `<h3>Anexo B — Manutenção física e nível de serviço</h3>
<p>B.1. Manutenção preventiva e corretiva dos equipamentos e sistemas indicados na oferta (ex.: portões automáticos, CFTV, controle de acesso).</p>
<table><thead><tr><th>Prioridade</th><th>Exemplo</th><th>Atendimento</th></tr></thead><tbody>
<tr><td><strong>Crítica</strong></td><td>Portão travado, sistema de acesso parado</td><td>até 4 horas</td></tr>
<tr><td><strong>Alta</strong></td><td>Câmera ou gravação com falha parcial</td><td>até 24 horas</td></tr>
<tr><td><strong>Normal</strong></td><td>Ajustes, dúvidas e melhorias</td><td>até 72 horas úteis</td></tr>
<tr><td><strong>Preventiva</strong></td><td>Revisão programada</td><td>conforme agenda</td></tr></tbody></table>
<p>B.2. <strong>Não cobertos:</strong> vandalismo, descargas atmosféricas e picos de energia, mau uso, obras civis, pragas e intervenção de terceiros — orçados à parte.</p>
<p>B.3. Peças substituídas fora da garantia serão orçadas previamente ao CONTRATANTE.</p>`,
    C: `<h3>Anexo C — Comodato de equipamentos</h3>
<p>C.1. A CONTRATADA empresta gratuitamente ao CONTRATANTE, durante a vigência, os equipamentos abaixo:</p>
${listaEquip}
<ul><li>Os bens continuam de propriedade da CONTRATADA.</li>
<li>O CONTRATANTE deve guardá-los e conservá-los, sendo proibido vender, ceder ou retirá-los do local.</li>
<li>Ao término, os equipamentos serão devolvidos em bom estado, sob pena de indenização pelo valor de reposição.</li>
${temTaxa ? `<li>Taxa de instalação: {{taxa_instalacao}}${isenta ? `, isenta se cumprida a permanência de ${mesesTxt} meses` : ""}.</li>` : ""}</ul>`,
    D: `<h3>Anexo D — Venda de equipamentos com reserva de domínio</h3>
<ul><li>Venda e instalação dos equipamentos detalhados na oferta {{numero}}.</li>
<li>Garantia de 90 (noventa) dias da instalação e garantia do fabricante para os equipamentos (mínimo 12 meses).</li>
<li>Reserva de domínio (art. 521 do Código Civil): a propriedade só passa ao CONTRATANTE após a quitação integral.</li>
<li>Inadimplência superior a 30 (trinta) dias autoriza a CONTRATADA a retomar os equipamentos.</li></ul>`,
  };
}

/** Texto padrão de cada seção, com variáveis no lugar dos valores (para edição). */
export function modeloPadraoContrato(secao: SecaoContrato): string {
  return secoesPadrao({
    mesesTxt: "{{vigencia_meses}}", reajuste: "{{reajuste_indice}}", listaEquip: "{{lista_equipamentos}}",
    isenta: false, temTaxa: true, recorrentes: true,
  })[secao];
}

/**
 * Contrato guarda-chuva: condições gerais fixas + anexos marcados pelo vendedor
 * (todos por padrão). Cada seção pode ser substituída pelo modelo da empresa.
 */
export function gerarContratoModular(
  c: Contexto & { linhas: Row[]; itens: Row[]; anexos?: AnexoContrato[]; reindexar?: boolean; modelos?: ModelosContrato | null | undefined },
): string {
  const o = c.orcamento;
  const anexos = c.anexos ?? ANEXOS_PADRAO;
  const itemById = new Map(c.itens.map((i) => [String(i["id"] ?? ""), i]));
  const nomeItem = (l: Row) => {
    const it = itemById.get(String(l["item_id"] ?? ""));
    return [txt(it?.["descricao"]), textoDetalhe(l["detalhe"])].filter(Boolean).join(" — ") || "Item";
  };
  const nat = (l: Row) => naturezaOf(l["natureza"], itemById.get(String(l["item_id"] ?? ""))?.["tipo"]);
  const recorrentes = c.linhas.filter((l) => nat(l) === "recorrente");
  const produtos = c.linhas.filter((l) => nat(l) === "produto");
  const meses = num(o["vigencia_meses"]) || 36;
  const reajuste = txt(o["reajuste_indice"]) || "IPCA";
  const extenso = por(meses);
  const mesesTxt = extenso ? `${meses} (${extenso})` : String(meses);
  const temTaxa = num(o["taxa_instalacao"]) > 0;
  const isenta = o["taxa_instalacao_isenta"] === true && temTaxa;
  const listaEquip = produtos.length
    ? `<table><thead><tr><th>Equipamento</th><th>Qtd.</th></tr></thead><tbody>${produtos
        .map((l) => `<tr><td>${escapar(nomeItem(l))}</td><td>${escapar(String(l["quantidade"] ?? "1"))}</td></tr>`)
        .join("")}</tbody></table>`
    : "<p>Conforme relação de equipamentos da oferta {{numero}}.</p>";

  const padrao = secoesPadrao({ mesesTxt, reajuste, listaEquip, isenta, temTaxa, recorrentes: recorrentes.length > 0 });
  const secao = (s: SecaoContrato) => {
    const custom = c.modelos?.[s]?.trim();
    if (!custom) return padrao[s];
    return custom
      .replace(/\{\{\s*vigencia_meses\s*\}\}/g, mesesTxt)
      .replace(/\{\{\s*reajuste_indice\s*\}\}/g, reajuste)
      .replace(/\{\{\s*lista_equipamentos\s*\}\}/g, listaEquip);
  };
  const partes: string[] = [secao("geral")];
  for (const L of ANEXOS_PADRAO) if (anexos.includes(L)) partes.push(secao(L));

  if (c.reindexar) {
    const romanos = ["I", "II", "III", "IV"];
    let n = 0;
    for (let i = 1; i < partes.length; i++) {
      const m = /Anexo ([A-D]) —/.exec(partes[i]!);
      if (!m) continue;
      const L = m[1]!;
      const R = romanos[n++]!;
      partes[i] = partes[i]!.replace(`Anexo ${L} —`, `Anexo ${R} —`).replace(new RegExp(`\\b${L}\\.(\\d)`, "g"), `${R}.$1`);
    }
  }
  return partes.join("\n");
}

/** Letras de anexos ↔ parâmetro curto de URL (ex.: "BC"). */
export const anexosDeParam = (s: unknown): AnexoContrato[] =>
  ANEXOS_PADRAO.filter((a) => String(s ?? "").toUpperCase().includes(a));

export const linkMinuta = (token: unknown, anexos: AnexoContrato[]) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/minuta/${String(token ?? "")}?a=${anexos.join("")}`;

/** Título curto do anexo sem a letra (para mensagens). */
export const nomeAnexo = (a: AnexoContrato) =>
  (ANEXOS_CONTRATO.find((x) => x.id === a)?.label ?? "").replace(/^Anexo [A-D] — /, "");
