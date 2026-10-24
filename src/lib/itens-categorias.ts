/** Categorias padrão do catálogo de produtos e serviços (ordem alfabética). */
export const CATEGORIAS_ITENS = [
  "Automação & Motores",
  "Controle de Acesso & Portaria",
  "Ferramentas, Insumos & EPIs",
  "Licenças & Software",
  "Limpeza & Conservação",
  "Material Elétrico & Iluminação",
  "Material Hidráulico & Predial",
  "Móveis & Utensílios",
  "Papelaria & Escritório",
  "Prevenção e Combate a Incêndio",
  "Redes & Telecom",
  "Segurança Eletrônica & CFTV",
  "Serviços de Mão de Obra Avulsa",
  "Serviços Recorrentes (Mensais)",
].sort((a, b) => a.localeCompare(b, "pt-BR"));
