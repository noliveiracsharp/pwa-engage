import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { analisarOferta } from "@/lib/consultor-comercial.functions";
import { useAudit } from "@/lib/audit";

/** Botão "Análise do Consultor Comercial": a IA lê a oferta, a linha do tempo e a próxima ação. */
export function ConsultorComercial({ orcamentoId, contexto, empresaId, readOnly }: {
  orcamentoId: string; contexto: Record<string, unknown>; empresaId?: unknown; readOnly?: boolean;
}) {
  const gerar = useServerFn(analisarOferta);
  const qc = useQueryClient();
  const { usuarioId } = useAudit();
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const analisar = async () => {
    setCarregando(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const token = ses.session?.access_token;
      if (!token) return void toast.error("Sessão expirada. Entre novamente.");
      const { data: timeline } = await supabase.from("orcamento_interacoes" as never)
        .select("tipo, descricao, created_at").eq("orcamento_id", orcamentoId).order("created_at", { ascending: true });
      const r = await gerar({ data: { token, contexto: JSON.stringify({ ...contexto, linha_do_tempo: timeline ?? [] }).slice(0, 59000) } });
      if (r.erro) return void toast.error(r.erro);
      setTexto(r.texto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a análise.");
    } finally {
      setCarregando(false);
    }
  };

  const salvarNaTimeline = async () => {
    setSalvando(true);
    const { error } = await supabase.from("orcamento_interacoes" as never).insert({
      orcamento_id: orcamentoId, tipo: "nota", descricao: `Análise do Consultor Comercial (IA)\n\n${texto}`,
      empresa_id: empresaId ?? null, usuario_id: usuarioId ?? null,
    } as never);
    setSalvando(false);
    if (error) return void toast.error(error.message);
    toast.success("Análise salva na linha do tempo.");
    void qc.invalidateQueries({ queryKey: ["orcamento_interacoes", orcamentoId] });
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BrainCircuit className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Análise do Consultor Comercial</p>
          <p className="text-xs text-muted-foreground">A IA lê a oferta, a linha do tempo e a próxima ação e aponta a chance de fechar e os gaps.</p>
        </div>
        <Button type="button" size="sm" onClick={() => void analisar()} disabled={carregando}>
          {carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-1 h-4 w-4" />}
          {carregando ? "Analisando…" : texto ? "Analisar de novo" : "Analisar oferta"}
        </Button>
      </div>
      {texto && (
        <div className="space-y-1 rounded-md border bg-background p-3 text-sm">
          {texto.split("\n").map((l, i) =>
            l.startsWith("## ") ? <p key={i} className="pt-2 font-semibold text-foreground">{l.slice(3)}</p>
              : <p key={i} className="whitespace-pre-wrap text-muted-foreground">{l.replace(/\*\*(.+?)\*\*/g, "$1")}</p>,
          )}
          {!readOnly && (
            <div className="flex justify-end pt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void salvarNaTimeline()} disabled={salvando}>
                <Save className="mr-1 h-4 w-4" /> Salvar na linha do tempo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
