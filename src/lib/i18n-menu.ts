import type { Idioma } from "./i18n";

/** Nomes do menu por caminho (o cadastro do menu continua em português no banco). */
const MENU: Record<string, [en: string, es: string]> = {
  "/dashboard": ["Dashboard", "Panel"],
  "/empresas": ["Companies", "Empresas"],
  "/pessoas": ["Contacts", "Personas"],
  "/usuarios": ["Users", "Usuarios"],
  "/funcoes": ["Roles", "Funciones"],
  "/perfil": ["Profiles", "Perfiles"],
  "/kanban": ["Kanban", "Kanban"],
  "/atendimentos": ["Support", "Atenciones"],
  "/itens": ["Products & Services", "Productos y Servicios"],
  "/itens_categorias": ["Item Categories", "Categorías de Ítems"],
  "/marcas": ["Brands", "Marcas"],
  "/unid_medida": ["Units of Measure", "Unidades de Medida"],
  "/orcamentos": ["Offers", "Ofertas"],
  "/cotacoes": ["Purchase Quotes", "Cotizaciones"],
  "/projetos": ["Projects", "Proyectos"],
  "/projetos/templates": ["Project Templates", "Plantillas de Proyecto"],
  "/financeiro": ["Finance", "Finanzas"],
  "/centro_custos": ["Cost Centers", "Centros de Costo"],
  "/plano_contas": ["Chart of Accounts", "Plan de Cuentas"],
  "/comissoes": ["Commissions", "Comisiones"],
  "/reembolsos": ["Reimbursements", "Reembolsos"],
  "/estoque": ["Inventory", "Inventario"],
  "/notas_fiscais": ["Invoices", "Facturas"],
  "/parceiros": ["Partners", "Socios"],
  "/veiculos": ["Vehicles", "Vehículos"],
  "/manutencoes": ["Maintenance", "Mantenimientos"],
  "/laudos": ["Reports & Inspections", "Informes Técnicos"],
  "/documentos": ["Documents", "Documentos"],
  "/fluxos": ["Flows", "Flujos"],
  "/instancias": ["Instances", "Instancias"],
  "/sdr": ["Lead Radar", "Radar de Leads"],
  "/auditoria": ["Audit Log", "Auditoría"],
  "/relatorios": ["Reports", "Informes"],
  "/relatorios/board": ["Board Report", "Informe de Directorio"],
  "/relatorios/comercial": ["Sales Report", "Informe Comercial"],
  "/relatorios/dre-gerencial": ["Management P&L", "Estado de Resultados"],
  "/relatorios/dre-ofertas": ["Offers P&L", "Resultados de Ofertas"],
  "/relatorios/kpis": ["KPIs", "Indicadores"],
  "/admin/clientes": ["Customers", "Clientes"],
  "/admin/modulos": ["Modules", "Módulos"],
  "/admin/planos": ["Plans", "Planes"],
  "/admin/versoes": ["Releases", "Versiones"],
  "/meus-dados": ["My Profile", "Mis Datos"],
};

export function rotuloMenu(idioma: Idioma, path: string | null | undefined, label: string) {
  if (idioma === "pt-BR" || !path) return label;
  const t = MENU[path];
  return t ? t[idioma === "en-US" ? 0 : 1] : label;
}
