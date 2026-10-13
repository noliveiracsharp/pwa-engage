import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adicionarAviso } from "@/lib/avisos";
import { statusManutencao } from "@/lib/frota";
import type { Row } from "@/lib/row";

const INTERVALO = 30 * 60 * 1000;

/** Verifica planos de manutenção e grava aviso (1 por plano/status/dia) quando vencido ou próximo. */
export function useAvisosFrota(ativo: boolean) {
  useEffect(() => {
    if (!ativo || typeof window === "undefined") return;
    let parado = false;
    const checar = async () => {
      const [{ data: planos, error }, { data: veiculos }] = await Promise.all([
        supabase.from("veiculos_manutencao_planos").select("*").neq("ativo", false),
        supabase.from("veiculos").select("id, placa, modelo, km_atual"),
      ]);
      if (parado || error || !planos?.length) return;
      const vById = new Map(((veiculos ?? []) as Row[]).map((v) => [String(v["id"]), v]));
      const hoje = new Date().toISOString().slice(0, 10);
      for (const p of planos as Row[]) {
        const v = vById.get(String(p["veiculo_id"]));
        if (!v) continue;
        const kmAtual = Number(v["km_atual"] ?? 0);
        const st = statusManutencao(p as never, kmAtual);
        if (st.status === "ok") continue;
        const nome = String(p["nome"] ?? p["descricao"] ?? "Manutenção");
        const detalhes = [
          st.proximoKm != null ? `KM previsto ${st.proximoKm.toLocaleString("pt-BR")} (atual ${kmAtual.toLocaleString("pt-BR")})` : "",
          st.proximaData ? `data ${new Date(`${st.proximaData}T00:00:00`).toLocaleDateString("pt-BR")}` : "",
        ].filter(Boolean).join(" · ");
        adicionarAviso({
          tipo: "frota",
          chave: `frota:${String(p["id"])}:${st.status}:${hoje}`,
          titulo: `${st.status === "vencido" ? "Manutenção vencida" : "Manutenção próxima"}: ${String(v["placa"] ?? "")} - ${String(v["modelo"] ?? "")}`,
          texto: `${nome}${detalhes ? ` — ${detalhes}` : ""}`,
          link: "/veiculos",
        });
      }
    };
    void checar();
    const t = setInterval(() => void checar(), INTERVALO);
    return () => { parado = true; clearInterval(t); };
  }, [ativo]);
}
