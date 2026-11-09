import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { s, useCondRows } from "./cond-data";

type Props = { condominioId: string; podeEditar: boolean };
const VAZIO = { limite_veiculos_ativos: "", morador_edita_dados: false, morador_escolhe_veiculo: true, aprovacao_reserva: false, horario_correspondencia: "", dados_wifi: "", texto_lgpd: "" };

/** Parâmetros do condomínio (uma linha por condomínio em cond_config). */
export function ConfiguracoesCondSecao({ condominioId, podeEditar }: Props) {
  const qc = useQueryClient();
  const { data: rows = [] } = useCondRows("cond_config", "condominio_id", condominioId);
  const [v, setV] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    const r = rows[0];
    setV(r ? {
      limite_veiculos_ativos: r["limite_veiculos_ativos"] == null ? "" : s(r["limite_veiculos_ativos"]),
      morador_edita_dados: r["morador_edita_dados"] === true,
      morador_escolhe_veiculo: r["morador_escolhe_veiculo"] !== false,
      aprovacao_reserva: r["aprovacao_reserva"] === true,
      horario_correspondencia: s(r["horario_correspondencia"]),
      dados_wifi: s(r["dados_wifi"]),
      texto_lgpd: s(r["texto_lgpd"]),
    } : VAZIO);
  }, [rows]);

  async function salvar() {
    const lim = v.limite_veiculos_ativos.trim();
    if (lim && (!/^\d+$/.test(lim))) { toast.error("Limite de veículos deve ser um número inteiro."); return; }
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("cond_config").upsert({
        condominio_id: condominioId, ...v, limite_veiculos_ativos: lim ? Number(lim) : null,
        horario_correspondencia: v.horario_correspondencia || null, dados_wifi: v.dados_wifi || null, texto_lgpd: v.texto_lgpd || null,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["cond", "cond_config"] });
      toast.success("Configurações salvas.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  const ro = !podeEditar;
  const Chave = ({ k, l, d }: { k: "morador_edita_dados" | "morador_escolhe_veiculo" | "aprovacao_reserva"; l: string; d: string }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <Label htmlFor={`cfg-${k}`} className="font-normal"><span className="block text-sm font-medium">{l}</span><span className="text-xs text-muted-foreground">{d}</span></Label>
      <Switch id={`cfg-${k}`} disabled={ro} checked={v[k]} onCheckedChange={(c) => setV({ ...v, [k]: c })} />
    </div>
  );

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <header><h3 className="flex items-center gap-2 font-semibold"><Settings2 className="size-5 text-primary" /> Configurações do condomínio</h3>
        <p className="text-xs text-muted-foreground">Regras que valem para todas as unidades.</p></header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <Label htmlFor="cfg-lim" className="mb-1 block text-sm font-medium">Veículos liberados por unidade</Label>
          <Input id="cfg-lim" inputMode="numeric" disabled={ro} placeholder="Sem limite" value={v.limite_veiculos_ativos} onChange={(e) => setV({ ...v, limite_veiculos_ativos: e.target.value })} />
          <p className="mt-1 text-xs text-muted-foreground">A unidade cadastra quantos quiser; só esse número fica liberado na portaria. Vazio = sem limite.</p>
        </div>
        <Chave k="morador_escolhe_veiculo" l="Morador escolhe o veículo liberado" d="O próprio morador liga e desliga qual veículo usa a garagem." />
        <Chave k="morador_edita_dados" l="Morador edita os próprios dados" d="Permite alterar nome, telefone e foto pelo portal." />
        <Chave k="aprovacao_reserva" l="Reservas precisam de aprovação" d="O síndico aprova cada reserva de área comum." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="cfg-corr" className="mb-1 block">Horário para retirar correspondência</Label>
          <Textarea id="cfg-corr" maxLength={500} disabled={ro} value={v.horario_correspondencia} onChange={(e) => setV({ ...v, horario_correspondencia: e.target.value })} /></div>
        <div><Label htmlFor="cfg-wifi" className="mb-1 block">Dados de acesso Wi-Fi</Label>
          <Textarea id="cfg-wifi" maxLength={500} disabled={ro} value={v.dados_wifi} onChange={(e) => setV({ ...v, dados_wifi: e.target.value })} /></div>
      </div>
      <div><Label htmlFor="cfg-lgpd" className="mb-1 block">Texto de aceite da LGPD</Label>
        <Textarea id="cfg-lgpd" rows={4} disabled={ro} value={v.texto_lgpd} onChange={(e) => setV({ ...v, texto_lgpd: e.target.value })} /></div>
      {podeEditar && <div className="flex justify-end"><Button disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="size-4 animate-spin" />} Salvar configurações</Button></div>}
    </section>
  );
}
