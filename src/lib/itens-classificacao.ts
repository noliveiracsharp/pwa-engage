/**
 * Classificação automática de itens pela Categoria.
 * Cada categoria aponta para códigos (não IDs) de Centro de Custo e Plano de Contas,
 * resolvidos depois nas tabelas da empresa ativa — assim vale para qualquer empresa_id.
 */
export type RegraCategoria = { centro: string; conta: string };

export const REGRAS_CATEGORIA: Record<string, RegraCategoria> = {
  "Automação & Motores": { centro: "2.1", conta: "1.1.03" },
  "Controle de Acesso & Portaria": { centro: "2.1", conta: "1.1.03" },
  "Ferramentas, Insumos & EPIs": { centro: "3.2", conta: "1.1.03" },
  "Licenças & Software": { centro: "1.1", conta: "1.1.01" },
  "Limpeza & Conservação": { centro: "3.2", conta: "1.1.03" },
  "Material Elétrico & Iluminação": { centro: "3.2", conta: "1.1.03" },
  "Material Hidráulico & Predial": { centro: "3.2", conta: "1.1.03" },
  "Móveis & Utensílios": { centro: "3.1", conta: "1.1.03" },
  "Papelaria & Escritório": { centro: "3.2", conta: "1.1.03" },
  "Prevenção e Combate a Incêndio": { centro: "2.1", conta: "1.1.03" },
  "Redes & Telecom": { centro: "2.1", conta: "1.1.03" },
  "Segurança Eletrônica & CFTV": { centro: "2.1", conta: "1.1.03" },
  "Serviços de Mão de Obra Avulsa": { centro: "2.2", conta: "1.1.02" },
  "Serviços Recorrentes (Mensais)": { centro: "1.2", conta: "1.1.01" },
};

/** Padrão fiscal de saída para revenda no Simples Nacional. */
export const FISCAL_PRODUTO = { cfop_padrao: "5102", csosn_cst: "102", origem: "0" };

type Ref = { id: string; codigo: string };
type Item = Record<string, unknown>;

const vazio = (x: unknown) => x === null || x === undefined || String(x).trim() === "";

/**
 * Valores sugeridos para o item. `sobrescrever=false` só preenche campos vazios.
 * Retorna apenas os campos que mudam (objeto vazio = nada a fazer).
 */
export function classificarItem(item: Item, centros: Ref[], contas: Ref[], sobrescrever = false): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (campo: string, valor: string | undefined) => {
    if (!valor) return;
    if ((sobrescrever || vazio(item[campo])) && String(item[campo] ?? "") !== valor) out[campo] = valor;
  };
  const regra = REGRAS_CATEGORIA[String(item["categoria"] ?? "")];
  if (regra) {
    set("centro_custo_id", centros.find((c) => c.codigo === regra.centro)?.id);
    set("plano_contas_id", contas.find((c) => c.codigo === regra.conta)?.id);
  }
  const produto = !String(item["tipo"] ?? "Produto").startsWith("Serviço");
  if (produto) for (const [k, v] of Object.entries(FISCAL_PRODUTO)) set(k, v);
  return out;
}
