# Máscaras de telefone, CPF e CNPJ

## Objetivo
Padronizar os campos de telefone e documento nos formulários, mantendo no banco um valor único e consistente.

## Implementação
- Criar um campo reutilizável de telefone com seletor de país, bandeira e código internacional.
- Separar visualmente o país do número local, mas salvar tudo junto no formato `+código+número` (por exemplo, `+5511999999999`).
- Reconhecer valores já cadastrados para preencher automaticamente o país e o telefone ao editar.
- Aplicar máscara local conforme o país selecionado, com validação de tamanho e apenas dígitos no número.
- Criar um campo reutilizável de CPF/CNPJ que detecta automaticamente pelo tamanho digitado:
  - CPF: `000.000.000-00`
  - CNPJ: `00.000.000/0000-00`
- Salvar CPF/CNPJ apenas com dígitos, evitando diferenças de formatação no banco.
- Aplicar os novos campos em Clientes, Usuários, Empresas e nos telefones das Instâncias de Empresa.
- Manter filtros e tabelas compatíveis com registros antigos, formatados ou não.

## Validação
- Conferir criação e edição com valores novos e existentes.
- Verificar o formulário em telas desktop e mobile.
- Confirmar que o projeto continua sem erros após as alterações.
