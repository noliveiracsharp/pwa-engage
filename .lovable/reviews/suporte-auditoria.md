# Regra de suporte
Encerrar precisa persistir o encerramento, retirar o chamado dos ativos e conservar o histórico. Uma escolha de unidade não é uma avaliação. Transferir para atendimento humano não depende de devolver ao robô. Documentos oficiais pertencem à empresa e são compartilhados somente por escolha do colaborador.

## Locais lidos nesta alteração
- Chat: botão Encerrar, spam, reabrir, assumir, mover departamento/etapa, cache e envio de anexos. Corrigidos estado persistido, confirmação da gravação e modo humano.
- Dados do contato: transferência para departamento/atendente e mudança de etapa. Corrigida seleção de etapa humana e reconhecimento de etapas finais.
- Lista Ativos/Aguardando/Equipe/Leads, Encerrados/Histórico e atualizações em tempo real: usam isEncerrado; a nova data passa a contar como encerramento.
- Dashboard: usa isEncerrado e encerrado_em para duração; herda a regra sem alterar métricas.
- Sino: botão e tarja recebem encerrado; já impedem aviso após fechar. O registro também desliga o sino em futuros encerramentos.
- Pesquisa: só envia após executar retornar sucesso. Chat agora confirma a linha salva antes de autorizar envio.
- Webhook: avaliação é executada antes dos fluxos; a versão anterior aceita o último chamado ainda aberto e consome a opção 1. Nova função não trata opções de chamados abertos como notas.
- Motor de fluxos e simulador: o simulador usa o mesmo motor; menus dinâmicos passam a aceitar conexões legadas ou encaminhar para humano, sem terminar silenciosamente.
- Funções SQL de ativos/busca, recebimento, ação encerrar, avaliação e cortesia: corrigidas para reconhecer encerramento sem etapa, preservando configurações existentes.
- Portal: exibe status e etapa retornados por portal_chamados, e já mostra data/hora nas mensagens. A definição instalada da consulta deve ser adaptada sem modificar autenticação.
- Documentos emitidos/modelos: mantidos separados da nova biblioteca oficial, evitando compartilhar contratos pessoais por engano.
- Biblioteca oficial: nova aba de upload por categoria, leitura com RLS e seleção múltipla no chat; arquivos privados são obtidos com link temporário e preparados como anexos da conversa.

## Verificação executada
- Testes de motor, encerramento e transferência: aprovados.
- SQL executado e reaplicado em PostgreSQL local: fecha sem etapa, interrompe avisos, retira dos ativos, mantém no histórico e não interpreta opção de unidade como avaliação.
- Navegador real: /atendimentos e /documentos redirecionaram para /login, sem erros de execução; sessão do banco externo indisponível.

## Limites da verificação
Funções realmente instaladas, automações externas, e-mail/WhatsApp e dados reais dependem de acesso ao banco próprio e publicação. Os scripts antigos em Files são referências, não prova da versão instalada. Nenhum registro histórico nem configuração de etapa é atualizado pelo novo script.