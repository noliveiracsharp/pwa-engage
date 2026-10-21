import { supabase } from "@/integrations/supabase/client";

/** Bancos com integração de API. `disponivel` = motor já implementado. */
export const PROVEDORES_API = [
  { id: "inter", nome: "Banco Inter", disponivel: true },
  { id: "santander", nome: "Santander", disponivel: false },
  { id: "itau", nome: "Itaú", disponivel: false },
  { id: "bradesco", nome: "Bradesco", disponivel: false },
  { id: "bb", nome: "Banco do Brasil", disponivel: false },
  { id: "sicoob", nome: "Sicoob", disponivel: false },
  { id: "cora", nome: "Cora", disponivel: false },
] as const;

export const STATUS_COBRANCA: Record<string, { label: string; cls: string }> = {
  processando: { label: "Processando", cls: "bg-muted text-muted-foreground" },
  registrado: { label: "Registrado no banco", cls: "bg-primary/10 text-primary" },
  vencido: { label: "Vencido", cls: "bg-warning/15 text-warning" },
  pago: { label: "Pago", cls: "bg-success/15 text-success" },
  cancelado: { label: "Cancelado", cls: "bg-destructive/10 text-destructive" },
  baixado: { label: "Baixado", cls: "bg-destructive/10 text-destructive" },
};

export type AcaoBanco = "emitir" | "consultar" | "pdf" | "cancelar" | "webhook_registrar" | "saldo" | "extrato";

/** Chama o motor bancário (função "banco-cobranca"). Lança erro com a mensagem amigável. */
export async function chamarBanco<T = Record<string, unknown>>(acao: AcaoBanco, dados: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("banco-cobranca", { body: { acao, ...dados } });
  if (error) {
    let msg = error.message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) msg = ((await ctx.json()) as { erro?: string }).erro ?? msg; } catch { /* */ }
    if (/Failed to send|not found|404/i.test(msg)) msg = "Motor bancário não instalado. Publique a função \"banco-cobranca\" no seu banco de dados.";
    throw new Error(msg);
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro);
  return data as T;
}

export function abrirPdfBase64(b64: string) {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  window.open(URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), "_blank");
}
