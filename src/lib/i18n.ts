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
