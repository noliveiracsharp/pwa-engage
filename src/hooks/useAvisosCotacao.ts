import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Row } from "@/lib/row";
import { useAudit } from "@/lib/audit";
import { adicionarAviso } from "@/lib/avisos";
import { tocarSom } from "@/lib/som-notificacao";
import { aprovadoresDe } from "@/lib/aprovacao-compras";
import { useConfigAprovacao } from "@/components/cotacoes/AprovacaoCompras";

/** Sino: avisa o aprovador sobre cotações em "Aguardando aprovação" (ao abrir e em tempo real). */
export function useAvisosCotacao() {
  const { empresaId, usuarioId } = useAudit();
  const { data: cfg } = useConfigAprovacao();
  const souAprovador = !!cfg && usuarioId != null && aprovadoresDe(cfg).includes(String(usuarioId));

  useEffect(() => {
    if (!souAprovador || empresaId == null) return;
    const avisar = (c: Row, som: boolean) => {
      const id = String(c["id"]);
      adicionarAviso({
        tipo: "sistema" as never,
        chave: `cotacao-aprov-${id}`,
        titulo: "Cotação aguardando sua aprovação",
        texto: `Cotação ${String(c["numero"] ?? "")} precisa da sua aprovação.`,
        link: `/cotacoes?id=${id}`,
      });
      if (som) tocarSom("cliente" as never);
    };
    void supabase.from("cotacoes").select("id, numero, status").eq("empresa_id", empresaId as never).eq("status", "aguardando_aprovacao" as never)
      .then(({ data }) => (data ?? []).forEach((c) => avisar(c as Row, false)));
    const ch = supabase
      .channel(`cotacoes-aprov-${empresaId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cotacoes" }, (p) => {
        const c = p.new as Row;
        if (String(c["empresa_id"]) === String(empresaId) && c["status"] === "aguardando_aprovacao") avisar(c, true);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [souAprovador, empresaId]);
}
