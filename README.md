# Customer Hub

Construa o frontend do Atende.ai, um sistema de suporte e atendimento multicanal PWA e Multi-empresas (Multi-tenant).

1. Stack e Conexão de Dados:

Não utilize o Lovable Cloud. O banco de dados já está criado em um Supabase próprio. Você deve gerar as integrações (Supabase Client) assumindo que as tabelas e a view de menu já existem.

Utilize o sistema de autenticação nativo do Supabase (auth.users) para o login e relacione com a tabela usuarios existente.

2. Design System e Layout Base:

Responsividade: O sistema deve ser um PWA, 100% responsivo para Desktop, Tablets e Smartphones.

Temas e White-label: Suporte nativo a Modo Claro (Light) e Modo Escuro (Dark). O sistema deve buscar a logo e o título da tabela empresas para personalizar a interface. Basea-se nas cores do site https://conectcon.com para tema inicial.

Header: Logo da empresa no canto esquerdo. Avatar do usuário logado no canto direito com dropdown para "Meus Dados" e "Sair" (Logout).

Sidebar (Menu): Padrão hambúrguer, iniciando sempre fechado. Quando fechado, exibe apenas os ícones (com descrição via tooltip no hover). Ao clicar, expande. Os itens do menu devem ser montados dinamicamente consumindo a view vw_menu_usuario_perfil já existente no banco.

Padrão de Tabelas (CRUDs): Todas as telas de listagem devem ter paginação (10, 50, 100 linhas), ordenação nas colunas e barra superior com filtros específicos. Devem conter um botão superior de "+ Adicionar" e um ícone de "Lápis" em cada linha para edição.

3. Telas e Funcionalidades:

Tela de Login: Autenticação por e-mail e senha (com ícone de olho para revelar senha). No desktop, divida a tela ao meio: lado esquerdo com imagem institucional, lado direito com o formulário de login e botão "Esqueci a Senha" (que deve acionar o reset de senha do Supabase). No mobile, centralize o formulário.

Dashboard: Cards com total de clientes, total de usuários, usuários ativos no momento, atendimentos com IA, em atendimento e encerrados (com filtros de mês atual e últimos 12 meses). Inclua dois gráficos de barras: atendimentos por dia e atendimentos por mês.

Empresas: Tabela padrão. Formulário deve permitir gerenciar as instâncias atreladas (empresas_instancias) e criar campos personalizados (empresas_camposperson).

Clientes: Tabela padrão com filtros (telefone, nome, email, cpf, status, nota).

Usuários: Tabela padrão com filtros (nome, email, telefone, cpf, status, perfil).

Funções: Tabela padrão com filtros (descrição, menu ativo, status).

Kanban: No topo, um select para escolher o Kanban (kanban_nome) e um botão de "+" para criar novos. Abaixo, exiba as colunas (kanban_etapas). Se não houver etapas, permita a criação na própria tela. Implemente Drag-and-Drop (arrastar e soltar) para os cards de atendimento. Clicar em um card deve abrir o atendimento.

Atendimentos (Chat): Interface idêntica ao WhatsApp Web.

Recursos: Envio de áudio, vídeos, anexos.

Notas Rápidas: Ao digitar a tecla \ no input de mensagem, abra um menu suspenso para escolher textos da tabela empresas_notasrapidas.

Mensagem Interna: Um botão/toggle (checkbox) para marcar a mensagem como msg_interna. Se ativado, a mensagem enviada deve ter uma cor de fundo destacada no chat para indicar que o cliente não a verá.

Sidebar Direita: Um painel lateral direito (que pode ser aberto/fechado pelo usuário) contendo a foto, nome, telefone, e-mail, observações do cliente, e os campos dinâmicos originados de empresas_camposperson.

Avaliação: Permita que o usuário logado avalie o cliente com estrelas (0 a 5) neste mesmo painel.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pwa-engage.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cb30df15-fe46-4933-9577-a1ed60e4621f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
