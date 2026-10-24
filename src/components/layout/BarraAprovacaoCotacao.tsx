import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { type Row } from "@/lib/row";

/** Faixa global: cotações aguardando o voto do usuário logado. Some quando ele vota. */
export function BarraAprovacaoCotacao() {
  const { empresaId, usuarioId } = useAudit();
  const qc = useQueryClient();
  const [recolhida, setRecolhida] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const chave = ["barra-aprovacao-cotacao", empresaId, usuarioId];

  const { data: minhas = [] } = useQuery({
    queryKey: chave,
    enabled: usuarioId != null && empresaId != null,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: cfg } = await supabase.from("compras_workflow_config" as never).select("*").eq("empresa_id", empresaId as never).maybeSingle();
      const c = cfg as Row | null;
      if (!c || c["ativo"] !== true) return [] as Row[];
      let ad = c["aprovadores_adicionais"];
      if (typeof ad === "string") { try { ad = JSON.parse(ad); } catch { ad = []; } }
      const lista = [String(c["aprovador_principal_id"] ?? ""), ...(Array.isArray(ad) ? ad.map(String) : [])];
      const uid = String(usuarioId);
      if (!lista.includes(uid)) return [] as Row[];
      const { data: pend } = await supabase.from("cotacoes").select("*").eq("empresa_id", empresaId as never).eq("status", "aguardando_aprovacao" as never);
      const rows = (pend ?? []) as Row[];
      if (!rows.length) return [] as Row[];
      const { data: votos } = await supabase.from("cotacao_aprovacoes" as never).select("cotacao_id").eq("usuario_id", uid as never).in("cotacao_id", rows.map((p) => String(p["id"])) as never);
      const votadas = new Set(((votos ?? []) as Row[]).map((v) => String(v["cotacao_id"])));
      return rows.filter((p) => !votadas.has(String(p["id"])));
    },
  });

  useEffect(() => {
    if (empresaId == null || usuarioId == null) return;
    const atualizar = () => void qc.invalidateQueries({ queryKey: ["barra-aprovacao-cotacao"] });
    const ch = supabase
      .channel(`barra-aprov-${empresaId}-${usuarioId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cotacoes" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "public", table: "cotacao_aprovacoes" }, atualizar)
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [empresaId, usuarioId, qc]);

  if (!minhas.length) return null;

  if (recolhida) {
    return (
      <button
        type="button"
        onClick={() => setRecolhida(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-warning/60 bg-warning/15 px-3 py-1.5 text-sm font-semibold text-foreground shadow-lg backdrop-blur animate-pulse"
      >
        <Bell className="h-4 w-4 text-warning" />
        {minhas.length} aprovação{minhas.length > 1 ? "ões" : ""} pendente{minhas.length > 1 ? "s" : ""}
      </button>
    );
  }

  const visiveis = expandida ? minhas : minhas.slice(0, 1);
  return (
    <div className="border-b border-warning/50 bg-warning/10 px-4 py-2 sm:px-6">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bell className="h-4 w-4 shrink-0 text-warning" />
        <span className="flex-1">Cotações aguardando minha aprovação ({minhas.length})</span>
        {minhas.length > 1 && (
          <>
            <Link to="/cotacoes" search={{ status: "aguardando_aprovacao" } as never} className="text-xs font-medium text-primary hover:underline">Abrir lista filtrada</Link>
            <button type="button" onClick={() => setExpandida((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              {expandida ? <>Mostrar menos <ChevronUp className="h-3 w-3" /></> : <>Ver todas <ChevronDown className="h-3 w-3" /></>}
            </button>
          </>
        )}
        <button type="button" onClick={() => setRecolhida(true)} className="text-xs font-medium text-muted-foreground hover:text-foreground">Recolher</button>
      </div>
      <ul className="mt-1 space-y-1 text-sm">
        {visiveis.map((c) => (
          <li key={String(c["id"])} className="flex items-center justify-between gap-2 pl-6">
            <span className="truncate">{String(c["numero"] ?? "")} · {String(c["titulo"] || c["projeto_nome"] || "")}</span>
            <Link to="/cotacoes" search={{ id: String(c["id"]), ...(minhas.length > 1 ? { status: "aguardando_aprovacao" } : {}) } as never} className="shrink-0 font-medium text-primary hover:underline">Revisar</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
