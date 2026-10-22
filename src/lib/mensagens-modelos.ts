import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";

/** Modelos de mensagens automáticas de WhatsApp. Cada chave tem um texto padrão e variáveis {assim}. */
export type ModeloDef = { chave: string; nome: string; variaveis: string[]; padrao: string };

export const MODELOS: ModeloDef[] = [
  {
    chave: "cotacao_fornecedor",
    nome: "Cotação — envio ao fornecedor",
    variaveis: ["fornecedor", "numero", "projeto", "link", "comprador", "comprador_whatsapp"],
    padrao: [
      "Olá, {fornecedor}!",
      "",
      "Segue a solicitação da cotação {numero}.",
      "",
      "*Cotações só serão aceitas se preenchidas pelo formulário anexo.*",
      "",
      "Para informar seus preços, prazos e condições, acesse o link abaixo:",
      "",
      "{link}",
      "",
      "Qualquer dúvida, ficamos à disposição.",
      "",
      "{comprador} — WhatsApp {comprador_whatsapp}",
    ].join("\n"),
  },
];

/** Troca {variavel} pelo valor; linhas que ficam só com separadores vazios são removidas. */
export function aplicarModelo(texto: string, vars: Record<string, string>): string {
  return texto
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .split("\n")
    .filter((l) => !/^\s*[—-]\s*(WhatsApp\s*)?$/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function useModelosMensagem(empresaId: string | number | undefined) {
  return useQuery({
    queryKey: ["mensagens_modelos", String(empresaId ?? "")],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("mensagens_modelos" as never).select("*").eq("empresa_id", String(empresaId));
      if (error) return [] as Row[];
      return (data ?? []) as Row[];
    },
  });
}

export function textoModelo(salvos: Row[], chave: string): string {
  const s = salvos.find((r) => r["chave"] === chave);
  const t = s ? String(s["texto"] ?? "").trim() : "";
  return t || (MODELOS.find((m) => m.chave === chave)?.padrao ?? "");
}
