/** Central de Ajuda: guias padrão em linguagem simples + busca pura usada pela tela e pelo Copiloto. */
export type ArtigoAjuda = {
  id: string;
  modulo: string;
  titulo: string;
  resumo: string;
  rota?: string | undefined;
  perfil?: string | undefined;
  passos: string[];
  dica?: string | undefined;
  faq?: { p: string; r: string }[];
  video?: string | undefined;
  /** Print da tela (URL); exibido no guia com zoom ao clicar. */
  imagem?: string | undefined;
  tags?: string[];
};

export const MODULOS_AJUDA = [
  "Primeiros passos",
  "Atendimentos",
  "Ofertas",
  "Projetos",
  "Financeiro",
  "Suprimentos",
  "Manutenções",
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
  {
    id: "implantacao", modulo: "Primeiros passos", titulo: "Checklist de implantação (Primeiros passos)",
    resumo: "As 7 etapas para deixar sua empresa pronta para usar.", rota: "/dashboard", perfil: "Administrador",
    passos: [
      "No Dashboard, veja o quadro Primeiros passos da sua empresa.",
      "Cada etapa pendente tem um botão que leva direto à tela certa.",
      "A etapa é marcada sozinha assim que você conclui (ex.: cadastrar o primeiro cliente).",
      "Quando terminar, clique no X para dispensar o quadro.",
    ],
    tags: ["implantacao", "onboarding", "inicio", "configurar", "checklist"],
  },
  {
    id: "fin-importar-fatura", modulo: "Financeiro", titulo: "Importar fatura do cartão (PDF)",
    resumo: "Lance todas as compras do cartão de uma vez a partir do PDF do banco.", rota: "/financeiro",
    passos: [
      "Em Contas a Pagar, clique em Importar fatura (PDF).",
      "Escolha o cartão e envie o PDF baixado do banco.",
      "Confira as linhas, ajuste categorias e confirme.",
    ],
    dica: "O total importado deve bater com o total da fatura; se não bater, revise as linhas antes de confirmar.",
    tags: ["fatura", "cartao", "pdf", "importar"],
  },
  {
    id: "fin-importar-boleto", modulo: "Financeiro", titulo: "Importar boleto, conta ou nota fiscal",
    resumo: "Lance contas a pagar lendo o código de barras ou o XML da NF.", rota: "/financeiro",
    passos: [
      "Em Contas a Pagar, clique em Importar boleto / NF.",
      "Cole a linha digitável ou envie o XML/PDF.",
      "Confira fornecedor, vencimentos e valores e confirme.",
    ],
    tags: ["boleto", "nota", "nfe", "xml", "codigo de barras"],
  },
  {
    id: "fin-saldo-extrato", modulo: "Financeiro", titulo: "Saldo e extrato do banco em tempo real",
    resumo: "Consulte o saldo e as movimentações das contas ligadas ao banco.", rota: "/financeiro",
    passos: [
      "Em Financeiro, abra Contas Bancárias.",
      "Na conta integrada, clique em Atualizar saldo.",
      "Clique em Ver extrato e escolha o período (até 90 dias).",
      "No Controller, use Puxar saldo do banco para preencher o caixa de hoje.",
    ],
    tags: ["saldo", "extrato", "banco", "inter", "movimentacoes"],
  },
  {
    id: "fin-fale-controller", modulo: "Financeiro", titulo: "Fale com o Controller",
    resumo: "Pergunte sobre seus números e receba estimativas.", rota: "/financeiro",
    passos: [
      "Em Financeiro, abra a aba Controller.",
      "Abaixo do Parecer, escreva sua pergunta (ex.: estimativa de caixa para dezembro).",
      "Use Nova conversa para recomeçar.",
    ],
    dica: "A conversa não fica salva: copie a resposta se precisar guardar.",
    tags: ["controller", "ia", "pergunta", "estimativa", "caixa"],
  },
  {
    id: "fin-faturamento-misto", modulo: "Financeiro", titulo: "Faturamento misto (quem paga cada item)",
    resumo: "Uma Oferta, vários pagadores: administradora, condomínio, facilities…", rota: "/orcamentos",
    passos: [
      "Na Oferta, o Cliente é quem recebe o serviço.",
      "Em cada item, escolha em Faturar para quem paga aquele item.",
      "Ao ativar, o sistema gera uma cobrança separada para cada pagador.",
    ],
    tags: ["faturamento", "sacado", "pagador", "administradora", "condominio"],
  },
  {
    id: "parc-importar", modulo: "Administração", titulo: "Importar clientes e fornecedores (CSV) e ver no mapa",
    resumo: "Traga sua planilha e veja todos no mapa.", rota: "/parceiros",
    passos: [
      "Em Clientes e Fornecedores, clique em Importar e baixe o modelo.",
      "Preencha, envie o arquivo, confira e confirme.",
      "Marque os registros e use as ações em lote (CNPJ, WhatsApp, localização).",
      "Troque para Mapa para ver os pinos de cada cliente.",
    ],
    tags: ["importar", "csv", "planilha", "mapa", "lote", "cnpj"],
  },
  {
    id: "kanban-busca", modulo: "Ofertas", titulo: "Temperatura, busca e totais no Kanban",
    resumo: "Frio, Morno, Quente, Ganho e Perdido; busque cards rapidamente.", rota: "/kanban",
    passos: [
      "Na Oferta, escolha a Temperatura; o card fica colorido no Kanban.",
      "Ofertas ativadas ficam verdes (Ganho) e perdidas, cinza (Perdido).",
      "Use a busca no topo para achar por nome, número, telefone ou valor.",
      "Na engrenagem do quadro, ligue o totalizador e a temperatura.",
    ],
    tags: ["kanban", "temperatura", "busca", "total", "funil"],
  },
  {
    id: "atend-transcricao", modulo: "Atendimentos", titulo: "Transcrever áudios do WhatsApp",
    resumo: "Leia o que o cliente falou sem ouvir o áudio.", rota: "/atendimentos",
    passos: [
      "Abra a conversa e localize a mensagem de áudio.",
      "Clique em Transcrever áudio abaixo do player.",
    ],
    dica: "É preciso ter uma chave de IA cadastrada no cadastro da empresa.",
    tags: ["audio", "transcricao", "whatsapp", "voz"],
  },
  {
    id: "crm-proxima-acao", modulo: "Ofertas", titulo: "Próxima ação, origem do lead e motivo da perda",
    resumo: "Nunca deixe um negócio parado e saiba por que perdeu.", rota: "/orcamentos", perfil: "Vendedor",
    passos: [
      "Abra a Oferta e escolha a Origem do lead (Google Ads, Indicação, Site...).",
      "Em Próxima ação, escolha o tipo, a data/hora e descreva o que fazer.",
      "No Kanban o card avisa: vermelho = sem ação ou atrasada, amarelo = hoje, cinza = agendada.",
      "Ao marcar a Oferta como perdida, reprovada ou cancelada, informe o motivo da perda (obrigatório).",
    ],
    tags: ["crm", "proxima", "acao", "follow", "origem", "lead", "perda", "motivo", "atrasada"],
  },
  {
    id: "crm-timeline", modulo: "Ofertas", titulo: "Linha do tempo da Oferta",
    resumo: "Todo o histórico do negócio em um só lugar.", rota: "/orcamentos", perfil: "Vendedor",
    passos: [
      "Abra uma Oferta já salva e desça até Linha do tempo.",
      "Escolha o tipo (nota, ligação, reunião, visita, WhatsApp, e-mail), escreva e registre.",
      "Trocas de etapa, de situação e motivo de perda são anotadas sozinhas pelo sistema.",
    ],
    tags: ["crm", "timeline", "linha", "tempo", "historico", "nota", "interacao"],
  },
  {
    id: "crm-captacao", modulo: "Ofertas", titulo: "Captação de leads do site e roleta de vendedores",
    resumo: "Leads do site e anúncios entram sozinhos e vão para o vendedor certo.", rota: "/orcamentos", perfil: "Administrador",
    passos: [
      "Em Ofertas, clique em Captação de leads e depois em Gerar endereço.",
      "Copie o endereço (ou o modelo de formulário) e use no seu site ou ferramenta de anúncios.",
      "Em Usuários, ligue 'Participa da roleta de leads' para cada vendedor que deve receber.",
      "Cada lead vira cliente + Oferta em andamento, com ligação agendada em 1 hora.",
      "O vendedor recebe aviso com bip e no sino: 'Novo lead atribuído a você'.",
    ],
    dica: "Se suspeitar que o endereço vazou, use Trocar chave e atualize o site.",
    tags: ["crm", "lead", "captacao", "webhook", "site", "formulario", "roleta", "rodizio", "anuncio"],
  },
  {
    id: "crm-painel", modulo: "Ofertas", titulo: "Painel Comercial: metas, previsão e perdas",
    resumo: "Acompanhe metas por vendedor, previsão de vendas e por que os negócios se perdem.", rota: "/relatorios/comercial", perfil: "Gestor",
    passos: [
      "Em Relatórios, clique em Painel Comercial e escolha o mês.",
      "Digite a meta mensal de cada vendedor; a barra mostra o quanto já foi vendido.",
      "No funil, ajuste a probabilidade (%) de cada etapa; a previsão ponderada se atualiza.",
      "Veja os motivos de perda e as origens dos negócios do mês.",
    ],
    tags: ["crm", "meta", "forecast", "previsao", "painel", "comercial", "funil", "probabilidade", "perdas"],
  },
  {
    id: "oferta-baixa-estoque", modulo: "Ofertas", titulo: "Baixa automática no estoque ao ativar a Oferta",
    resumo: "Os produtos vendidos ou em comodato saem do estoque sozinhos na ativação.", rota: "/orcamentos", perfil: "Vendedor",
    passos: [
      "Abra a Oferta ganha e clique em Ativar.",
      "Deixe ligada a opção Dar baixa no estoque dos produtos.",
      "Escolha de qual local os produtos vão sair.",
      "Confirme: venda gera saída; comodato envia para o local do cliente.",
    ],
    dica: "Só entram produtos com controle de estoque ligado. A mesma Oferta não dá baixa duas vezes.",
    tags: ["estoque", "baixa", "ativacao", "comodato", "venda", "produto"],
  },
  {
    id: "contrato-sem-prazo", modulo: "Ofertas", titulo: "Contrato sem prazo de término",
    resumo: "Mensalidades geradas sempre 12 meses à frente, sem lançar à mão.", rota: "/orcamentos", perfil: "Financeiro",
    passos: [
      "Na Oferta, na parte de serviços mensais, ligue Contrato sem prazo de término.",
      "Ative a Oferta: as 12 primeiras mensalidades vão para Contas a Receber.",
      "Todo dia o sistema cria os meses que faltam para manter 12 à frente.",
      "Cada mês novo repete o valor e o pagador da última mensalidade.",
    ],
    dica: "Reajustes aplicados na última mensalidade passam para os meses seguintes.",
    tags: ["contrato", "mensalidade", "recorrente", "indeterminado", "mrr"],
  },
  {
    id: "receber-pedido", modulo: "Suprimentos", titulo: "Receber mercadoria do Pedido de Compra",
    resumo: "Entrada no estoque e contas a pagar do fornecedor de uma vez.", rota: "/cotacoes", perfil: "Compras",
    passos: [
      "Abra o pedido enviado e clique em Receber mercadoria.",
      "Escolha o local de destino para a entrada no estoque.",
      "Ligue Gerar contas a pagar e informe o 1º vencimento e as parcelas.",
      "Confirme: o pedido fica como recebido.",
    ],
    dica: "O sistema bloqueia entrada ou contas repetidas para o mesmo pedido.",
    tags: ["pedido", "compra", "recebimento", "estoque", "fornecedor", "contas a pagar"],
  },
  {
    id: "excluir-cascata", modulo: "Administração", titulo: "Por que não consigo apagar um cliente?",
    resumo: "Clientes com contas no Financeiro ou Ofertas não podem ser apagados.", rota: "/parceiros", perfil: "Todos",
    passos: [
      "Ao apagar uma Oferta, Atendimento ou Projeto, tudo o que pertence a ele sai junto.",
      "Se o cliente tiver contas ou Ofertas, o sistema avisa que ele está em uso.",
      "Nesse caso, inative o cadastro em vez de apagar.",
    ],
    tags: ["excluir", "apagar", "inativar", "cliente", "em uso"],
  },
  {
    id: "manu-ativos-cliente", modulo: "Manutenções", titulo: "Equipamentos organizados por cliente",
    resumo: "Cadastre todos os equipamentos de um cliente de uma vez e imprima as etiquetas QR Code.", rota: "/manutencoes", perfil: "Técnico / Gestor",
    passos: [
      "Abra Manutenções e vá na aba Equipamentos.",
      "A lista mostra cada cliente com a quantidade de equipamentos.",
      "Clique no cliente para abrir a lista completa dos equipamentos dele.",
      "Use Adicionar ou Duplicar para incluir vários equipamentos seguidos e salve.",
      "Use Imprimir etiquetas para gerar todos os QR Codes do cliente.",
    ],
    dica: "Duplicar copia marca, modelo e local — só troque o número de série.",
    tags: ["equipamento", "ativo", "qr code", "etiqueta", "cliente", "manutencao"],
  },
  {
    id: "manu-preventivas-cliente", modulo: "Manutenções", titulo: "Preventiva por cliente com checklist por equipamento",
    resumo: "Um plano por cliente gera uma única OS com todos os equipamentos.", rota: "/manutencoes", perfil: "Gestor",
    passos: [
      "Em Manutenções, abra a aba Preventivas e clique em Novo.",
      "Escolha o cliente: todos os equipamentos ativos dele são carregados.",
      "Para cada equipamento, escolha o checklist (o sistema sugere pela categoria).",
      "Use Aplicar padrão a todos para usar o mesmo checklist em tudo.",
      "Defina a frequência e salve. Na data, é gerada uma única OS da visita.",
    ],
    dica: "Cadastrou equipamento novo? Clique em Recarregar do cliente no plano.",
    faq: [{ p: "Vai gerar uma OS por equipamento?", r: "Não. É uma OS só, com o checklist separado por equipamento." }],
    tags: ["preventiva", "plano", "checklist", "os", "visita", "manutencao"],
  },
  {
    id: "manu-os-execucao", modulo: "Manutenções", titulo: "Executar a OS da visita",
    resumo: "Preencha o checklist de cada equipamento, anexe fotos e colha a assinatura.", rota: "/manutencoes", perfil: "Técnico",
    passos: [
      "Abra a OS em Manutenções.",
      "O checklist aparece agrupado com o nome de cada equipamento.",
      "Marque os itens, anote observações e anexe fotos.",
      "Colha a assinatura do responsável e finalize.",
      "Imprima ou compartilhe a OS pelo link.",
    ],
    tags: ["ordem de servico", "os", "executar", "assinatura", "foto", "tecnico"],
  },
  {
    id: "chat-interno-uso", modulo: "Atendimentos", titulo: "Chat da equipe: áudio, vídeo e colar imagem",
    resumo: "Converse com colegas e troque de conversa rápido pela barra lateral.", perfil: "Todos",
    passos: [
      "Abra o Chat da equipe e escolha um colega.",
      "A barra lateral com as fotos permite trocar de conversa com um clique.",
      "Clique no microfone para gravar áudio; clique de novo para enviar.",
      "Use o clipe para enviar vídeo, foto ou documento.",
      "Copiou uma imagem? Aperte Ctrl+V no campo de mensagem para enviar.",
    ],
    tags: ["chat", "equipe", "audio", "video", "colar", "imagem", "interno"],
  },
  {
    id: "chat-apagar-mensagens", modulo: "Atendimentos", titulo: "Apagar mensagem ou arquivo no chat da equipe",
    resumo: "Remova mensagens, imagens, vídeos ou documentos que você enviou.", perfil: "Todos",
    passos: [
      "Passe o mouse sobre a sua mensagem.",
      "Clique no ícone da lixeira.",
      "Confirme. A mensagem e o arquivo somem para todos.",
    ],
    dica: "Só é possível apagar mensagens enviadas por você.",
    tags: ["apagar", "excluir", "mensagem", "chat", "arquivo"],
  },
  {
    id: "tarefas-delegar-chat", modulo: "Projetos", titulo: "Criar tarefa para um colega pelo chat",
    resumo: "Delegue uma tarefa sem sair da conversa e apague se não precisar mais.", perfil: "Todos",
    passos: [
      "Abra a conversa com o colega no Chat da equipe.",
      "Clique no ícone de prancheta no topo da conversa.",
      "O colega já vem como responsável: preencha título e prazo e salve.",
      "Ele recebe um aviso no chat.",
      "Na aba Tarefas, você pode apagar as tarefas que criou (para você ou outra pessoa).",
    ],
    tags: ["tarefa", "delegar", "chat", "apagar", "responsavel"],
  },
  {
    id: "vars-dinamicas", modulo: "Administração", titulo: "Variáveis {{...}} nas mensagens",
    resumo: "Digite {{ para escolher dados do cliente ou criar suas próprias variáveis.", perfil: "Todos",
    passos: [
      "Em qualquer texto de mensagem automática, digite {{ .",
      "Uma lista de variáveis aparece; use as setas e Enter para escolher.",
      "Também pode clicar no botão Variável ao lado do campo.",
      "Não achou? Clique em + Criar nova variável e informe nome e valor.",
      "No envio, a variável é trocada pelo valor real.",
    ],
    tags: ["variavel", "variaveis", "modelo", "mensagem", "texto", "personalizada"],
  },
  {
    id: "fluxos-vars-http", modulo: "Atendimentos", titulo: "Variáveis em Fluxos e chamadas de API",
    resumo: "Use dados do contato e de blocos anteriores em URLs, cabeçalhos e corpo.", rota: "/fluxos", perfil: "Administrador",
    passos: [
      "Abra Fluxos e edite o bloco desejado (HTTP, Mensagem, Condição…).",
      "Digite {{ em qualquer campo para ver as variáveis disponíveis.",
      "A lista traz dados do contato, respostas de Perguntas e resultados de blocos anteriores.",
      "No bloco HTTP, a resposta fica disponível como {{resposta}} para os próximos blocos.",
    ],
    tags: ["fluxo", "api", "http", "webhook", "variavel", "integracao"],
  },
  {
    id: "fin-dre-gerencial", modulo: "Financeiro", titulo: "DRE Gerencial Consolidado",
    resumo: "Receitas, custos e resultado mês a mês, por competência ou caixa.", rota: "/relatorios/dre-gerencial", perfil: "Gestor",
    passos: [
      "Abra Relatórios > DRE Gerencial.",
      "Escolha o período De/Até e o regime (Competência ou Caixa).",
      "Filtre por centro de custo se quiser.",
      "Veja os indicadores no topo e a tabela por mês.",
      "Clique em Imprimir para gerar o documento A4 com a logo da empresa.",
    ],
    tags: ["dre", "resultado", "relatorio", "lucro", "competencia", "caixa"],
  },
  {
    id: "fin-rateio-centros", modulo: "Financeiro", titulo: "Rateio por plano de contas e centro de custo",
    resumo: "Divida um lançamento entre várias contas e centros de custo.", rota: "/financeiro", perfil: "Financeiro",
    passos: [
      "Abra o lançamento em Contas a Receber ou a Pagar.",
      "Na parte de itens, inclua uma linha para cada conta/centro de custo.",
      "Informe valor ou percentual de cada linha e salve.",
      "Títulos vindos de Oferta ou Cotação já trazem os itens automaticamente.",
    ],
    tags: ["rateio", "centro de custo", "plano de contas", "itens"],
  },
  {
    id: "fin-posicao-serie", modulo: "Financeiro", titulo: "Começar uma série a partir da parcela X",
    resumo: "Lance um contrato já em andamento, ex.: parcela 2 de 5.", rota: "/financeiro", perfil: "Financeiro",
    passos: [
      "Abra o lançamento recorrente ou parcelado.",
      "Use a opção Aplicar X de Y e informe a posição (ex.: 2 de 5).",
      "As parcelas anteriores são criadas como pagas e as seguintes em aberto.",
      "Ao editar uma parcela, o sistema pergunta se altera só ela ou a série.",
    ],
    dica: "Nomes como \"Aluguel 10/2026\" são tratados como data, não como parcela.",
    tags: ["serie", "parcela", "recorrencia", "posicao"],
  },
  {
    id: "sup-cotacao-aprovacao", modulo: "Suprimentos", titulo: "Comparar cotações e aprovar",
    resumo: "Veja o fornecedor mais barato e o melhor preço item a item.", rota: "/cotacoes", perfil: "Compras",
    passos: [
      "Abra a cotação e clique em Preencher no fornecedor para lançar os preços.",
      "Os quadros Fornecedor único mais barato e Melhor preço item a item são calculados.",
      "Clique em Aprovar e gerar oferta.",
      "Se o valor passar do mínimo configurado, segue para aprovação formal (ícone de escudo).",
    ],
    faq: [{ p: "Aprovou direto sem passar por mim, por quê?", r: "O valor ficou abaixo do mínimo da regra de aprovação." }],
    tags: ["cotacao", "fornecedor", "aprovacao", "alcada", "compras"],
  },
  {
    id: "adm-permissoes-secoes", modulo: "Administração", titulo: "Permissão por aba dentro de uma tela",
    resumo: "Libere ou bloqueie partes de uma tela (ex.: Dados, Documentos) por perfil.", rota: "/funcoes", perfil: "Administrador",
    passos: [
      "Abra Funções e expanda a tela desejada (ex.: Empresas).",
      "Cada aba aparece como item filho (Dados, Etiquetas, Documentos…).",
      "Em Perfis, marque ler, criar, editar e excluir para cada aba.",
      "Peça para o usuário sair e entrar de novo para valer.",
    ],
    tags: ["permissao", "perfil", "aba", "secao", "funcoes", "acesso"],
  },
  {
    id: "adm-etiquetas-kanban", modulo: "Administração", titulo: "Etiquetas por quadro Kanban",
    resumo: "Crie etiquetas só para Ofertas, Suporte etc. ou globais.", rota: "/empresas", perfil: "Administrador",
    passos: [
      "Em Empresas, abra a aba Etiquetas.",
      "Crie a etiqueta e escolha o Quadro (Kanban).",
      "Deixe sem quadro para ela valer em todos.",
    ],
    tags: ["etiqueta", "kanban", "quadro", "tag"],
  },
  {
    id: "fin-boleto-config", modulo: "Financeiro", titulo: "Configurar a emissão de boletos (Banco Inter)",
    resumo: "Ligue a conta do banco para emitir boleto com Pix e baixa automática.", rota: "/financeiro", perfil: "Financeiro / Administrador",
    passos: [
      "No Internet Banking PJ do Inter, crie uma integração (API) e baixe o Client ID, Client Secret e os certificados .crt e .key.",
      "Em Financeiro → Contas Bancárias, edite a conta do Inter e informe esses dados na integração bancária.",
      "Cadastre multa, juros e as tarifas do boleto na mesma conta.",
      "Para testar, abra um título em Contas a Receber, clique em Cobrança e emita o boleto.",
      "Use Baixar PDF do boleto para ver exatamente como o cliente vai receber.",
    ],
    dica: "O boleto do Inter já vem com QR Code Pix; quando o cliente paga, o título é baixado sozinho.",
    faq: [{ p: "Posso juntar produto e serviço num boleto só?", r: "Sim. O padrão é um boleto por parcela; o valor fica separado por dentro (rateio) para as notas fiscais." }],
    tags: ["boleto", "inter", "banco", "cobranca", "pix", "certificado", "emitir", "api"],
  },
  {
    id: "fin-nota-config", modulo: "Financeiro", titulo: "Configurar notas fiscais (Focus NFe) e certificado A1",
    resumo: "Contrate o emissor, envie o certificado A1, teste em homologação e depois vá para produção.", rota: "/financeiro", perfil: "Financeiro / Administrador",
    passos: [
      "Crie a conta no Focus NFe (bom custo-benefício: cobra por nota, atende NF-e e NFS-e na maioria das prefeituras).",
      "No painel do Focus NFe, cadastre a empresa e envie o certificado digital A1 (arquivo .pfx e a senha). O certificado fica guardado no emissor, não no sistema.",
      "Copie o token de HOMOLOGAÇÃO do Focus NFe.",
      "Em Financeiro → Régua de Cobrança → Nota fiscal, cole o token, escolha Ambiente: Homologação e preencha inscrição municipal, código IBGE, item LC 116 e alíquota ISS.",
      "Confira se clientes têm CPF/CNPJ e endereço e se os produtos têm NCM — sem isso a nota é recusada.",
      "Emita uma nota de teste; quando sair autorizada, troque para o token e ambiente de Produção.",
    ],
    dica: "Nota de produto (NF-e) e de serviço (NFS-e) são sempre separadas, mesmo com boleto único.",
    faq: [{ p: "A nota foi recusada", r: "Leia a mensagem do emissor: normalmente falta NCM, CNPJ/CPF, endereço do cliente ou o item LC 116 não é aceito pela prefeitura." }],
    tags: ["nota", "fiscal", "nfe", "nfse", "focus", "certificado", "a1", "homologacao", "producao", "prefeitura", "iss"],
  },
  {
    id: "fin-envio-automatico", modulo: "Financeiro", titulo: "Envio automático de boleto e nota ao cliente",
    resumo: "A Régua de Cobrança emite e envia boleto e nota por e-mail/WhatsApp sozinha.", rota: "/financeiro", perfil: "Financeiro",
    passos: [
      "Configure o e-mail da empresa em Empresas → E-mail (servidor SMTP) e teste o envio.",
      "Abra Financeiro → Régua de Cobrança e ligue a régua; escolha o horário diário.",
      "Em Boleto, escolha quando emitir: X dias antes do vencimento ou num dia fixo do mês.",
      "Em Nota fiscal, escolha: junto com o boleto ou quando o cliente pagar.",
      "Monte as etapas de lembrete (antes, no dia e depois do vencimento) e use Visualizar modelo.",
    ],
    dica: "O cliente recebe um link único da fatura com boleto, Pix e a nota fiscal juntos.",
    tags: ["regua", "automatico", "envio", "email", "whatsapp", "lembrete", "boleto", "nota"],
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

/** Guia vindo do banco; `chave` aponta para o guia oficial que ele personaliza. */
export type ArtigoBanco = ArtigoAjuda & { chave?: string | undefined; dbId: string };

/** Junta guias oficiais e personalizações: registro com chave igual substitui o oficial; sem chave vira guia novo. */
export function mesclarArtigos(oficiais: ArtigoAjuda[], banco: ArtigoBanco[]): ArtigoAjuda[] {
  const porChave = new Map(banco.filter((b) => b.chave).map((b) => [b.chave as string, b]));
  const base = oficiais.map((o) => {
    const b = porChave.get(o.id);
    return b ? ({ ...o, ...b, id: o.id, faq: o.faq, tags: b.tags?.length ? b.tags : o.tags } as ArtigoAjuda) : o;
  });
  const ids = new Set(oficiais.map((o) => o.id));
  return [...base, ...banco.filter((b) => !b.chave || !ids.has(b.chave))];
}
