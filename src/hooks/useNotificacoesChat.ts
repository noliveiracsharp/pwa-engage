import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { M, nomePessoa } from "@/lib/atendimentos";
import { toast } from "sonner";
import { tocarSom } from "@/lib/som-notificacao";

/** Pede permissão e mostra notificação nativa quando chega mensagem de cliente com a aba oculta. */
export function useNotificacoesChat() {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") void Notification.requestPermission();

    const channel = supabase
      .channel("atendeai-notificacoes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "atendimentos_mensagem" }, async (payload) => {
        const m = payload.new as Row;
        if (String(m["remetente_tipo"] ?? "").toLowerCase() !== "cliente" || m["msg_interna"] === true) return;
        let nome = "Cliente";
        const atId = pick(m, M.atendimento);
        if (atId) {
          const { data: at } = await supabase.from("atendimentos").select("*").eq("id", atId).maybeSingle();
          if (!at) return; // sem acesso a esse atendimento (outra empresa/equipe)
          const pid = pick(at as Row, ["pessoas_id", "pessoa_id"]);
          if (pid) {
            const { data: p } = await supabase.from("pessoas").select("*").eq("id", pid).maybeSingle();
            if (p) nome = nomePessoa(p as Row);
          }
        }
        const corpo = String(pick(m, M.texto) ?? "") || "Nova mensagem";
        const curto = corpo.length > 120 ? `${corpo.slice(0, 117)}…` : corpo;
        tocarSom("cliente");
        toast(`Nova mensagem de ${nome}`, {
          description: curto,
          duration: 8000,
          action: window.location.pathname.startsWith("/atendimentos") ? undefined : { label: "Abrir", onClick: () => { window.location.href = "/atendimentos"; } },
        });
        if (!document.hidden || Notification.permission !== "granted") return;
        const n = new Notification(nome, { body: curto, icon: "/icon-192.png", tag: String(atId ?? "") });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
