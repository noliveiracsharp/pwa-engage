# Melhorias pontuais na Landing Page

Mantém layout, cores, componentes e rotas atuais. Só três ajustes.

## 1. Botões dos planos abrem o Checkout com o plano escolhido
- Hoje o botão "Começar Agora" já abre o modal de contratação com o plano. Renomear o botão para "Contratar Plano".
- O modal passa a guardar o ID do plano e mostrar um resumo (nome, preço mensal, usuários inclusos).
- A mensagem enviada ao WhatsApp de vendas inclui nome e ID do plano.
- Sem nova rota `/checkout` (roteamento intacto).

## 2. Botões de chamada (topo da página)
- "Ver Planos e Começar" continua rolando suavemente até os Planos (já funciona; confirmar).
- "Falar com Consultor" continua como botão secundário via WhatsApp.
- Adicionar abaixo dos cards de planos um link discreto: "Ficou com dúvidas? Fale no WhatsApp".

## 3. Seção de Dúvidas Frequentes
- Nova seção "Dúvidas Frequentes" (acordeão) entre o bloco final de chamada e o rodapé.
- Perguntas: Como funciona o teste grátis? Preciso de cartão? Posso ter vários usuários? Quanto custa um usuário adicional? Posso cancelar quando quiser? O suporte é em português?
- Adicionar "Dúvidas" no menu do topo, rolando até a seção.

## Detalhes técnicos
- Arquivo único: `src/components/landing/LandingPage.tsx`, usando `@/components/ui/accordion`.
- `ContratarDialog` recebe `plano` (já tem `id`); mensagem inclui `planoId`.
- Textos do FAQ são sugestões; o número de WhatsApp continua de exemplo até você enviar o real.
