import { useSyncExternalStore } from "react";

export type Idioma = "pt-BR" | "en-US" | "es-ES";
export const IDIOMAS: { id: Idioma; nome: string; sigla: string }[] = [
  { id: "en-US", nome: "English", sigla: "EN" },
  { id: "es-ES", nome: "Español", sigla: "ES" },
  { id: "pt-BR", nome: "Português (Brasil)", sigla: "PT" },
];
const CHAVE = "atendeai-idioma";

const pt = {
  "acao.salvar": "Salvar", "acao.cancelar": "Cancelar", "acao.excluir": "Excluir", "acao.novo": "Novo",
  "acao.editar": "Editar", "acao.visualizar": "Visualizar", "acao.clonar": "Clonar", "acao.exportar": "Exportar",
  "acao.fechar": "Fechar", "acao.voltar": "Voltar", "acao.buscar": "Buscar", "acao.sair": "Sair",
  "filtro.todos": "Todos", "filtro.semCategoria": "Sem categoria", "tabela.linhasPorPagina": "Linhas por página",
  "tabela.ordenarPor": "Ordenar por {campo}", "tabela.registros": "{n} registros encontrados",
  "tabela.nenhum": "Nenhum registro encontrado",
  "msg.sucesso": "Sucesso", "msg.erro": "Erro", "msg.confirmarExclusao": "Confirmar exclusão?",
  "msg.carregando": "Carregando...", "msg.vazio": "Nenhuma informação encontrada",
  "status.ativo": "Ativo", "status.inativo": "Inativo", "status.pendente": "Pendente",
  "status.aprovado": "Aprovado", "status.rejeitado": "Rejeitado", "status.cancelado": "Cancelado",
  "menu.meusDados": "Meus Dados", "menu.idioma": "Idioma",
  "acao.adicionar": "Adicionar",
  "acao.acoes": "Ações",
  "acao.salvando": "Salvando…",
  "acao.confirmar": "Confirmar",
  "acao.entendi": "Entendi",
  "acao.simContinuar": "Sim, continuar",
  "acao.selecione": "Selecione",
  "acao.limparSelecao": "Limpar seleção",
  "msg.aviso": "Aviso",
  "msg.nenhumResultado": "Nenhum resultado.",
  "msg.naoInformado": "Não informado",
  "msg.excluirRegistro": "Deseja realmente excluir este registro?",
  "tabela.anterior": "Anterior",
  "tabela.proxima": "Próxima",
  "tabela.de": "de",
  "tabela.selecionarPagina": "Selecionar página",
  "tabela.selecionarRegistro": "Selecionar registro",
  "form.dados": "Dados",
  "dash.bomDia": "Bom dia",
  "dash.boaTarde": "Boa tarde",
  "dash.boaNoite": "Boa noite",
  "dash.subtitulo": "Painéis das áreas que você acessa.",
  "dash.unidade": "Unidade",
  "dash.consolidado": "Consolidado (todas as unidades)",
  "dash.matriz": "Apenas matriz",
  "dash.filial": "Filial",
  "dash.mesAtual": "Mês atual",
  "dash.ultimos12": "Últimos 12 meses",
  "dash.meuTrabalho": "Meu trabalho",
  "dash.pendentesComigo": "Pendentes comigo",
  "dash.vencemHoje": "Vencem hoje",
  "dash.atrasadas": "Atrasadas",
  "dash.minhasTarefas": "Minhas tarefas e atividades",
  "dash.nadaPendente": "Nada pendente com você. 🎉",
  "dash.tarefa": "Tarefa",
  "dash.atividade": "Atividade",
  "dash.atualizacoes": "Atualizações para você",
  "dash.semAtualizacoes": "Sem atualizações recentes.",
  "dash.projetos": "Projetos",
  "dash.projetosAtivos": "Projetos ativos",
  "dash.prazoVencido": "Com prazo vencido",
  "dash.entregas7": "Entregas em 7 dias",
  "dash.concluidos": "Concluídos",
  "dash.compras": "Compras e cotações",
  "dash.cotacoesMinhas": "Cotações aguardando minha aprovação ({n})",
  "dash.revisar": "Revisar",
  "dash.comercial": "Comercial — Ofertas",
  "dash.vincularOfertas": "Vincule um Kanban à função Ofertas para ver as etapas aqui.",
  "dash.conversao": "Taxa de conversão",
  "dash.conversaoMarque": "Taxa de conversão (marque a etapa ganha)",
  "dash.ticket": "Ticket médio ganho",
  "dash.comissoes": "Minhas comissões a receber",
  "dash.semEtapa": "{n} oferta(s) sem etapa correspondente no Kanban.",
  "dash.atendimento": "Atendimento",
  "dash.vincularAtend": "Vincule um Kanban à função Atendimentos para ver as etapas aqui.",
  "dash.contatos": "Contatos",
  "dash.atendPorMes": "Atendimentos por mês",
  "cot.pendente": "Pendente",
  "cot.em_cotacao": "Em cotação",
  "cot.cotado": "Cotado",
  "cot.aguardando_aprovacao": "Aguardando aprovação",
  "cot.aprovado": "Aprovado",
  "cot.pedido_gerado": "Pedido gerado",
  "cot.reprovado": "Reprovado",
  "cot.cancelado": "Cancelado",
};
export type ChaveTraducao = keyof typeof pt;

const dicionarios: Record<Idioma, Record<ChaveTraducao, string>> = {
  "pt-BR": pt,
  "en-US": {
    "acao.salvar": "Save", "acao.cancelar": "Cancel", "acao.excluir": "Delete", "acao.novo": "New",
    "acao.editar": "Edit", "acao.visualizar": "View", "acao.clonar": "Clone", "acao.exportar": "Export",
    "acao.fechar": "Close", "acao.voltar": "Back", "acao.buscar": "Search", "acao.sair": "Sign out",
    "filtro.todos": "All", "filtro.semCategoria": "No category", "tabela.linhasPorPagina": "Rows per page",
    "tabela.ordenarPor": "Sort by {campo}", "tabela.registros": "{n} records found",
    "tabela.nenhum": "No records found",
    "msg.sucesso": "Success", "msg.erro": "Error", "msg.confirmarExclusao": "Confirm deletion?",
    "msg.carregando": "Loading...", "msg.vazio": "No information found",
    "status.ativo": "Active", "status.inativo": "Inactive", "status.pendente": "Pending",
    "status.aprovado": "Approved", "status.rejeitado": "Rejected", "status.cancelado": "Canceled",
    "menu.meusDados": "My Profile", "menu.idioma": "Language",
    "acao.adicionar": "Add",
    "acao.acoes": "Actions",
    "acao.salvando": "Saving…",
    "acao.confirmar": "Confirm",
    "acao.entendi": "Got it",
    "acao.simContinuar": "Yes, continue",
    "acao.selecione": "Select",
    "acao.limparSelecao": "Clear selection",
    "msg.aviso": "Notice",
    "msg.nenhumResultado": "No results.",
    "msg.naoInformado": "Not provided",
    "msg.excluirRegistro": "Do you really want to delete this record?",
    "tabela.anterior": "Previous",
    "tabela.proxima": "Next",
    "tabela.de": "of",
    "tabela.selecionarPagina": "Select page",
    "tabela.selecionarRegistro": "Select record",
    "form.dados": "Details",
    "dash.bomDia": "Good morning",
    "dash.boaTarde": "Good afternoon",
    "dash.boaNoite": "Good evening",
    "dash.subtitulo": "Dashboards for the areas you can access.",
    "dash.unidade": "Unit",
    "dash.consolidado": "Consolidated (all units)",
    "dash.matriz": "Headquarters only",
    "dash.filial": "Branch",
    "dash.mesAtual": "Current month",
    "dash.ultimos12": "Last 12 months",
    "dash.meuTrabalho": "My work",
    "dash.pendentesComigo": "Assigned to me",
    "dash.vencemHoje": "Due today",
    "dash.atrasadas": "Overdue",
    "dash.minhasTarefas": "My tasks and activities",
    "dash.nadaPendente": "Nothing pending for you. 🎉",
    "dash.tarefa": "Task",
    "dash.atividade": "Activity",
    "dash.atualizacoes": "Updates for you",
    "dash.semAtualizacoes": "No recent updates.",
    "dash.projetos": "Projects",
    "dash.projetosAtivos": "Active projects",
    "dash.prazoVencido": "Past due",
    "dash.entregas7": "Deliveries in 7 days",
    "dash.concluidos": "Completed",
    "dash.compras": "Purchasing and quotes",
    "dash.cotacoesMinhas": "Quotes awaiting my approval ({n})",
    "dash.revisar": "Review",
    "dash.comercial": "Sales — Offers",
    "dash.vincularOfertas": "Link a Kanban to Offers to see its stages here.",
    "dash.conversao": "Conversion rate",
    "dash.conversaoMarque": "Conversion rate (mark the won stage)",
    "dash.ticket": "Average won deal",
    "dash.comissoes": "My commissions receivable",
    "dash.semEtapa": "{n} offer(s) without a matching Kanban stage.",
    "dash.atendimento": "Support",
    "dash.vincularAtend": "Link a Kanban to Support to see its stages here.",
    "dash.contatos": "Contacts",
    "dash.atendPorMes": "Tickets per month",
    "cot.pendente": "Pending",
    "cot.em_cotacao": "Quoting",
    "cot.cotado": "Quoted",
    "cot.aguardando_aprovacao": "Awaiting approval",
    "cot.aprovado": "Approved",
    "cot.pedido_gerado": "Order created",
    "cot.reprovado": "Rejected",
    "cot.cancelado": "Canceled",
  },
  "es-ES": {
    "acao.salvar": "Guardar", "acao.cancelar": "Cancelar", "acao.excluir": "Eliminar", "acao.novo": "Nuevo",
    "acao.editar": "Editar", "acao.visualizar": "Ver", "acao.clonar": "Clonar", "acao.exportar": "Exportar",
    "acao.fechar": "Cerrar", "acao.voltar": "Volver", "acao.buscar": "Buscar", "acao.sair": "Salir",
    "filtro.todos": "Todos", "filtro.semCategoria": "Sin categoría", "tabela.linhasPorPagina": "Filas por página",
    "tabela.ordenarPor": "Ordenar por {campo}", "tabela.registros": "{n} registros encontrados",
    "tabela.nenhum": "Ningún registro encontrado",
    "msg.sucesso": "Éxito", "msg.erro": "Error", "msg.confirmarExclusao": "¿Confirmar eliminación?",
    "msg.carregando": "Cargando...", "msg.vazio": "No se encontró información",
    "status.ativo": "Activo", "status.inativo": "Inactivo", "status.pendente": "Pendiente",
    "status.aprovado": "Aprobado", "status.rejeitado": "Rechazado", "status.cancelado": "Cancelado",
    "menu.meusDados": "Mis Datos", "menu.idioma": "Idioma",
    "acao.adicionar": "Agregar",
    "acao.acoes": "Acciones",
    "acao.salvando": "Guardando…",
    "acao.confirmar": "Confirmar",
    "acao.entendi": "Entendido",
    "acao.simContinuar": "Sí, continuar",
    "acao.selecione": "Seleccione",
    "acao.limparSelecao": "Limpiar selección",
    "msg.aviso": "Aviso",
    "msg.nenhumResultado": "Sin resultados.",
    "msg.naoInformado": "No informado",
    "msg.excluirRegistro": "¿Realmente desea eliminar este registro?",
    "tabela.anterior": "Anterior",
    "tabela.proxima": "Siguiente",
    "tabela.de": "de",
    "tabela.selecionarPagina": "Seleccionar página",
    "tabela.selecionarRegistro": "Seleccionar registro",
    "form.dados": "Datos",
    "dash.bomDia": "Buenos días",
    "dash.boaTarde": "Buenas tardes",
    "dash.boaNoite": "Buenas noches",
    "dash.subtitulo": "Paneles de las áreas a las que accede.",
    "dash.unidade": "Unidad",
    "dash.consolidado": "Consolidado (todas las unidades)",
    "dash.matriz": "Solo matriz",
    "dash.filial": "Sucursal",
    "dash.mesAtual": "Mes actual",
    "dash.ultimos12": "Últimos 12 meses",
    "dash.meuTrabalho": "Mi trabajo",
    "dash.pendentesComigo": "Pendientes conmigo",
    "dash.vencemHoje": "Vencen hoy",
    "dash.atrasadas": "Atrasadas",
    "dash.minhasTarefas": "Mis tareas y actividades",
    "dash.nadaPendente": "Nada pendiente contigo. 🎉",
    "dash.tarefa": "Tarea",
    "dash.atividade": "Actividad",
    "dash.atualizacoes": "Novedades para ti",
    "dash.semAtualizacoes": "Sin novedades recientes.",
    "dash.projetos": "Proyectos",
    "dash.projetosAtivos": "Proyectos activos",
    "dash.prazoVencido": "Con plazo vencido",
    "dash.entregas7": "Entregas en 7 días",
    "dash.concluidos": "Concluidos",
    "dash.compras": "Compras y cotizaciones",
    "dash.cotacoesMinhas": "Cotizaciones esperando mi aprobación ({n})",
    "dash.revisar": "Revisar",
    "dash.comercial": "Comercial — Ofertas",
    "dash.vincularOfertas": "Vincule un Kanban a Ofertas para ver las etapas aquí.",
    "dash.conversao": "Tasa de conversión",
    "dash.conversaoMarque": "Tasa de conversión (marque la etapa ganada)",
    "dash.ticket": "Ticket medio ganado",
    "dash.comissoes": "Mis comisiones por cobrar",
    "dash.semEtapa": "{n} oferta(s) sin etapa correspondiente en el Kanban.",
    "dash.atendimento": "Atención",
    "dash.vincularAtend": "Vincule un Kanban a Atenciones para ver las etapas aquí.",
    "dash.contatos": "Contactos",
    "dash.atendPorMes": "Atenciones por mes",
    "cot.pendente": "Pendiente",
    "cot.em_cotacao": "En cotización",
    "cot.cotado": "Cotizado",
    "cot.aguardando_aprovacao": "Esperando aprobación",
    "cot.aprovado": "Aprobado",
    "cot.pedido_gerado": "Pedido generado",
    "cot.reprovado": "Rechazado",
    "cot.cancelado": "Cancelado",
  },
};

let atual: Idioma = "pt-BR";
const ouvintes = new Set<() => void>();

export function normalizarIdioma(v?: string | null): Idioma {
  const s = (v ?? "").toLowerCase();
  if (s.startsWith("en")) return "en-US";
  if (s.startsWith("es")) return "es-ES";
  return "pt-BR";
}

export function traduzir(idioma: Idioma, chave: ChaveTraducao, vars?: Record<string, string | number>) {
  let txt = dicionarios[idioma][chave] ?? pt[chave] ?? chave;
  if (vars) for (const [k, v] of Object.entries(vars)) txt = txt.replaceAll(`{${k}}`, String(v));
  return txt;
}

export const idiomaAtual = () => atual;

export function definirIdioma(id: Idioma) {
  atual = id;
  if (typeof window !== "undefined") {
    localStorage.setItem(CHAVE, id);
    document.documentElement.lang = id;
  }
  ouvintes.forEach((f) => f());
}

/** Chamar em useEffect: aplica o idioma salvo ou o do navegador. */
export function sincronizarIdioma() {
  if (typeof window === "undefined") return;
  definirIdioma(normalizarIdioma(localStorage.getItem(CHAVE) ?? navigator.language));
}

/** Tradução fora de componentes (usa o idioma ativo no momento). */
export function tr(c: ChaveTraducao, v?: Record<string, string | number>) { return traduzir(atual, c, v); }

export function useIdioma() {
  const idioma = useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => ouvintes.delete(f); },
    () => atual,
    () => "pt-BR" as Idioma,
  );
  return {
    idioma,
    setIdioma: definirIdioma,
    t: (c: ChaveTraducao, v?: Record<string, string | number>) => traduzir(idioma, c, v),
    ...formatadores(idioma),
  };
}

const MOEDA: Record<Idioma, string> = { "pt-BR": "BRL", "en-US": "USD", "es-ES": "EUR" };

export function formatadores(idioma: Idioma, moeda?: string) {
  return {
    moeda: (v: number) => new Intl.NumberFormat(idioma, { style: "currency", currency: moeda ?? MOEDA[idioma] }).format(v),
    numero: (v: number, casas = 2) => new Intl.NumberFormat(idioma, { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v),
    data: (d: Date | string) => new Intl.DateTimeFormat(idioma, { timeZone: "UTC" }).format(typeof d === "string" ? new Date(d) : d),
  };
}
