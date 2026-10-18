/** Módulo de Documentos: modelos com variáveis {{chave}} e documentos emitidos por cadastro. */
import { pick, type Row } from "@/lib/row";

export type EntidadeDoc = "usuario" | "parceiro" | "empresa" | "veiculo";
export type StatusDoc = "rascunho" | "emitido" | "assinado" | "cancelado";

export const ENTIDADES: Array<{ value: EntidadeDoc; label: string }> = [
  { value: "empresa", label: "Empresa" },
  { value: "parceiro", label: "Cliente / Fornecedor" },
  { value: "usuario", label: "Usuário / Colaborador" },
  { value: "veiculo", label: "Veículo" },
];

export const STATUS_DOC: Array<{ value: StatusDoc; label: string; badge: string }> = [
  { value: "rascunho", label: "Rascunho", badge: "bg-muted text-muted-foreground" },
  { value: "emitido", label: "Aguardando assinatura", badge: "bg-warning text-warning-foreground" },
  { value: "assinado", label: "Assinado", badge: "bg-success text-success-foreground" },
  { value: "cancelado", label: "Cancelado", badge: "bg-destructive text-destructive-foreground" },
];

export const statusDoc = (v: unknown) => STATUS_DOC.find((s) => s.value === v) ?? STATUS_DOC[0]!;
export const entidadeLabel = (v: unknown) => ENTIDADES.find((e) => e.value === v)?.label ?? String(v ?? "");

/** Variáveis disponíveis por tipo de cadastro (exibidas como ajuda no editor). */
export const VARIAVEIS: Record<EntidadeDoc | "geral", string[]> = {
  geral: ["empresa_razao", "empresa_cnpj", "empresa_endereco", "empresa_cidade", "data_hoje"],
  usuario: ["nome", "cpf", "email", "celular", "cargo"],
  parceiro: ["nome", "documento", "email", "telefone", "endereco"],
  empresa: ["nome", "documento", "endereco"],
  veiculo: ["placa", "modelo", "marca", "ano", "renavam"],
};

const txt = (r: Row | null | undefined, keys: string[]) => String((r && pick(r, keys)) ?? "").trim();

function endereco(r: Row | null | undefined) {
  if (!r) return "";
  return [txt(r, ["logradouro", "endereco"]), txt(r, ["numero"]), txt(r, ["bairro"]), txt(r, ["cidade", "municipio"]), txt(r, ["uf", "estado"])]
    .filter(Boolean)
    .join(", ");
}

/** Monta o dicionário de variáveis a partir do cadastro e da empresa logada. */
export function variaveisDe(tipo: EntidadeDoc, registro: Row | null, empresa: Row | null, hoje = new Date()): Record<string, string> {
  const base: Record<string, string> = {
    empresa_razao: txt(empresa, ["razao_social", "nome", "descricao"]),
    empresa_cnpj: txt(empresa, ["cnpj", "documento"]),
    empresa_endereco: endereco(empresa),
    empresa_cidade: txt(empresa, ["cidade", "municipio"]),
    data_hoje: hoje.toLocaleDateString("pt-BR"),
  };
  const r = registro;
  const extra: Record<EntidadeDoc, Record<string, string>> = {
    usuario: { nome: txt(r, ["nome", "descricao"]), cpf: txt(r, ["cpf", "documento"]), email: txt(r, ["email"]), celular: txt(r, ["celular", "telefone"]), cargo: txt(r, ["cargo", "funcao"]) },
    parceiro: { nome: txt(r, ["razao_social", "nome", "nome_fantasia"]), documento: txt(r, ["documento", "cnpj", "cpf"]), email: txt(r, ["email"]), telefone: txt(r, ["telefone", "celular"]), endereco: endereco(r) },
    empresa: { nome: txt(r, ["razao_social", "nome"]), documento: txt(r, ["cnpj", "documento"]), endereco: endereco(r) },
    veiculo: { placa: txt(r, ["placa"]), modelo: txt(r, ["modelo", "descricao"]), marca: txt(r, ["marca"]), ano: txt(r, ["ano", "ano_modelo"]), renavam: txt(r, ["renavam"]) },
  };
  return { ...base, ...extra[tipo] };
}

/** Substitui {{chave}}; variável sem valor vira linha para preencher à mão. */
export function renderModelo(conteudo: string, vars: Record<string, string>): string {
  return conteudo.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, k: string) => vars[k] || "________________");
}

/** Dias até o vencimento (negativo = vencido). */
export function diasParaVencer(data: unknown, hoje = new Date()): number | null {
  const s = String(data ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((d.getTime() - h.getTime()) / 864e5);
}

const ASSIN = `\n\n{{empresa_cidade}}, {{data_hoje}}.\n\n\n_______________________________\n{{empresa_razao}}\n\n\n_______________________________\n{{nome}}`;

export type ModeloPadrao = { titulo: string; categoria: string; entidade_tipo: EntidadeDoc; conteudo: string };

export const MODELOS_PADRAO: ModeloPadrao[] = [
  {
    titulo: "Contrato de Prestação de Serviços (Cliente)",
    categoria: "Contrato",
    entidade_tipo: "parceiro",
    conteudo: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nCONTRATADA: {{empresa_razao}}, CNPJ {{empresa_cnpj}}, com sede em {{empresa_endereco}}.\nCONTRATANTE: {{nome}}, CPF/CNPJ {{documento}}, com endereço em {{endereco}}.\n\n1. OBJETO. A CONTRATADA prestará os serviços descritos na Oferta aprovada pelo CONTRATANTE, que integra este contrato.\n\n2. PREÇO E PAGAMENTO. Os valores, a forma de pagamento e as parcelas são os da Oferta aprovada. O atraso gera multa de 2% e juros de 1% ao mês.\n\n3. PRAZO. Este contrato vale pelo prazo indicado na Oferta e pode ser renovado por escrito.\n\n4. EQUIPAMENTOS EM COMODATO. Equipamentos cedidos em comodato continuam sendo da CONTRATADA e devem ser devolvidos no fim do contrato, em bom estado.\n\n5. RESCISÃO. Qualquer parte pode encerrar o contrato com aviso de 30 dias, quitando os valores devidos até a data.\n\n6. DADOS PESSOAIS (LGPD). Os dados serão usados somente para executar este contrato, conforme a Política de Privacidade da CONTRATADA.\n\n7. FORO. Fica eleito o foro da comarca de {{empresa_cidade}}.${ASSIN}`,
  },
  {
    titulo: "Contrato de Fornecimento (Fornecedor)",
    categoria: "Contrato",
    entidade_tipo: "parceiro",
    conteudo: `CONTRATO DE FORNECIMENTO\n\nCONTRATANTE: {{empresa_razao}}, CNPJ {{empresa_cnpj}}.\nFORNECEDOR: {{nome}}, CPF/CNPJ {{documento}}, com endereço em {{endereco}}.\n\n1. OBJETO. O FORNECEDOR fornecerá produtos e/ou serviços conforme pedidos de compra emitidos pela CONTRATANTE.\n\n2. PREÇO E PRAZO. Valem os preços e prazos de entrega confirmados em cada pedido ou cotação aprovada.\n\n3. QUALIDADE E GARANTIA. Os itens devem seguir as especificações combinadas e ter garantia mínima legal. Itens com defeito serão trocados sem custo.\n\n4. NOTA FISCAL. Todo fornecimento deve ter nota fiscal correta, com os dados da CONTRATANTE.\n\n5. CONFIDENCIALIDADE E LGPD. O FORNECEDOR manterá sigilo sobre informações e dados pessoais a que tiver acesso.\n\n6. RESCISÃO. Pode ser encerrado por qualquer parte com aviso de 30 dias.\n\n7. FORO. Comarca de {{empresa_cidade}}.${ASSIN}`,
  },
  {
    titulo: "Termo de Compromisso de Estágio",
    categoria: "Contrato",
    entidade_tipo: "usuario",
    conteudo: `TERMO DE COMPROMISSO DE ESTÁGIO (Lei 11.788/2008)\n\nCONCEDENTE: {{empresa_razao}}, CNPJ {{empresa_cnpj}}.\nESTAGIÁRIO(A): {{nome}}, CPF {{cpf}}, e-mail {{email}}.\nINSTITUIÇÃO DE ENSINO: ________________________________\n\n1. O estágio tem objetivo educacional e não cria vínculo de emprego.\n\n2. JORNADA: até ____ horas diárias e ____ semanais, compatíveis com as aulas.\n\n3. BOLSA: R$ ________ por mês, mais auxílio-transporte de R$ ________.\n\n4. VIGÊNCIA: de ___/___/______ a ___/___/______ (máximo de 2 anos).\n\n5. SEGURO contra acidentes pessoais: apólice nº ________________.\n\n6. RECESSO de 30 dias a cada 12 meses, proporcional quando menor.\n\n7. O estagiário seguirá as normas internas e manterá sigilo sobre informações da empresa.${ASSIN}`,
  },
  {
    titulo: "Termo de Responsabilidade — Veículo",
    categoria: "Termo de responsabilidade",
    entidade_tipo: "usuario",
    conteudo: `TERMO DE RESPONSABILIDADE PELO USO DE VEÍCULO\n\nEu, {{nome}}, CPF {{cpf}}, recebo de {{empresa_razao}} o veículo placa ____________, modelo ____________________, para uso exclusivo em atividades da empresa.\n\nComprometo-me a:\n1. Dirigir com habilitação válida e respeitar as leis de trânsito.\n2. Conservar o veículo e comunicar na hora qualquer dano, batida ou furto.\n3. Não emprestar o veículo nem usá-lo para fins pessoais sem autorização.\n4. Registrar quilometragem e abastecimentos no sistema.\n\nMULTAS: as infrações cometidas durante o meu uso serão indicadas no meu nome junto ao órgão de trânsito. Autorizo o desconto de multas e danos causados por culpa minha, conforme o art. 462, §1º, da CLT.\n\nDevolverei o veículo quando solicitado, no mesmo estado em que recebi.${ASSIN}`,
  },
  {
    titulo: "Termo de Responsabilidade — Celular e Linha",
    categoria: "Termo de responsabilidade",
    entidade_tipo: "usuario",
    conteudo: `TERMO DE RESPONSABILIDADE — CELULAR CORPORATIVO\n\nEu, {{nome}}, CPF {{cpf}}, recebo de {{empresa_razao}}:\nAparelho: ______________________  IMEI: ______________________\nLinha: ______________________  Acessórios: ______________________\n\nComprometo-me a:\n1. Usar o aparelho e a linha para atividades da empresa.\n2. Guardar e conservar o aparelho, sem instalar programas proibidos.\n3. Avisar na hora em caso de perda, roubo ou defeito (com boletim de ocorrência em caso de roubo).\n4. Devolver o aparelho e acessórios ao sair da empresa ou quando solicitado.\n\nSei que as conversas e dados da linha corporativa pertencem à empresa. Autorizo o desconto de danos causados por culpa minha, conforme o art. 462, §1º, da CLT.${ASSIN}`,
  },
  {
    titulo: "Termo de Responsabilidade — Equipamentos e Ferramentas",
    categoria: "Termo de responsabilidade",
    entidade_tipo: "usuario",
    conteudo: `TERMO DE CAUTELA DE EQUIPAMENTOS E FERRAMENTAS\n\nEu, {{nome}}, CPF {{cpf}}, declaro receber de {{empresa_razao}} os itens abaixo, em perfeito estado:\n\n| Item | Nº de série/patrimônio | Qtde |\n| ____________________ | ____________ | ___ |\n| ____________________ | ____________ | ___ |\n| ____________________ | ____________ | ___ |\n\nComprometo-me a usá-los só no trabalho, guardá-los com cuidado, avisar sobre defeitos ou perdas e devolvê-los quando solicitado ou ao sair da empresa.\n\nAutorizo o desconto de danos ou extravio causados por culpa minha, conforme o art. 462, §1º, da CLT.${ASSIN}`,
  },
  {
    titulo: "Termo de Confidencialidade e LGPD (Colaborador)",
    categoria: "Termo de responsabilidade",
    entidade_tipo: "usuario",
    conteudo: `TERMO DE CONFIDENCIALIDADE E PROTEÇÃO DE DADOS\n\nEu, {{nome}}, CPF {{cpf}}, colaborador(a) de {{empresa_razao}}, comprometo-me a:\n\n1. Manter em sigilo informações de clientes, preços, contratos, senhas e estratégias da empresa, durante e depois do meu vínculo.\n2. Acessar dados pessoais apenas quando necessário ao meu trabalho, conforme a LGPD (Lei 13.709/2018).\n3. Não copiar, enviar ou guardar dados da empresa em contas ou aparelhos pessoais sem autorização.\n4. Avisar imediatamente qualquer vazamento ou acesso indevido que eu perceber.\n\nSei que todas as minhas ações no sistema ficam registradas para auditoria.${ASSIN}`,
  },
  {
    titulo: "Termo de Entrega Técnica e Aceite de Instalação",
    categoria: "Termo",
    entidade_tipo: "parceiro",
    conteudo: `TERMO DE ENTREGA TÉCNICA E ACEITE\n\nCLIENTE: {{nome}}, CPF/CNPJ {{documento}}, endereço {{endereco}}.\nEXECUTANTE: {{empresa_razao}}, CNPJ {{empresa_cnpj}}.\n\nDeclaro que recebi a instalação/serviço abaixo funcionando e que recebi as orientações de uso:\n\n______________________________________________________________\n______________________________________________________________\n\nObservações: _________________________________________________\n\nA garantia passa a contar a partir desta data.${ASSIN}`,
  },
  {
    titulo: "Termo de Comodato de Equipamentos",
    categoria: "Contrato",
    entidade_tipo: "parceiro",
    conteudo: `TERMO DE COMODATO\n\nCOMODANTE: {{empresa_razao}}, CNPJ {{empresa_cnpj}}.\nCOMODATÁRIO: {{nome}}, CPF/CNPJ {{documento}}, endereço {{endereco}}.\n\n1. O COMODANTE empresta, sem transferir a propriedade, os equipamentos listados na Oferta aprovada.\n2. O COMODATÁRIO deve conservá-los, não pode vendê-los, emprestá-los ou retirá-los do local sem autorização.\n3. Danos por mau uso, furto ou perda serão cobrados pelo valor de reposição.\n4. No fim do contrato, os equipamentos serão retirados pelo COMODANTE em até 10 dias.${ASSIN}`,
  },
  {
    titulo: "Checklist de Entrega/Devolução de Veículo",
    categoria: "Termo",
    entidade_tipo: "veiculo",
    conteudo: `ENTREGA / DEVOLUÇÃO DE VEÍCULO\n\nVeículo: {{marca}} {{modelo}}  Placa: {{placa}}  Ano: {{ano}}  Renavam: {{renavam}}\nResponsável: ______________________________  Data: {{data_hoje}}\n\nKm: __________  Combustível: [ ] 1/4 [ ] 1/2 [ ] 3/4 [ ] Cheio\nDocumento (CRLV): [ ] Sim [ ] Não   Estepe/macaco/triângulo: [ ] Sim [ ] Não\nAvarias encontradas: _______________________________________\n\n_______________________________\nEntregue por\n\n_______________________________\nRecebido por`,
  },
];

/** Token aleatório para o link público de assinatura. */
export const novoTokenDoc = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

export const linkAssinaturaDoc = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/doc/${token}`;

/** Selo de autenticidade da assinatura eletrônica (texto anexado ao documento impresso). */
export function carimboAssinatura(d: Row | null | undefined): string {
  if (!d || !d["assinado_em"]) return "";
  const quando = new Date(String(d["assinado_em"])).toLocaleString("pt-BR");
  return [
    "ASSINADO ELETRONICAMENTE",
    `Signatário: ${String(d["assinado_nome"] ?? "")} — CPF/CNPJ ${String(d["assinado_documento"] ?? "")}`,
    `Data/hora: ${quando} — IP ${String(d["assinado_ip"] ?? "indisponível")}`,
    `Código de autenticidade (SHA-256): ${String(d["assinado_hash"] ?? "")}`,
  ].join("\n");
}
