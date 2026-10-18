/** Central de Ajuda: guias padrão em linguagem simples + busca pura usada pela tela e pelo Copiloto. */
export type ArtigoAjuda = {
  id: string;
  modulo: string;
  titulo: string;
  resumo: string;
  rota?: string;
  perfil?: string;
  passos: string[];
  dica?: string;
  faq?: { p: string; r: string }[];
  video?: string;
  tags?: string[];
};

export const MODULOS_AJUDA = [
  "Primeiros passos",
  "Atendimentos",
  "Ofertas",
  "Projetos",
  "Financeiro",
  "Suprimentos",
  "Administração",
] as const;

export const ARTIGOS_PADRAO: ArtigoAjuda[] = [
  {
    id: "primeiro-acesso", modulo: "Primeiros passos", titulo: "Conhecendo a tela do Atende.ai",
    resumo: "Onde ficam o menu, os avisos, a troca de tema e seus dados.", perfil: "Todos",
    passos: [
      "O menu lateral à esquerda leva a todas as telas que você tem permissão para usar.",
      "Clique no ícone de três linhas no topo para abrir ou fechar o menu.",
      "O sino no topo mostra seus avisos (tarefas, projetos, frota).",
      "O ícone de sol/lua troca entre tema claro e escuro.",
      "Clique na sua foto para ver Meus dados ou sair do sistema.",
    ],
    dica: "Se uma tela não aparece no menu, peça ao administrador para liberar no seu perfil.",
    tags: ["menu", "inicio", "tema", "sair", "avisos"],
  },
  {
    id: "atend-iniciar", modulo: "Atendimentos", titulo: "Como iniciar e responder uma conversa no WhatsApp",
    resumo: "Atenda clientes pelo WhatsApp direto do sistema.", rota: "/atendimentos", perfil: "Atendente",
    passos: [
      "Abra o menu Atendimentos.",
      "Clique em Novo atendimento e escolha o contato (ou digite o telefone).",
      "Escreva a mensagem no campo de baixo e aperte Enter para enviar.",
      "Para mandar áudio, segure o botão do microfone; para anexo, use o clipe.",
      "Ao terminar, mude a etapa para Finalizado — o sistema pode pedir o checklist antes.",
    ],
    dica: "Cada atendimento tem um número de protocolo. Informe ao cliente para ele acompanhar.",
    faq: [{ p: "Por que não consigo finalizar?", r: "Existe um checklist obrigatório na etapa. Preencha os itens e tente de novo." }],
    tags: ["whatsapp", "conversa", "chat", "audio", "protocolo", "mensagem"],
  },
  {
    id: "atend-robo", modulo: "Atendimentos", titulo: "Robô ou Humano: quem responde o cliente",
    resumo: "Assuma a conversa do robô ou devolva para ele.", rota: "/atendimentos", perfil: "Atendente",
    passos: [
      "Abra a conversa em Atendimentos.",
      "No topo da conversa, veja a etiqueta Robô ou Humano.",
      "Clique em Assumir para você responder; o robô para de falar.",
      "Para devolver ao robô, clique em Devolver ao robô.",
    ],
    tags: ["robo", "bot", "humano", "assumir", "automacao"],
  },
  {
    id: "atend-portal", modulo: "Atendimentos", titulo: "Enviar o link do Portal do Cliente",
    resumo: "O cliente acompanha os próprios atendimentos pelo celular.", rota: "/atendimentos",
    passos: [
      "Abra a conversa do cliente.",
      "Clique nos três pontinhos no topo da conversa.",
      "Escolha Enviar link do Portal (vai pelo WhatsApp) ou Copiar link do Portal.",
      "O cliente abre o link e entra só com o telefone.",
    ],
    tags: ["portal", "cliente", "link", "acompanhar"],
  },
  {
    id: "oferta-criar", modulo: "Ofertas", titulo: "Como criar e enviar uma Oferta",
    resumo: "Monte a proposta com itens, desconto e envie o link para o cliente aprovar.", rota: "/orcamentos", perfil: "Vendedor",
    passos: [
      "Abra o menu Ofertas e clique em Nova.",
      "Escolha o cliente (a busca aceita nome ou CNPJ).",
      "Adicione os itens e as quantidades; o total é calculado sozinho.",
      "Se quiser, aplique desconto em R$ ou %.",
      "Clique em Salvar e depois em Copiar link ou Enviar por WhatsApp.",
    ],
    dica: "O cliente abre a Oferta no celular e pode aprovar e assinar com o dedo.",
    faq: [{ p: "Por que não consigo apagar uma Oferta?", r: "Ofertas aprovadas, ganhas ou em Ativação ficam protegidas para não bagunçar o financeiro." }],
    tags: ["oferta", "orcamento", "proposta", "desconto", "assinatura", "venda"],
  },
  {
    id: "oferta-kanban", modulo: "Ofertas", titulo: "Mover a Oferta no funil (Kanban)",
    resumo: "Acompanhe cada negócio por etapa até ganhar o cliente.", rota: "/kanban",
    passos: [
      "Abra o Kanban.",
      "Arraste o card da Oferta para a próxima etapa.",
      "Quando chegar em Ativação, o sistema cria o Projeto e as contas a receber automaticamente.",
    ],
    tags: ["kanban", "funil", "etapa", "ativacao", "ganho"],
  },
  {
    id: "proj-estrutura", modulo: "Projetos", titulo: "Organizando Espaços, Projetos, Pastas e Listas",
    resumo: "Monte a estrutura do seu trabalho, parecida com o ClickUp.", rota: "/projetos",
    passos: [
      "Em Projetos, use o + na lateral para criar um Espaço (ex.: Testes de Usabilidade).",
      "Dentro dele crie Projetos ou Pastas — eles mostram a visão geral.",
      "Crie Listas dentro: é na Lista que ficam os status e as tarefas.",
      "Use a engrenagem da Lista para criar, renomear e colorir status.",
    ],
    tags: ["espaco", "pasta", "lista", "status", "clickup", "estrutura"],
  },
  {
    id: "proj-tarefas", modulo: "Projetos", titulo: "Criar tarefas e mudar o status arrastando",
    resumo: "Crie tarefas, defina responsáveis e arraste entre status.", rota: "/projetos",
    passos: [
      "Abra uma Lista e clique em Nova tarefa.",
      "Preencha título, responsável e data de entrega e salve.",
      "Para mudar o status, arraste a tarefa para outra coluna ou seção.",
      "Abra a tarefa para adicionar atividades e checklists.",
    ],
    dica: "O responsável recebe aviso no sino e no WhatsApp.",
    tags: ["tarefa", "atividade", "checklist", "arrastar", "responsavel"],
  },
  {
    id: "fin-despesa", modulo: "Financeiro", titulo: "Lançar uma despesa (Contas a Pagar)",
    resumo: "Registre contas, com categoria, centro de custo e repetição.", rota: "/financeiro", perfil: "Financeiro",
    passos: [
      "Abra Financeiro → Contas a Pagar e clique em Novo.",
      "Escolha o fornecedor, descrição, valor e vencimento.",
      "Selecione a Categoria e o Centro de custo.",
      "Se a conta se repete, ligue Repetir lançamento e escolha Mensal.",
      "Se já pagou, ligue Já pago e escolha a conta bancária. Salve.",
    ],
    dica: "Use o botão Categorias para criar ou renomear categorias.",
    tags: ["despesa", "pagar", "conta", "categoria", "centro de custo", "repetir"],
  },
  {
    id: "fin-cartao", modulo: "Financeiro", titulo: "Compra parcelada no cartão de crédito",
    resumo: "O sistema cria as parcelas nas faturas certas do cartão.", rota: "/financeiro",
    passos: [
      "Em Contas a Pagar, clique em Novo e escolha a forma Cartão de crédito.",
      "Selecione o cartão e o número de parcelas.",
      "Salve: as parcelas caem nos meses conforme fechamento e vencimento do cartão.",
      "Para pagar a fatura, filtre pelo cartão e use Baixar fatura.",
    ],
    tags: ["cartao", "credito", "parcelado", "fatura", "baixar"],
  },
  {
    id: "fin-fluxo", modulo: "Financeiro", titulo: "Ler o Fluxo de Caixa",
    resumo: "Veja entradas, saídas e saldo mês a mês.", rota: "/financeiro",
    passos: [
      "Abra Financeiro → Fluxo de Caixa.",
      "Escolha o período: mês atual, 6 meses, 12 meses ou personalizado.",
      "Escolha mostrar Previsto, Realizado ou os dois.",
      "As barras mostram entradas e saídas; a linha mostra o saldo acumulado.",
    ],
    tags: ["fluxo", "caixa", "grafico", "saldo", "previsto", "realizado"],
  },
  {
    id: "fin-controller", modulo: "Financeiro", titulo: "Parecer do Controller e relatório gerencial",
    resumo: "Alertas do caixa e um parecer da IA com plano de ação.", rota: "/financeiro",
    passos: [
      "Abra Financeiro → Controller.",
      "Informe o saldo atual em caixa.",
      "Leia o Radar: vermelho é urgente, amarelo é atenção.",
      "Clique em Parecer do Controller para a IA sugerir ações.",
      "Clique em Relatório gerencial para imprimir ou salvar em PDF.",
    ],
    faq: [{ p: "Apareceu 'IA não disponível no plano'", r: "O parecer está nos planos Pro e Enterprise, no módulo adicional ou com chave própria em Empresas → Inteligência Artificial." }],
    tags: ["controller", "parecer", "ia", "relatorio", "alerta", "bpo"],
  },
  {
    id: "fin-reembolso", modulo: "Financeiro", titulo: "Pedir e aprovar reembolso",
    resumo: "Envie a foto do comprovante; a IA lê os dados.", rota: "/reembolsos",
    passos: [
      "Abra Reembolsos e clique em Novo.",
      "Envie a foto da nota ou recibo; os campos são preenchidos sozinhos.",
      "Confira o valor e salve.",
      "O gestor aprova e o sistema cria a conta a pagar.",
    ],
    tags: ["reembolso", "comprovante", "ocr", "nota", "aprovar"],
  },
  {
    id: "sup-cotacao", modulo: "Suprimentos", titulo: "Fazer cotação com fornecedores",
    resumo: "Mande um link e o fornecedor preenche os preços.", rota: "/cotacoes",
    passos: [
      "Abra Cotações e clique em Nova.",
      "Adicione os itens e as quantidades.",
      "Escolha os fornecedores e envie o link para cada um.",
      "Compare as respostas e aprove a melhor — a Oferta é criada automaticamente.",
    ],
    tags: ["cotacao", "fornecedor", "compra", "preco"],
  },
  {
    id: "sup-itens", modulo: "Suprimentos", titulo: "Cadastrar itens e reajustar preços",
    resumo: "Produtos e serviços com custo, preço e dados fiscais.", rota: "/itens",
    passos: [
      "Abra Itens e clique em Novo.",
      "Preencha nome, unidade, custo e preço de venda.",
      "Para reajuste em massa, use Parâmetros de precificação.",
      "Ao alterar um preço, o sistema pergunta quais Ofertas recalcular.",
    ],
    dica: "Ofertas já aprovadas nunca mudam o preço de venda, só o custo.",
    tags: ["item", "produto", "servico", "preco", "custo", "reajuste", "ncm"],
  },
  {
    id: "adm-usuarios", modulo: "Administração", titulo: "Convidar usuário e dar permissões",
    resumo: "Cadastre a equipe e libere o que cada perfil pode fazer.", rota: "/usuarios", perfil: "Administrador",
    passos: [
      "Abra Usuários e clique em Novo; escolha o perfil.",
      "Em Funções, abra a tela desejada e vá em Perfis.",
      "Marque Ler, Criar, Editar, Excluir e Ativo para o perfil.",
      "Novos vínculos começam desmarcados por segurança.",
    ],
    tags: ["usuario", "perfil", "permissao", "acesso", "funcoes"],
  },
  {
    id: "adm-empresa", modulo: "Administração", titulo: "Dados da empresa, logo e IA",
    resumo: "Configure a marca da empresa e a Inteligência Artificial.", rota: "/empresas", perfil: "Administrador",
    passos: [
      "Abra Empresas e edite sua empresa.",
      "Envie o logo e ajuste as cores: elas aparecem nas Ofertas e documentos.",
      "Na aba Inteligência Artificial, escolha usar a IA do plano ou sua própria chave.",
    ],
    tags: ["empresa", "logo", "marca", "cores", "ia", "chave"],
  },
  {
    id: "adm-documentos", modulo: "Administração", titulo: "Emitir contratos e termos (Documentos)",
    resumo: "Use modelos prontos e colete assinatura por link.", rota: "/documentos",
    passos: [
      "No cadastro do usuário, cliente ou empresa, clique em Documentos.",
      "Escolha o modelo (ex.: Responsabilidade com celular).",
      "Ligue Coletar assinatura se quiser enviar o link para assinar.",
      "Imprima ou envie o link.",
    ],
    tags: ["documento", "contrato", "termo", "assinatura", "modelo"],
  },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const STOP = new Set(["como", "para", "uma", "um", "o", "a", "de", "do", "da", "eu", "que", "no", "na", "e", "em", "os", "as", "meu", "minha", "faco", "fazer"]);

/** Ordena artigos por relevância à pergunta (título e tags pesam mais). */
export function buscarArtigos(artigos: ArtigoAjuda[], consulta: string, limite = 5): ArtigoAjuda[] {
  const termos = norm(consulta).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
  if (!termos.length) return [];
  return artigos
    .map((a) => {
      const tit = norm(a.titulo), tags = norm((a.tags ?? []).join(" ")), corpo = norm([a.resumo, a.modulo, ...a.passos, a.dica ?? "", ...(a.faq ?? []).map((f) => f.p + " " + f.r)].join(" "));
      let s = 0;
      for (const t of termos) {
        const raiz = t.length > 5 ? t.slice(0, -1) : t;
        if (tit.includes(raiz)) s += 3;
        if (tags.includes(raiz)) s += 3;
        if (corpo.includes(raiz)) s += 1;
      }
      return { a, s };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, limite)
    .map((x) => x.a);
}

/** Texto do artigo para servir de contexto à IA. */
export function artigoTexto(a: ArtigoAjuda): string {
  return [
    `# ${a.titulo} (módulo ${a.modulo}${a.rota ? `, tela ${a.rota}` : ""})`,
    a.resumo,
    ...a.passos.map((p, i) => `${i + 1}. ${p}`),
    a.dica ? `Dica: ${a.dica}` : "",
    ...(a.faq ?? []).map((f) => `P: ${f.p} R: ${f.r}`),
  ].filter(Boolean).join("\n");
}
