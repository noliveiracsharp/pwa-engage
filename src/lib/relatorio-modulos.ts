/** Módulos do ERP para o gerador de relatórios por IA: tabelas que a IA pode usar e dicas de como ligá-las. */
export type ModuloRelatorio = { id: string; nome: string; tabelas: string[]; dica: string };

export const MODULOS_RELATORIO: ModuloRelatorio[] = [
  {
    id: "atendimentos", nome: "Atendimentos",
    tabelas: ["atendimentos", "atendimentos_mensagem", "kanban_etapas", "kanban_nome", "parceiros", "usuarios"],
    dica: "Atendimentos/chamados ficam em atendimentos (protocolo, situação, avaliação, datas); mensagens em atendimentos_mensagem; etapa em kanban_etapas.",
  },
  {
    id: "compras", nome: "Compras",
    tabelas: ["cotacoes", "cotacoes_itens", "cotacoes_fornecedores", "cotacoes_precos", "pedidos_compra", "itens", "parceiros"],
    dica: "Cotações em cotacoes (itens em cotacoes_itens, preços por fornecedor em cotacoes_precos); pedidos em pedidos_compra; fornecedor em parceiros.",
  },
  {
    id: "estoque", nome: "Estoque",
    tabelas: ["estoque_movimentacoes", "estoque_locais", "itens"],
    dica: "Movimentos em estoque_movimentacoes (item_id → itens, dt_movimento, quantidade, tipo); locais em estoque_locais.",
  },
  {
    id: "financeiro", nome: "Financeiro",
    tabelas: ["financeiro_titulos", "financeiro_titulos_itens", "financeiro_contas_bancarias", "plano_contas", "centro_custo", "parceiros", "despesas_cartoes"],
    dica: "Contas a pagar/receber em financeiro_titulos (tipo, valor, valor_pago, vencimento, pago_em, parceiro_id → parceiros, plano de contas, centro de custo); rateio em financeiro_titulos_itens.",
  },
  {
    id: "frota", nome: "Frota",
    tabelas: ["veiculos", "veiculos_diario", "usuarios"],
    dica: "Veículos em veiculos; viagens/diário de bordo em veiculos_diario (km_inicial, km_final, km_total, saida_em, chegada_em, condutor).",
  },
  {
    id: "manutencoes", nome: "Manutenções",
    tabelas: ["manutencao_os", "manutencao_planos", "manutencao_modelos", "parceiros", "itens", "usuarios"],
    dica: "Ordens de serviço em manutencao_os (situação, data_prevista, prazo_sla, técnico, parceiro_id → parceiros); preventivas em manutencao_planos.",
  },
  {
    id: "notas", nome: "Notas fiscais",
    tabelas: ["notas_fiscais", "orcamentos", "parceiros"],
    dica: "Notas em notas_fiscais (tipo, número, valor, orcamento_id, parceiro_id).",
  },
  {
    id: "ofertas", nome: "Ofertas",
    tabelas: ["orcamentos", "orcamento_itens", "itens", "parceiros", "usuarios", "kanban_etapas"],
    dica: "Ofertas em orcamentos (número, situação, valores, vendedor, cliente). Para itens/produtos/serviços oferecidos use orcamento_itens (natureza produto/servico, quantidade, valor_unitario, item_id → itens).",
  },
  {
    id: "pessoas", nome: "Clientes e fornecedores",
    tabelas: ["parceiros", "pessoas"],
    dica: "Clientes e fornecedores em parceiros (is_cliente, is_fornecedor, razao_social, nome_fantasia, cidade, situacao_cadastral).",
  },
  {
    id: "itens", nome: "Produtos e Serviços",
    tabelas: ["itens", "itens_categorias", "itens_marcas"],
    dica: "Cadastro em itens (natureza, preco_custo, preco_venda, margem_lucro, estoque); categorias em itens_categorias; marcas em itens_marcas.",
  },
  {
    id: "projetos", nome: "Projetos",
    tabelas: ["projetos", "projetos_status", "projetos_tarefas", "projetos_atividades", "projetos_espacos", "parceiros", "usuarios"],
    dica: "Projetos em projetos; o status é status_id → projetos_status (nome em descricao, tipo em tipo: a_fazer, progresso, concluido, erro). " +
      "Para 'projetos com status X' use tabela_base projetos, relação projetos_status(descricao,tipo) e filtre pelo nome do status com o campo 'projetos_status.descricao' ilike, ou pelo tipo com 'projetos_status.tipo'. Tarefas em projetos_tarefas.",
  },
];

export const ordenarModulos = (m: ModuloRelatorio[]) => [...m].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

/** Tabelas para o catálogo: as do módulo escolhido, ou de todos quando nenhum foi escolhido. */
export function tabelasDoModulo(id: string | null | undefined, extras: string[] = []): string[] {
  const m = MODULOS_RELATORIO.find((x) => x.id === id);
  const base = m ? m.tabelas : MODULOS_RELATORIO.flatMap((x) => x.tabelas);
  return [...new Set([...base, ...(m ? [] : extras)])];
}

export const dicaDoModulo = (id: string | null | undefined) => MODULOS_RELATORIO.find((x) => x.id === id);
