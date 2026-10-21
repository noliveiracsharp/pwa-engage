# Roadmap

## Régua de Ofertas e WhatsApp
- [x] Configurar etapas e templates próprios com e-mail no padrão de cobrança.
- [x] Entregar envio agendado, interrupção por situação e histórico sem duplicidade.
- [x] Verificar WhatsApp nos campos de telefone e implementar consulta em lote dos cadastros autorizados.
- [ ] Ativar e consultar cadastros reais — depende de executar o SQL, atualizar cobranca-regua e publicar no banco próprio; sem sessão autenticada nesta execução.

## Ajuste atual
- [x] Avisos de projetos: preservar exclusões individuais e Limpar entre atualizações e recargas, com testes de regressão.
- [x] Situação das Ofertas usa as cores das etapas vinculadas na listagem e no formulário.
- [x] Cores por etapa e configuração do Kanban em painel lateral com campos organizados; seleção e dimensões verificadas com dados demonstrativos.
- [x] Padronizar dimensões dos painéis laterais de cadastro: 60% desktop, 100% tablet/celular.
- [x] Entregar SQL da cor e validar alterações.
- [ ] Habilitar persistência das cores no banco próprio — aguarda execução pelo usuário de atendeai-kanban-cores.sql.

## Concluído
- [x] Módulo de Orçamentos (/orcamentos): tabelas `orcamentos` + `orcamento_itens`, numeração automática #ano-seq, situação com cores, itens com memória de cálculo (custo, imposto, lucro), desconto R$/%, frete, adicionais e total líquido. (Aguarda o usuário rodar `atendeai-orcamentos.sql` e liberar a função /orcamentos ao perfil.)

## Em andamento
- [x] Orçamentos: observações complementares da nota fiscal, forma de pagamento + parcelamento automático, edição respeitando permissões do menu e visualização/PDF para o cliente.
- [x] Orçamentos: exibir logo, nome, CNPJ, endereço e telefone da empresa no PDF; marca nos itens do formulário e do PDF.
- [x] Orçamentos: itens em tabela compacta com "Adicionar item" ao final, botão Salvar item e Cancelar edição (descarta a linha nova ou restaura os valores anteriores).

## Próximos
- [ ] Duplicar orçamento (gera novo número com os mesmos itens).
- [ ] Filtro de Kanban por usuário (usuario_kanban) na tela /kanban.
- [ ] Tela de Atendimentos (chat estilo WhatsApp Web).

- [x] Dashboard por perfil (Meu trabalho, Projetos, Comercial, Compras, Atendimento) + aviso WhatsApp ao atribuir tarefa/atividade. (Aguarda `atendeai-dashboard-eventos.sql`.)

- [x] Fluxos: motor de execução no WhatsApp (aguarda atendeai-fluxos-motor.sql e "Ativar recebimento"); widget do site pendente
- [ ] Fluxos: base de conhecimento + nó de IA

- [x] Manutenções Fase 2: relatório público /os/token, assinatura e aviso WhatsApp (aguarda atendeai-manutencoes-fase2.sql)
- [ ] Manutenções Fase 3: cadastro de ativos, preventivas recorrentes e QR Code
- Financeiro: cadastro rápido de fornecedor/cliente, categorias no formulário, centro de custo em árvore
- [x] Financeiro: escolha do alcance ao editar novas séries manuais, com gravação atômica e testes.
- [ ] Ativar e testar edição recorrente com dados reais — aguarda usuário executar atendeai-financeiro-edicao-recorrente.sql no banco próprio.
- [x] Contas a Pagar: fatura de cartão agrupada (pai) com itens expansíveis (filhos) + modal

## CRM
- [x] Fase 1: origem do lead, motivo de perda, próxima ação no card
- [x] Fase 2a: linha do tempo da Oferta (notas + mudanças automáticas)
- [x] Fase 2b: captação de leads + roleta de vendedores
- [ ] Fase 3: metas por vendedor, forecast ponderado, relatório de perdas
