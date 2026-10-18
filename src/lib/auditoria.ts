export type AuditoriaLog = {
  id: string;
  empresa_id: string | null;
  tabela: string;
  registro_id: string | null;
  operacao: "INSERT" | "UPDATE" | "DELETE";
  usuario_id: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  dados_anteriores: Record<string, unknown> | null;
  dados_novos: Record<string, unknown> | null;
  campos_alterados: Record<string, { de: unknown; para: unknown }> | null;
  ip: string | null;
  user_agent: string | null;
  criado_em: string;
};

export const OPERACAO_LABEL: Record<AuditoriaLog["operacao"], string> = {
  INSERT: "Criou",
  UPDATE: "Alterou",
  DELETE: "Excluiu",
};

const TABELAS: Record<string, string> = {
  pessoas: "Pessoas", parceiros: "Parceiros", usuarios: "Usuários", itens: "Itens",
  orcamentos: "Ofertas", orcamento_itens: "Itens da oferta", financeiro_titulos: "Financeiro",
  projetos: "Projetos", projetos_tarefas: "Tarefas", projetos_atividades: "Atividades",
  atendimentos: "Atendimentos", atendimentos_mensagem: "Mensagens", veiculos: "Veículos",
  funcoes: "Funções", perfil: "Perfis", menu: "Permissões", empresas: "Empresas",
  despesas_lancamentos: "Reembolsos", estoque_movimentacoes: "Estoque", cotacoes: "Cotações",
  manutencao_os: "Ordens de serviço", laudos_tecnicos: "Laudos",
};

export const nomeTabela = (t: string) =>
  TABELAS[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Campos técnicos que não interessam ao leitor. */
const OCULTOS = new Set(["created_at", "updated_at", "criado_por", "alterado_por", "dt_criacao", "dt_alteracao", "criado_em", "atualizado_em"]);

export function camposVisiveis(diff: AuditoriaLog["campos_alterados"]) {
  return Object.entries(diff ?? {}).filter(([k]) => !OCULTOS.has(k));
}

export function valorTexto(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Resumo de uma linha: "Alterou status, telefone". */
export function resumoLog(l: AuditoriaLog): string {
  if (l.operacao !== "UPDATE") return OPERACAO_LABEL[l.operacao];
  const campos = camposVisiveis(l.campos_alterados).map(([k]) => k.replace(/_/g, " "));
  return campos.length ? `Alterou ${campos.join(", ")}` : "Alterou";
}

/** CSV com BOM e separador ";" (abre direto no Excel pt-BR). */
export function auditoriaCsv(logs: AuditoriaLog[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["Data/hora", "Usuário", "E-mail", "Módulo", "Registro", "Ação", "Campos alterados", "IP"];
  const linhas = logs.map((l) => [
    new Date(l.criado_em).toLocaleString("pt-BR"),
    l.usuario_nome ?? "Sistema",
    l.usuario_email ?? "",
    nomeTabela(l.tabela),
    l.registro_id ?? "",
    OPERACAO_LABEL[l.operacao],
    camposVisiveis(l.campos_alterados).map(([k, d]) => `${k}: ${valorTexto(d.de)} → ${valorTexto(d.para)}`).join(" | "),
    l.ip ?? "",
  ].map((c) => esc(String(c))).join(";"));
  return "\uFEFF" + [head.join(";"), ...linhas].join("\r\n");
}
