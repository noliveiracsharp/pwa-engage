import { supabase } from "@/integrations/supabase/client";
import { comprimirImagem } from "@/lib/image-compress";

export type TipoResposta = "cnc" | "numero";
export type ItemModelo = { texto: string; tipo: TipoResposta; unidade?: string | undefined };
export type ItemChecklist = ItemModelo & { resposta?: "C" | "NC" | "NA" | null; valor?: string; obs?: string };
export type Anexo = { url: string; nome: string; grupo: "antes" | "depois" | "documento" };

export const TIPOS = [
  { value: "preventiva", label: "Preventiva", cls: "bg-primary/15 text-primary" },
  { value: "corretiva", label: "Corretiva", cls: "bg-destructive/15 text-destructive" },
  { value: "preditiva", label: "Preditiva", cls: "bg-warning/15 text-warning" },
];
export const PRIORIDADES = [
  { value: "baixa", label: "Baixa", horas: 72 },
  { value: "normal", label: "Normal", horas: 48 },
  { value: "alta", label: "Alta", horas: 24 },
  { value: "urgente", label: "Urgente", horas: 4 },
];
export const STATUS = [
  { value: "agendada", label: "Agendada", cls: "bg-muted text-muted-foreground" },
  { value: "em_execucao", label: "Em execução", cls: "bg-primary/15 text-primary" },
  { value: "pendente", label: "Pendente", cls: "bg-warning/15 text-warning" },
  { value: "concluida", label: "Concluída", cls: "bg-success/15 text-success" },
  { value: "cancelada", label: "Cancelada", cls: "bg-destructive/15 text-destructive" },
];
export const meta = <T extends { value: string }>(lista: T[], v: unknown) => lista.find((x) => x.value === v) ?? lista[0]!;

/** Modelos padrão oferecidos para importar quando a empresa ainda não tem nenhum. */
export const MODELOS_PADRAO: { nome: string; categoria: string; itens: ItemModelo[] }[] = [
  {
    nome: "Preventiva — Portões e Controle de Acesso", categoria: "Portões",
    itens: [
      { texto: "Fim de curso de abertura e fechamento", tipo: "cnc" },
      { texto: "Lubrificação de cremalheira/roldanas", tipo: "cnc" },
      { texto: "Teste do sensor anti-esmagamento", tipo: "cnc" },
      { texto: "Reaperto de bornes e conexões", tipo: "cnc" },
      { texto: "Tensão da bateria do nobreak", tipo: "numero", unidade: "V" },
    ],
  },
  {
    nome: "Preventiva — CFTV", categoria: "CFTV",
    itens: [
      { texto: "Limpeza de lentes e cúpulas", tipo: "cnc" },
      { texto: "Foco e ângulo das câmeras", tipo: "cnc" },
      { texto: "Gravação do DVR/NVR funcionando", tipo: "cnc" },
      { texto: "Dias de gravação disponíveis", tipo: "numero", unidade: "dias" },
      { texto: "Tensão da fonte", tipo: "numero", unidade: "V" },
    ],
  },
  {
    nome: "Preventiva — Alarme e Cerca Elétrica", categoria: "Alarme",
    itens: [
      { texto: "Teste de todos os sensores/zonas", tipo: "cnc" },
      { texto: "Sirene e comunicação com central", tipo: "cnc" },
      { texto: "Fios e isoladores da cerca", tipo: "cnc" },
      { texto: "Tensão de saída da cerca", tipo: "numero", unidade: "kV" },
    ],
  },
  {
    nome: "Corretiva — Atendimento Geral", categoria: "Geral",
    itens: [
      { texto: "Defeito relatado confirmado no local", tipo: "cnc" },
      { texto: "Causa identificada e corrigida", tipo: "cnc" },
      { texto: "Teste final com o responsável", tipo: "cnc" },
    ],
  },
];

export const checklistDoModelo = (itens: unknown): ItemChecklist[] =>
  (Array.isArray(itens) ? (itens as ItemModelo[]) : []).map((i) => ({ texto: i.texto, tipo: i.tipo ?? "cnc", unidade: i.unidade, resposta: null, valor: "", obs: "" }));

/** Progresso = itens respondidos / total; não conformes contados à parte. */
export function resumoChecklist(itens: ItemChecklist[]) {
  const total = itens.length;
  const respondidos = itens.filter((i) => (i.tipo === "numero" ? String(i.valor ?? "").trim() !== "" : !!i.resposta)).length;
  const naoConformes = itens.filter((i) => i.resposta === "NC").length;
  return { total, respondidos, naoConformes, pct: total ? Math.round((respondidos / total) * 100) : 0 };
}

/** Prazo de SLA a partir da abertura e prioridade. */
export function prazoSla(abertura: Date, prioridade: string) {
  return new Date(abertura.getTime() + meta(PRIORIDADES, prioridade).horas * 3600_000);
}

export async function proximoNumeroOs(empresaId: string | number | undefined) {
  const ano = new Date().getFullYear();
  let q = supabase.from("manutencao_os").select("numero").like("numero", `OS-${ano}-%`);
  if (empresaId !== undefined) q = q.eq("empresa_id", String(empresaId));
  const { data } = await q;
  let max = 0;
  for (const r of (data ?? []) as Array<{ numero: string | null }>) {
    const n = Number(String(r.numero ?? "").split("-").pop());
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `OS-${ano}-${String(max + 1).padStart(3, "0")}`;
}

/** Fotos passam pela compressão padrão; documentos sobem como estão. */
export async function uploadAnexo(original: File): Promise<string> {
  const file = original.type.startsWith("image/") ? await comprimirImagem(original, "laudo") : original;
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `manutencoes/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("chat_media").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
}

/* ---------------------- Relatório e aviso ao cliente ---------------------- */

export const linkOs = (token: unknown, origem = typeof window !== "undefined" ? window.location.origin : "") =>
  `${origem}/os/${String(token ?? "")}`;

const quando = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

/** Texto do WhatsApp por evento; o mesmo texto serve para o envio automático e o manual. */
export function mensagemOs(evento: "agendada" | "concluida", d: { cliente?: string; empresa?: string; numero?: string; tipo?: string; data?: unknown; tecnico?: string; link: string; itens?: number; naoConformes?: number }) {
  const ola = `Olá${d.cliente ? `, ${d.cliente}` : ""}!`;
  const tipo = meta(TIPOS, d.tipo).label.toLowerCase();
  if (evento === "agendada") {
    return [
      ola, "",
      `Sua manutenção ${tipo} *${d.numero ?? ""}* foi agendada${d.data ? ` para *${quando(d.data)}*` : ""}${d.tecnico ? ` com o técnico *${d.tecnico}*` : ""}.`,
      "", `Acompanhe pelo link: ${d.link}`,
      d.empresa ? `\n_${d.empresa}_` : "",
    ].join("\n").trim();
  }
  return [
    ola, "",
    `A manutenção ${tipo} *${d.numero ?? ""}* foi concluída ✅`,
    d.tecnico ? `Técnico: ${d.tecnico}` : "",
    d.itens ? `Itens verificados: ${d.itens}${d.naoConformes ? ` (${d.naoConformes} com pendência)` : ""}` : "",
    "", "Veja o relatório com as fotos e assine pelo link:", `🔗 ${d.link}`,
    d.empresa ? `\n_${d.empresa}_` : "",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();
}

/** Envia pela primeira instância ativa de WhatsApp da empresa. Retorna o motivo quando não envia. */
export async function enviarWhatsappEmpresa(empresaId: unknown, telefone: string, texto: string): Promise<string | null> {
  const { dispararMensagem, sanitizarTelefone } = await import("@/lib/atendimentos-envio");
  if (!sanitizarTelefone(telefone)) return "Cliente sem telefone cadastrado.";
  const { data } = await supabase.from("empresas_instancias").select("*").eq("empresa_id", String(empresaId) as never);
  const inst = ((data ?? []) as Record<string, unknown>[]).find((i) => i["status"] !== false && i["ativo"] !== false && String(i["tipo"] ?? "") !== "chat");
  if (!inst) return "Nenhum WhatsApp da empresa conectado.";
  await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone, texto });
  return null;
}
