import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adicionarAviso, listarAvisos } from "@/lib/avisos";
import type { Row } from "@/lib/row";

const INTERVALO = 30 * 1000;

/** Avisa o vendedor (sininho + alerta + som) quando um lead novo cai para ele pela roleta. */
export function useAvisosLeads(usuarioId: unknown) {
  useEffect(() => {
    const uid = String(usuarioId ?? "");
    if (!uid || typeof window === "undefined") return;
    let parado = false;
    const desde = new Date(Date.now() - 2 * 864e5).toISOString();
    const checar = async () => {
      const { data, error } = await supabase.from("orcamentos" as never)
        .select("id, descricao, origem_lead, created_at, parceiro:parceiro_id(nome_fantasia, razao_social)")
        .eq("usuario_id", uid as never).not("origem_lead", "is", null)
        .gte("created_at", desde as never).order("created_at", { ascending: false }).limit(20);
      if (parado || error || !data) return;
      const existentes = new Set(listarAvisos().map((a) => a.chave));
      for (const o of (data as Row[]).reverse()) {
        const chave = `lead:${String(o["id"])}`;
        if (existentes.has(chave)) continue;
        // só leads que entraram pela captação geram linha automática na descrição
        if (!String(o["descricao"] ?? "").toLowerCase().includes("lead")) continue;
        const p = (o["parceiro"] ?? {}) as Row;
        const nome = String(p["nome_fantasia"] || p["razao_social"] || "Cliente");
        const texto = `${nome} (${String(o["origem_lead"])})`;
        adicionarAviso({ tipo: "lead", chave, titulo: "Novo lead atribuído a você", texto, link: "/kanban" });
        toast.success(`Novo lead atribuído a você: ${texto}`);
        try {
          const ctx = new AudioContext(); const os = ctx.createOscillator(); const g = ctx.createGain();
          os.frequency.value = 880; g.gain.value = 0.08; os.connect(g); g.connect(ctx.destination);
          os.start(); os.stop(ctx.currentTime + 0.25);
        } catch { /* navegador bloqueou o som */ }
      }
    };
    void checar();
    const t = setInterval(() => void checar(), INTERVALO);
    return () => { parado = true; clearInterval(t); };
  }, [usuarioId]);
}
