# Tela de Atendimentos Omnichannel

Substituir o aviso atual de /atendimentos por um chat estilo WhatsApp Web em 3 colunas, ligado às tabelas existentes.

## Filtros (topo da lista)
- Instância: lista de `empresas_instancias` ativas (nome, telefone, tipo).
- Departamento: quadros de `kanban_nome`; usuário comum vê só os vinculados em `usuario_kanban`; Master vê todos da empresa do contexto.
- Atalhos: Minhas conversas, Aguardando, Em atendimento pela IA, Encerrados + busca por nome/telefone.

## Coluna 1 — Conversas
Foto, nome, última mensagem, horário, contador de não lidas, badge da instância e etiquetas coloridas.

## Coluna 2 — Chat
- Cabeçalho: foto, nome, departamento, instância, status e botão "Mover de etapa/Kanban".
- Balões: atendente/sistema em azul, cliente em cinza, nota interna em amarelo claro. Imagem, áudio, documento/PDF e figurinha.
- Rodapé: texto com emojis, anexo (bucket de arquivos), chave "Nota interna", atalho `/` com respostas rápidas de `empresas_notasrapidas`, botão "Assumir atendimento" (muda IA para Humano e grava `usuario_responsavel_id`).
- Envio: grava em `atendimentos_mensagem` com `instancia_id`; o n8n lê esse registro e envia pela Z-API usando instance_id, token e client_token da instância. Notas internas nunca são enviadas.

## Coluna 3 — CRM (ocultável)
Dados da pessoa (foto, nome, telefone, e-mail, estrelas, observações), participantes com "+ Convidar atendente", campos personalizados editáveis, etiquetas e card com etapa/orçamento ligado.

## Tempo real
Escuta de novas mensagens e mudanças de atendimento; chat e lista atualizam sem recarregar.

## Detalhes técnicos
- Nomes de colunas lidos pela RPC `listar_colunas_tabela` com `pick()` tolerante, como no resto do sistema.
- Componentes em `src/components/atendimentos/` (ConversaLista, ChatPainel, MensagemBalao, ChatComposer, ContatoPainel); consultas por atendimento selecionado via `?id=`.
- Emojis: pequeno seletor próprio (sem nova biblioteca pesada).
- Mobile: uma coluna por vez com botão de voltar.
- Script SQL em Files: habilitar realtime em `atendimentos_mensagem`/`atendimentos`, políticas de leitura/escrita e bucket de anexos, para rodar no SQL Editor.
- Envio direto à Z-API pelo navegador não é feito (exporia o token); fica com o n8n.
