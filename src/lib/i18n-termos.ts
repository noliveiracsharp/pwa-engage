import type { Idioma } from "./i18n";

/**
 * Termos comuns de campos, colunas, abas e opções (texto em português → [inglês, espanhol]).
 * Aplicado automaticamente por tabelas, formulários e filtros; o que não estiver aqui aparece como está.
 */
const T: Record<string, [string, string]> = {
  "Nome": ["Name", "Nombre"], "Descrição": ["Description", "Descripción"], "Código": ["Code", "Código"],
  "Status": ["Status", "Estado"], "Situação": ["Status", "Situación"], "Tipo": ["Type", "Tipo"],
  "Ativo": ["Active", "Activo"], "Inativo": ["Inactive", "Inactivo"], "Todos": ["All", "Todos"], "Todas": ["All", "Todas"],
  "Nenhum": ["None", "Ninguno"], "Sem categoria": ["No category", "Sin categoría"], "Dados": ["Details", "Datos"],
  "Categoria": ["Category", "Categoría"], "Natureza": ["Nature", "Naturaleza"], "Marca": ["Brand", "Marca"],
  "Modelo": ["Model", "Modelo"], "Unidade": ["Unit", "Unidad"], "Un.": ["Unit", "Ud."], "Unidade de Medida": ["Unit of Measure", "Unidad de Medida"],
  "Produto": ["Product", "Producto"], "Serviço": ["Service", "Servicio"], "Serviço avulso": ["One-time service", "Servicio puntual"],
  "Serviço recorrente": ["Recurring service", "Servicio recurrente"], "Preço de Custo (R$)": ["Cost Price (R$)", "Precio de Costo (R$)"],
  "Preço de Venda": ["Sale Price", "Precio de Venta"], "Preço de Venda (R$)": ["Sale Price (R$)", "Precio de Venta (R$)"],
  "Custo (R$)": ["Cost (R$)", "Costo (R$)"], "Venda (R$)": ["Sale (R$)", "Venta (R$)"], "Margem de Lucro (%)": ["Profit Margin (%)", "Margen de Ganancia (%)"],
  "Centro de Custo": ["Cost Center", "Centro de Costo"], "Centro de Custo Pai": ["Parent Cost Center", "Centro de Costo Padre"],
  "Centro de Custo padrão": ["Default Cost Center", "Centro de Costo predeterminado"], "Conta Contábil": ["Ledger Account", "Cuenta Contable"],
  "Conta Gerencial": ["Management Account", "Cuenta de Gestión"], "Conta Pai": ["Parent Account", "Cuenta Padre"], "Pai": ["Parent", "Padre"],
  "Plano de Contas": ["Chart of Accounts", "Plan de Cuentas"], "Receita": ["Revenue", "Ingreso"], "Despesa operacional": ["Operating expense", "Gasto operativo"],
  "Custo direto": ["Direct cost", "Costo directo"], "Dedução da receita": ["Revenue deduction", "Deducción de ingresos"], "Resultado financeiro": ["Financial result", "Resultado financiero"],
  "Empresa": ["Company", "Empresa"], "Pessoa": ["Person", "Persona"], "Cliente": ["Customer", "Cliente"], "Fornecedor": ["Supplier", "Proveedor"],
  "Parceiro": ["Partner", "Socio"], "Responsável": ["Owner", "Responsable"], "Vendedor": ["Salesperson", "Vendedor"], "Usuário": ["User", "Usuario"],
  "Perfil": ["Profile", "Perfil"], "Cargo": ["Job title", "Cargo"], "Departamento": ["Department", "Departamento"],
  "E-mail": ["Email", "Correo"], "Telefone": ["Phone", "Teléfono"], "Telefone 1": ["Phone 1", "Teléfono 1"], "Telefone 2": ["Phone 2", "Teléfono 2"],
  "Telefone / WhatsApp": ["Phone / WhatsApp", "Teléfono / WhatsApp"], "CPF": ["CPF (Tax ID)", "CPF"], "CNPJ / CPF": ["Tax ID (CNPJ / CPF)", "CNPJ / CPF"],
  "Tipo de pessoa": ["Person type", "Tipo de persona"], "Física": ["Individual", "Física"], "Jurídica": ["Company", "Jurídica"],
  "Endereço": ["Address", "Dirección"], "CEP": ["ZIP code", "Código postal"], "Cidade": ["City", "Ciudad"], "Estado": ["State", "Estado"],
  "UF": ["State", "Estado"], "Bairro": ["District", "Barrio"], "Número": ["Number", "Número"], "Complemento": ["Complement", "Complemento"],
  "Observações": ["Notes", "Observaciones"], "Notas rápidas": ["Quick notes", "Notas rápidas"], "Etiquetas": ["Tags", "Etiquetas"],
  "Foto": ["Photo", "Foto"], "Imagem": ["Image", "Imagen"], "Logo": ["Logo", "Logo"], "Cor": ["Color", "Color"], "Ícone": ["Icon", "Ícono"],
  "Documentos": ["Documents", "Documentos"], "Histórico": ["History", "Historial"], "Campos": ["Fields", "Campos"],
  "Campos personalizados": ["Custom fields", "Campos personalizados"], "Instâncias": ["Instances", "Instancias"], "Provedor": ["Provider", "Proveedor"],
  "Finalidade": ["Purpose", "Finalidad"], "Token": ["Token", "Token"], "URL": ["URL", "URL"], "Data": ["Date", "Fecha"],
  "Data de criação": ["Created on", "Fecha de creación"], "Criado em": ["Created on", "Creado el"], "Vencimento": ["Due date", "Vencimiento"],
  "Valor": ["Amount", "Valor"], "Valor (R$)": ["Amount (R$)", "Valor (R$)"], "Total": ["Total", "Total"], "Quantidade": ["Quantity", "Cantidad"],
  "Qtd.": ["Qty.", "Cant."], "Desconto": ["Discount", "Descuento"], "Forma de pagamento": ["Payment method", "Forma de pago"],
  "Parcelas": ["Installments", "Cuotas"], "Projeto": ["Project", "Proyecto"], "Título": ["Title", "Título"], "Prioridade": ["Priority", "Prioridad"],
  "Etapa": ["Stage", "Etapa"], "Origem": ["Source", "Origen"], "Ações": ["Actions", "Acciones"], "Busca": ["Search", "Búsqueda"],
  "Buscar": ["Search", "Buscar"], "Período": ["Period", "Período"], "Margem média": ["Average margin", "Margen medio"],
  "Venda média": ["Average sale", "Venta media"], "Total de itens": ["Total items", "Total de ítems"],
  "Inscrição Estadual (IE)": ["State Registration (IE)", "Inscripción Estatal (IE)"], "Inscrição Municipal (IM)": ["Municipal Registration (IM)", "Inscripción Municipal (IM)"],
  "Regime tributário (CRT)": ["Tax regime (CRT)", "Régimen tributario (CRT)"], "Origem da mercadoria": ["Goods origin", "Origen de la mercancía"],
  "Participa da roleta de leads": ["Joins lead rotation", "Participa en la rotación de leads"],
  "Permitir atendimento de colaboradores": ["Allow employee tickets", "Permitir atención a colaboradores"],
  "Imagem da tela de login": ["Login screen image", "Imagen de la pantalla de inicio"], "Comercial / Vendas": ["Sales", "Comercial / Ventas"],
  "Administrativo / Diretoria": ["Administration / Board", "Administración / Dirección"], "Operações / Campo": ["Operations / Field", "Operaciones / Campo"],
  "TI & Suporte": ["IT & Support", "TI y Soporte"], "Produção": ["Production", "Producción"], "Projetos / Contratos": ["Projects / Contracts", "Proyectos / Contratos"],
  "Departamento / Projeto": ["Department / Project", "Departamento / Proyecto"],
};

export function termo(idioma: Idioma, texto: string): string {
  if (idioma === "pt-BR") return texto;
  const t = T[texto.trim()];
  return t ? t[idioma === "en-US" ? 0 : 1] : texto;
}

/** Igual a `termo`, mas aceita qualquer conteúdo (só traduz quando for texto). */
export function termoNo<T>(idioma: Idioma, v: T): T | string {
  return typeof v === "string" ? termo(idioma, v) : v;
}
