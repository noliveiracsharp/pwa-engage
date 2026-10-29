import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { perguntar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSecoes } from "@/hooks/useSecoes";
import { rowId } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import {
  podeDecidir, SLA_DIAS_UTEIS, situacaoPrazo, STATUS_LEVANTAMENTO, statusLevantamento,
  type EventoLevantamento,
} from "@/lib/levantamento";

const PRAZO_CLS = { ok: "text-success", vencendo: "text-warning", atrasado: "text-destructive" } as const;

/** Ciclo de aprovação do Levantamento Técnico (técnico → gestor → Compras). */
export function LaudoAprovacao({ laudo, temItens }: { laudo: Row; temItens: boolean }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const secoes = useSecoes("/laudos", [{ key: "aprovar-levantamento", label: "Aprovar levantamento técnico" }]);
  const souGestor = !!secoes["aprovar-levantamento"]?.canUpdate;
  const nome = String(pick(usuario ?? {}, ["nome", "nome_completo"]) ?? "Usuário");
  const [status, setStatus] = useState(statusLevantamento(laudo["levantamento_status"]));
  const [hist, setHist] = useState<EventoLevantamento[]>([]);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setStatus(statusLevantamento(laudo["levantamento_status"]));
    setHist(Array.isArray(laudo["levantamento_historico"]) ? (laudo["levantamento_historico"] as EventoLevantamento[]) : []);
  }, [laudo]);

  async function gravar(patch: Row, ev: Omit<EventoLevantamento, "em" | "usuario">) {
    setOcupado(true);
    try {
      const novo = [...hist, { ...ev, em: new Date().toISOString(), usuario: nome }];
      const { error } = await supabase.from("laudos_tecnicos").update({ ...patch, levantamento_historico: novo } as never).eq("id", String(rowId(laudo)));
      if (error) throw error;
      setHist(novo);
      setStatus(statusLevantamento(patch["levantamento_status"]));
      void qc.invalidateQueries({ queryKey: ["table", "laudos_tecnicos"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error && /column|levantamento/i.test(e.message) ? "Rode o script atendeai-levantamento-laudos.sql para ativar a aprovação." : e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally { setOcupado(false); }
  }

  const enviar = async () => {
    if (!temItens) { toast.error("Salve o levantamento com ao menos um item antes de enviar."); return; }
    if (await gravar({ levantamento_status: "aguardando_aprovacao", levantamento_enviado_em: new Date().toISOString() }, { acao: "enviado" }))
      toast.success("Levantamento enviado para aprovação do gestor.");
  };
  const decidir = async (d: "aprovado" | "reprovado") => {
    const obs = (await perguntar(d === "reprovado"
      ? { title: "Devolver ao técnico", description: "Observação do gestor (obrigatória).", required: true, multiline: true }
      : { title: "Aprovar levantamento", description: "Observação (opcional).", multiline: true })) ?? null;
    if (obs === null) return;
    const erro = podeDecidir(status, d, obs);
    if (erro) { toast.error(erro); return; }
    if (await gravar({ levantamento_status: d, levantamento_decidido_em: new Date().toISOString() }, { acao: d, obs: obs.trim() || null }))
      toast.success(d === "aprovado" ? "Aprovado. Use o botão de enviar para cotação na lista." : "Levantamento devolvido ao técnico.");
  };

  const meta = STATUS_LEVANTAMENTO[status];
  const prazo = status === "aguardando_aprovacao" && laudo["levantamento_enviado_em"]
    ? situacaoPrazo(new Date(String(laudo["levantamento_enviado_em"])), SLA_DIAS_UTEIS.aprovacao) : null;
  const devolucao = [...hist].reverse().find((h) => h.acao === "reprovado");

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Aprovação do gestor</h3>
        <div className="flex items-center gap-2">
          {prazo && <span className={cn("flex items-center gap-1 text-xs", PRAZO_CLS[prazo])}><Clock className="h-3.5 w-3.5" />{prazo === "atrasado" ? "Aprovação atrasada" : prazo === "vencendo" ? "Vence hoje" : "No prazo (1 dia útil)"}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", meta.cls)}>{meta.label}</span>
        </div>
      </div>
      {status === "reprovado" && devolucao?.obs && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm"><b>Observação do gestor ({devolucao.usuario}):</b> {devolucao.obs}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {(status === "rascunho" || status === "reprovado") && (
          <Button type="button" size="sm" disabled={ocupado} onClick={enviar}><Send className="mr-1 h-4 w-4" />Enviar para aprovação</Button>
        )}
        {status === "aguardando_aprovacao" && souGestor && <>
          <Button type="button" size="sm" disabled={ocupado} onClick={() => decidir("aprovado")}><CheckCircle2 className="mr-1 h-4 w-4" />Aprovar</Button>
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => decidir("reprovado")}><Undo2 className="mr-1 h-4 w-4" />Devolver com observação</Button>
        </>}
        {status === "aguardando_aprovacao" && !souGestor && <p className="text-sm text-muted-foreground">Aguardando o gestor aprovar.</p>}
      </div>
      {hist.length > 0 && (
        <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {hist.map((h, i) => (
            <li key={i}>{new Date(h.em).toLocaleString("pt-BR")} · {h.usuario} · {({ enviado: "enviou para aprovação", aprovado: "aprovou", reprovado: "devolveu", cotacao: "gerou cotação" } as const)[h.acao]}{h.obs ? ` — ${h.obs}` : ""}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
