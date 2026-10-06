import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Precificacao = {
  id: string | null;
  margem_produto: number;
  imposto_produto: number;
  margem_servico: number;
  imposto_servico: number;
};

const n = (v: unknown) => {
  const x = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

/** Parâmetros de precificação da empresa ativa (empresas_configuracao). */
export function usePrecificacao() {
  const { empresaId } = useAudit();
  return useQuery({
    queryKey: ["precificacao", empresaId ?? null],
    queryFn: async (): Promise<Precificacao> => {
      let q = supabase.from("empresas_configuracao").select("*");
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data } = await q.limit(1);
      const r = (data?.[0] ?? {}) as Record<string, unknown>;
      return {
        id: r["id"] ? String(r["id"]) : null,
        margem_produto: n(r["margem_produto"]),
        imposto_produto: n(r["imposto_produto"]),
        margem_servico: n(r["margem_servico"]),
        imposto_servico: n(r["imposto_servico"]),
      };
    },
  });
}

/** Retorna margem/imposto padrão conforme a natureza do item. */
export function padraoPorNatureza(p: Precificacao | undefined, natureza: string) {
  if (!p) return null;
  return natureza === "Produto"
    ? { margem: p.margem_produto, imposto: p.imposto_produto }
    : { margem: p.margem_servico, imposto: p.imposto_servico };
}

export function PrecificacaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data } = usePrecificacao();
  const { empresaId } = useAudit();
  const qc = useQueryClient();
  const [v, setV] = useState({ margem_produto: "", imposto_produto: "", margem_servico: "", imposto_servico: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && data)
      setV({
        margem_produto: String(data.margem_produto || ""),
        imposto_produto: String(data.imposto_produto || ""),
        margem_servico: String(data.margem_servico || ""),
        imposto_servico: String(data.imposto_servico || ""),
      });
  }, [open, data]);

  const salvar = async () => {
    const payload = {
      margem_produto: n(v.margem_produto),
      imposto_produto: n(v.imposto_produto),
      margem_servico: n(v.margem_servico),
      imposto_servico: n(v.imposto_servico),
    };
    if (payload.margem_produto + payload.imposto_produto >= 100 || payload.margem_servico + payload.imposto_servico >= 100) {
      toast.error("Margem + imposto precisa ficar abaixo de 100%.");
      return;
    }
    setSaving(true);
    const res = data?.id
      ? await supabase.from("empresas_configuracao").update(payload).eq("id", data.id)
      : await supabase.from("empresas_configuracao").insert({ ...payload, empresa_id: empresaId ?? null });
    setSaving(false);
    if (res.error) {
      toast.error(`Não foi possível salvar: ${res.error.message}`);
      return;
    }
    toast.success("Parâmetros de precificação salvos.");
    qc.invalidateQueries({ queryKey: ["precificacao"] });
    onOpenChange(false);
  };

  const campo = (key: keyof typeof v, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type="number" step="0.01" value={v[key]} onChange={(e) => setV((s) => ({ ...s, [key]: e.target.value }))} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Parâmetros de Precificação</DialogTitle>
          <DialogDescription>
            Valores padrão da empresa. Preço de venda = custo ÷ (1 − (margem + imposto) / 100).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-semibold">Produtos</p>
            <div className="grid grid-cols-2 gap-3">
              {campo("margem_produto", "Margem de lucro (%)")}
              {campo("imposto_produto", "Imposto (%)")}
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-semibold">Serviços (avulsos e recorrentes)</p>
            <div className="grid grid-cols-2 gap-3">
              {campo("margem_servico", "Margem de lucro (%)")}
              {campo("imposto_servico", "Imposto (%)")}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
