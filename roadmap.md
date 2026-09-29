# Roadmap

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
