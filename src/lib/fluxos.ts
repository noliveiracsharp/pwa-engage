/** Tipos e catálogo de blocos do Construtor Visual de Fluxos. */
export type TipoNo =
  | "gatilho"
  | "mensagem"
  | "menu"
  | "pergunta"
  | "condicao"
  | "horario"
  | "atraso"
  | "kanban"
  | "atribuir"
  | "campo"
  | "ia"
  | "transbordo"
  | "encerrar"
  | "subfluxo"
  | "http"
  | "codigo";

export type DadosNo = Record<string, unknown> & { titulo?: string };

export type CategoriaNo = "Gatilhos" | "Mensagens" | "Lógica" | "Kanban / CRM" | "Integrações" | "IA" | "Fim";

export const CATALOGO: { tipo: TipoNo; nome: string; categoria: CategoriaNo; descricao: string }[] = [
  { tipo: "gatilho", nome: "Início", categoria: "Gatilhos", descricao: "Mensagem recebida, palavra-chave ou novo contato" },
  { tipo: "mensagem", nome: "Enviar mensagem", categoria: "Mensagens", descricao: "Texto enviado ao cliente" },
  { tipo: "menu", nome: "Menu de opções", categoria: "Mensagens", descricao: "1 - Comercial, 2 - Suporte…" },
  { tipo: "pergunta", nome: "Pergunta", categoria: "Mensagens", descricao: "Aguarda resposta e guarda em variável" },
  { tipo: "condicao", nome: "Condição", categoria: "Lógica", descricao: "Se / Senão" },
  { tipo: "horario", nome: "Horário de atendimento", categoria: "Lógica", descricao: "Aberto / Fechado" },
  { tipo: "subfluxo", nome: "Executar outro fluxo", categoria: "Lógica", descricao: "Continua a conversa em outro fluxo" },
  { tipo: "codigo", nome: "Executar JavaScript", categoria: "Lógica", descricao: "Transforma dados e listas com código" },
  { tipo: "atraso", nome: "Aguardar", categoria: "Lógica", descricao: "Pausa em segundos" },
  { tipo: "kanban", nome: "Mover no Kanban", categoria: "Kanban / CRM", descricao: "Quadro e etapa destino" },
  { tipo: "atribuir", nome: "Atribuir atendente", categoria: "Kanban / CRM", descricao: "Departamento, roleta ou pessoa" },
  { tipo: "campo", nome: "Preencher campo", categoria: "Kanban / CRM", descricao: "Campo personalizado do contato" },
  { tipo: "http", nome: "Requisição HTTP / API", categoria: "Integrações", descricao: "Chama uma API e guarda a resposta" },
  { tipo: "ia", nome: "Perguntar à IA", categoria: "IA", descricao: "Responde com a base de conhecimento" },
  { tipo: "transbordo", nome: "Transferir p/ humano", categoria: "Fim", descricao: "Encerra o bot e avisa a equipe" },
  { tipo: "encerrar", nome: "Encerrar atendimento", categoria: "Fim", descricao: "Finaliza a conversa" },
];

export const nomeTipo = (t: TipoNo) => CATALOGO.find((c) => c.tipo === t)?.nome ?? t;

/** Opções do menu: uma por linha. */
export const opcoesMenu = (texto: unknown): string[] =>
  String(texto ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

/** Saídas (alças) de cada bloco. */
export function saidasDoNo(tipo: TipoNo, dados: DadosNo): { id: string; rotulo: string }[] {
  switch (tipo) {
    case "menu":
      return [
        ...opcoesMenu(dados["opcoes"]).map((o, i) => ({ id: `op-${i}`, rotulo: `${i + 1}. ${o}` })),
        { id: "invalida", rotulo: "Opção inválida" },
      ];
    case "condicao":
      return [{ id: "sim", rotulo: "Sim" }, { id: "nao", rotulo: "Não" }];
    case "horario":
      return [{ id: "aberto", rotulo: "Aberto" }, { id: "fechado", rotulo: "Fechado" }];
    case "ia":
      return [{ id: "respondeu", rotulo: "Respondeu" }, { id: "nao_sabe", rotulo: "Não soube" }];
    case "http":
      return [{ id: "sucesso", rotulo: "Sucesso" }, { id: "falha", rotulo: "Falha" }];
    case "codigo":
      return [{ id: "sucesso", rotulo: "Sucesso" }, { id: "erro", rotulo: "Erro" }];
    case "transbordo":
    case "encerrar":
    case "subfluxo":
      return [];
    default:
      return [{ id: "saida", rotulo: "" }];
  }
}

export const temEntrada = (tipo: TipoNo) => tipo !== "gatilho";

export function dadosPadrao(tipo: TipoNo): DadosNo {
  switch (tipo) {
    case "gatilho": return { gatilho: "mensagem_recebida" };
    case "mensagem": return { texto: "Olá! Seja bem-vindo." };
    case "menu": return { texto: "Como podemos ajudar?", opcoes: "Falar com Comercial\nFalar com Suporte" };
    case "pergunta": return { texto: "Qual é o seu nome?", variavel: "nome" };
    case "condicao": return { variavel: "", operador: "igual", valor: "" };
    case "horario": return { inicio: "08:00", fim: "18:00", dias: "seg,ter,qua,qui,sex" };
    case "atraso": return { segundos: 3 };
    case "atribuir": return { modo: "roleta" };
    case "transbordo": return { texto: "Vou te transferir para um atendente." };
    case "encerrar": return { texto: "Obrigado pelo contato!" };
    case "http": return { metodo: "GET", url: "https://", cabecalhos: "", corpo: "", variavel: "resposta" };
    case "codigo": return { codigo: "// input traz todas as variáveis (JSON já convertido)\nconst lista = (input.resposta?.itens ?? [])\n  .map((it, i) => `${i + 1}. ${it.nome}`)\n  .join(\"\\n\");\nreturn { lista };" };
    default: return {};
  }
}

/** Resumo exibido no corpo do bloco. */
export function resumoNo(tipo: TipoNo, d: DadosNo, nomes: { etapa?: string | undefined; quadro?: string | undefined; fluxo?: string | undefined }): string {
  switch (tipo) {
    case "subfluxo": return nomes.fluxo ? `→ ${nomes.fluxo}` : "Escolha o fluxo";
    case "gatilho":
      return d["gatilho"] === "palavra_chave" ? `Palavra-chave: ${d["palavras"] ?? "—"}` : d["gatilho"] === "novo_contato" ? "Novo contato" : "Mensagem recebida";
    case "mensagem": case "menu": case "pergunta": case "transbordo": case "encerrar":
      return String(d["texto"] ?? "");
    case "condicao": return `${d["variavel"] || "?"} ${d["operador"] ?? ""} ${d["valor"] ?? ""}`;
    case "horario": return `${d["inicio"]}–${d["fim"]} (${d["dias"]})`;
    case "atraso": return `${d["segundos"] ?? 0}s`;
    case "kanban": return nomes.quadro ? `${nomes.quadro} → ${nomes.etapa ?? "?"}` : "Escolha o quadro";
    case "atribuir": return d["modo"] === "roleta" ? "Roleta entre atendentes" : "Fila do departamento";
    case "campo": return `${d["chave"] || "?"} = ${d["valor"] ?? ""}`;
    case "http": return `${d["metodo"] ?? "GET"} ${d["url"] ?? ""} → {{${d["variavel"] || "resposta"}}}`;
    case "codigo": return String(d["codigo"] ?? "").split("\n").find((l) => l.trim() && !l.trim().startsWith("//")) ?? "Código";
    case "ia": return String(d["instrucoes"] ?? "Usa a base de conhecimento da empresa");
    default: return "";
  }
}
