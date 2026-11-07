/** Ciclo de vida dos avisos do condomínio — regras puras (sem React/rede). */

export type StatusAviso = "agendado" | "enviando" | "enviado" | "cancelado" | "substituido" | "arquivado";

export const STATUS_AVISO: Record<StatusAviso, { label: string; cor: string }> = {
  agendado: { label: "Agendado", cor: "border-primary/40 bg-primary/10 text-primary" },
  enviando: { label: "Enviando", cor: "border-warning/40 bg-warning/10 text-warning" },
  enviado: { label: "Enviado", cor: "border-success/40 bg-success/10 text-success" },
  cancelado: { label: "Cancelado", cor: "border-destructive/40 bg-destructive/10 text-destructive" },
  substituido: { label: "Substituído", cor: "border-muted-foreground/40 bg-muted text-muted-foreground" },
  arquivado: { label: "Arquivado", cor: "border-muted-foreground/40 bg-muted text-muted-foreground" },
};

/** Avisos sem a coluna status (anteriores ao ciclo) contam como enviados. */
export function statusDoAviso(v: unknown): StatusAviso {
  return (typeof v === "string" && v in STATUS_AVISO ? v : "enviado") as StatusAviso;
}

/** Data final em branco = nunca expira. A data final ainda é um dia válido de leitura. */
export function avisoExpirado(expiraEm: string | null | undefined, hoje = new Date()): boolean {
  if (!expiraEm) return false;
  const h = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return expiraEm.slice(0, 10) < h;
}

/** Quais ações cada situação permite. Editar algo que já saiu gera uma nova versão. */
export function acoesDoAviso(status: StatusAviso, natureza: string = "aviso") {
  const ativo = status === "enviado" || status === "enviando" || status === "agendado";
  return {
    cancelar: natureza === "aviso" && (status === "enviado" || status === "agendado"),
    editar: natureza === "aviso" && (status === "enviado" || status === "agendado"),
    editarCriaVersao: status === "enviado",
    arquivar: status !== "arquivado" && status !== "enviando",
    reenviar: ativo && status !== "enviando",
  };
}

/** Cancelar um aviso agendado não manda nada; cancelar algo já enviado avisa quem recebeu. */
export function cancelamentoNotifica(status: StatusAviso, enviados: number): boolean {
  return status === "enviado" && enviados > 0;
}

export function tituloCancelamento(titulo: string): string {
  return `CANCELADO: ${titulo}`.slice(0, 150);
}

export function mensagemCancelamento(titulo: string, motivo: string, dataEnvio: string): string {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<p>Olá, {{nome}}.</p><p>O aviso <b>"${esc(titulo)}"</b>, enviado em ${esc(dataEnvio)}, foi <b>cancelado</b> e deve ser desconsiderado.</p><p><b>Motivo:</b> ${esc(motivo)}</p>`;
}

export function percentualEnvio(feitos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((feitos / total) * 100));
}

export function rotuloCanalLeitura(c: string): string {
  return c === "email" ? "E-mail" : c === "whatsapp" ? "WhatsApp" : "Sistema";
}

/** Agendamento precisa ser no futuro. */
export function validarAgendamento(iso: string, agora = new Date()): string | null {
  if (!iso) return "Informe data e hora do agendamento.";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Data do agendamento inválida.";
  if (d.getTime() <= agora.getTime()) return "O agendamento precisa ser no futuro.";
  return null;
}
