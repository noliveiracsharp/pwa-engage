/**
 * Motor de execução dos fluxos (função pura): recebe o grafo salvo pelo construtor,
 * o estado atual da conversa e o texto do cliente; devolve as ações a executar e o novo estado.
 */
import { opcoesMenu, type DadosNo, type TipoNo } from "@/lib/fluxos";

export type NoFluxo = { id: string; type?: string; data: DadosNo & { tipo?: TipoNo } };
export type ConexaoFluxo = { source: string; target: string; sourceHandle?: string | null };
export type EstadoExec = { no_atual: string | null; status: "ativo" | "aguardando" | "finalizado" | "transbordo"; variaveis: Record<string, string> };

export type Acao =
  | { tipo: "mensagem"; texto: string; midiaUrl?: string; midiaTipo?: "imagem" | "video" | "documento"; nomeArquivo?: string; lista?: { titulo: string; botao: string; opcoes: string[] } }
  | { tipo: "etapa"; etapa_id: string; prioridade?: string | undefined }
  | { tipo: "modo"; modo: "Humano" | "IA" }
  | { tipo: "campo"; chave: string; valor: string }
  | { tipo: "encerrar" }
  | { tipo: "atraso"; segundos: number };

const tipoDe = (n: NoFluxo): TipoNo => (n.data?.tipo ?? n.type) as TipoNo;
const str = (v: unknown) => (v == null ? "" : String(v));
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Converte valores guardados como texto JSON ("{...}" ou "[...]") de volta em objeto/lista. */
export function valorVar(v: string | undefined): unknown {
  if (v == null) return undefined;
  const t = v.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { return JSON.parse(t); } catch { return v; }
  }
  return v;
}

/** Lê "resposta.itens.0.nome" percorrendo o JSON guardado na variável. */
export function lerCaminho(vars: Record<string, string>, caminho: string): unknown {
  if (caminho in vars) return valorVar(vars[caminho]);
  const [raiz, ...resto] = caminho.split(".");
  let atual: unknown = valorVar(vars[raiz ?? ""]);
  for (const k of resto) {
    if (atual == null || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[k];
  }
  return atual;
}

export const paraTexto = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function interpolar(texto: string, vars: Record<string, string>) {
  // "\\n" literal (vindo de JSON/JavaScript) vira quebra de linha real no WhatsApp.
  return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => paraTexto(lerCaminho(vars, k))).replace(/\\r\\n|\\n/g, "\n");
}

/** Próximo bloco ligado à saída `handle` de `de`. */
export function proximoNoId(conexoes: ConexaoFluxo[], de: string, handle: string) {
  return conexoes.find((e) => e.source === de && (e.sourceHandle ?? "saida") === handle)?.target ?? null;
}

export function textoMenu(d: DadosNo) {
  const ops = opcoesMenu(d["opcoes"]).map((o, i) => `${i + 1}. ${o}`);
  return [str(d["texto"]), ...ops].filter(Boolean).join("\n");
}

/** Opções do menu com variáveis resolvidas (permite lista vinda de {{variavel}}). */
export function menuInterpolado(d: DadosNo, vars: Record<string, string>): DadosNo {
  return { ...d, opcoes: interpolar(str(d["opcoes"]), vars) };
}

/** Qual opção do menu o cliente escolheu: número ("2", "2.") ou o texto da opção. */
export function escolhaMenu(d: DadosNo, resposta: string): number {
  const ops = opcoesMenu(d["opcoes"]);
  const r = norm(resposta);
  const num = r.match(/^(\d+)/);
  if (num) {
    const i = Number(num[1]) - 1;
    return i >= 0 && i < ops.length ? i : -1;
  }
  return ops.findIndex((o) => norm(o) === r || (r.length >= 3 && norm(o).includes(r)));
}

/** Dentro do horário? dias "seg,ter,..." e horas "08:00"–"18:00" no fuso de São Paulo. */
export function dentroHorario(d: DadosNo, agora: Date) {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora);
  const dia = norm(partes.find((p) => p.type === "weekday")?.value ?? "").slice(0, 3);
  const hh = partes.find((p) => p.type === "hour")?.value ?? "00";
  const mm = partes.find((p) => p.type === "minute")?.value ?? "00";
  const atual = `${hh === "24" ? "00" : hh}:${mm}`;
  const dias = str(d["dias"]).split(",").map((s) => norm(s).slice(0, 3)).filter(Boolean);
  if (dias.length && !dias.includes(dia)) return false;
  const ini = str(d["inicio"]) || "00:00";
  const fim = str(d["fim"]) || "23:59";
  return atual >= ini && atual <= fim;
}

function avaliarCondicao(d: DadosNo, vars: Record<string, string>) {
  const v = norm(paraTexto(lerCaminho(vars, str(d["variavel"]))));
  const alvo = norm(str(d["valor"]));
  switch (str(d["operador"])) {
    case "diferente": return v !== alvo;
    case "contem": return v.includes(alvo);
    case "vazio": return v === "";
    case "preenchido": return v !== "";
    default: return v === alvo;
  }
}

export function executarFluxo(p: {
  nos: NoFluxo[];
  conexoes: ConexaoFluxo[];
  estado: EstadoExec | null;
  texto: string;
  agora?: Date;
}): { acoes: Acao[]; estado: EstadoExec; subfluxo?: string; externo?: { no: NoFluxo }; trilha?: string[] } {
  const agora = p.agora ?? new Date();
  const acoes: Acao[] = [];
  const vars: Record<string, string> = { ...(p.estado?.variaveis ?? {}), ultima_mensagem: p.texto };
  const porId = new Map(p.nos.map((n) => [n.id, n]));
  const proximo = (de: string, handle?: string) => {
    const c = p.conexoes.find((e) => e.source === de && (!handle || (e.sourceHandle ?? "saida") === handle))
      ?? (handle ? undefined : p.conexoes.find((e) => e.source === de));
    return c ? porId.get(c.target) : undefined;
  };
  const trilha: string[] = [];
  const fim = (status: EstadoExec["status"], no: string | null = null) => ({ acoes, trilha, estado: { no_atual: no, status, variaveis: vars } });

  let atual: NoFluxo | undefined;
  if (p.estado?.status === "aguardando" && p.estado.no_atual) {
    const esperando = porId.get(p.estado.no_atual);
    if (!esperando) return fim("finalizado");
    const d = esperando.data;
    trilha.push(esperando.id);
    if (tipoDe(esperando) === "ia") {
      // Conversa contínua com a IA: cada nova mensagem volta ao bloco.
      return { ...fim("ativo", esperando.id), externo: { no: esperando } };
    }
    if (tipoDe(esperando) === "menu") {
      const d = menuInterpolado(esperando.data, vars);
      const i = escolhaMenu(d, p.texto);
      if (i < 0) {
        atual = proximo(esperando.id, "invalida");
        if (!atual) {
          acoes.push({ tipo: "mensagem", texto: `Opção inválida.\n${interpolar(textoMenu(d), vars)}` });
          return fim("aguardando", esperando.id);
        }
      } else {
        vars["opcao"] = opcoesMenu(d["opcoes"])[i] ?? "";
        atual = proximo(esperando.id, `op-${i}`);
      }
    } else {
      const variavel = str(d["variavel"]);
      if (variavel) vars[variavel] = p.texto;
      if (variavel && d["salvar_campo"] !== false) acoes.push({ tipo: "campo", chave: variavel, valor: p.texto });
      atual = proximo(esperando.id);
    }
  } else if (p.estado?.status === "ativo" && p.estado.no_atual) {
    // Retomada após um bloco externo (HTTP/JavaScript) executado pelo servidor.
    atual = porId.get(p.estado.no_atual);
  } else {
    const inicio = p.nos.find((n) => tipoDe(n) === "gatilho");
    atual = inicio ? proximo(inicio.id) : undefined;
  }

  for (let passos = 0; atual && passos < 60; passos++) {
    const d = atual.data;
    trilha.push(atual.id);
    switch (tipoDe(atual)) {
      case "mensagem": {
        const midiaUrl = interpolar(str(d["midia_url"]), vars).trim();
        const mt = str(d["midia_tipo"]);
        acoes.push({
          tipo: "mensagem", texto: interpolar(str(d["texto"]), vars),
          ...(midiaUrl && (mt === "imagem" || mt === "video" || mt === "documento") ? { midiaUrl, midiaTipo: mt, ...(str(d["midia_nome"]) ? { nomeArquivo: str(d["midia_nome"]) } : {}) } : {}),
        });
        atual = proximo(atual.id);
        break;
      }
      case "menu": {
        const dm = menuInterpolado(d, vars);
        const ops = opcoesMenu(dm["opcoes"]);
        if (str(d["formato"]) === "lista" && ops.length) {
          acoes.push({ tipo: "mensagem", texto: interpolar(str(d["texto"]), vars), lista: { titulo: interpolar(str(d["lista_titulo"]) || "Opções", vars), botao: interpolar(str(d["lista_botao"]) || "Ver opções", vars), opcoes: ops } });
        } else acoes.push({ tipo: "mensagem", texto: interpolar(textoMenu(dm), vars) });
        return fim("aguardando", atual.id);
      }
      case "pergunta":
        acoes.push({ tipo: "mensagem", texto: interpolar(str(d["texto"]), vars) });
        return fim("aguardando", atual.id);
      case "condicao":
        atual = proximo(atual.id, avaliarCondicao(d, vars) ? "sim" : "nao");
        break;
      case "horario":
        atual = proximo(atual.id, dentroHorario(d, agora) ? "aberto" : "fechado");
        break;
      case "atraso":
        acoes.push({ tipo: "atraso", segundos: Math.min(Math.max(Number(d["segundos"]) || 0, 0), 15) });
        atual = proximo(atual.id);
        break;
      case "kanban":
        if (str(d["etapa_id"])) acoes.push({ tipo: "etapa", etapa_id: str(d["etapa_id"]), prioridade: str(d["prioridade"]) || undefined });
        atual = proximo(atual.id);
        break;
      case "atribuir":
        acoes.push({ tipo: "modo", modo: "Humano" });
        atual = proximo(atual.id);
        break;
      case "campo":
        if (str(d["chave"])) acoes.push({ tipo: "campo", chave: str(d["chave"]), valor: interpolar(str(d["valor"]), vars) });
        atual = proximo(atual.id);
        break;
      case "transbordo":
        if (str(d["texto"])) acoes.push({ tipo: "mensagem", texto: interpolar(str(d["texto"]), vars) });
        acoes.push({ tipo: "modo", modo: "Humano" });
        return fim("transbordo");
      case "encerrar":
        if (str(d["texto"])) acoes.push({ tipo: "mensagem", texto: interpolar(str(d["texto"]), vars) });
        acoes.push({ tipo: "encerrar" });
        return fim("finalizado");
      case "http":
      case "codigo":
      case "ia":
        // Executado fora do motor (precisa de rede/sandbox/IA); o servidor retoma depois.
        return { ...fim("ativo", atual.id), externo: { no: atual } };
      case "subfluxo":
        if (str(d["fluxo_id"])) return { ...fim("finalizado"), subfluxo: str(d["fluxo_id"]) };
        atual = undefined;
        break;
      default:
        atual = proximo(atual.id);
    }
  }
  return fim("finalizado");
}
