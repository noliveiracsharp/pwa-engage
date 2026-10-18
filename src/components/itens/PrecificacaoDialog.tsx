import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rowId, useTableRows } from "@/lib/crud";
import { confirmar } from "@/components/layout/DialogoGlobal";

const isProduto = (t: unknown) => String(t ?? "") === "Produto";
const calcVenda = (custo: number, margem: number, imposto: number) => {
  const d = 1 - margem / 100 - imposto / 100;
  return custo > 0 && d > 0 ? custo / d : null;
};

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
  const [aplicar, setAplicar] = useState(false);
  const [escopo, setEscopo] = useState<"todos" | "produto" | "servico">("todos");
  const [soAtivos, setSoAtivos] = useState(true);
  const [progresso, setProgresso] = useState("");
  const { data: itens = [] } = useTableRows("itens");
  const alvos = useMemo(
    () =>
      itens.filter((it) => {
        if (n(it["preco_custo"]) <= 0) return false;
        if (soAtivos && (it["status"] === false || it["status"] === "false")) return false;
        const prod = isProduto(it["tipo"]);
        return escopo === "todos" || (escopo === "produto" ? prod : !prod);
      }),
    [itens, escopo, soAtivos],
  );

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
    if (res.error) {
      setSaving(false);
      toast.error(`Não foi possível salvar: ${res.error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["precificacao"] });
    if (aplicar && alvos.length) {
      if (!await confirmar(`Recalcular o preço de venda de ${alvos.length} item(ns)? Esta ação não pode ser desfeita.`)) {
        setSaving(false);
        toast.success("Parâmetros salvos. Itens não alterados.");
        onOpenChange(false);
        return;
      }
      let ok = 0, falhas = 0;
      for (const it of alvos) {
        const prod = isProduto(it["tipo"]);
        const margem = prod ? payload.margem_produto : payload.margem_servico;
        const imposto = prod ? payload.imposto_produto : payload.imposto_servico;
        const venda = calcVenda(n(it["preco_custo"]), margem, imposto);
        if (venda == null) { falhas++; continue; }
        const { error } = await supabase
          .from("itens")
          .update({ margem_lucro: margem, imposto, preco_venda: Math.round(venda * 100) / 100 } as never)
          .eq("id", String(rowId(it)));
        if (error) falhas++; else ok++;
        setProgresso(`Atualizando ${ok + falhas}/${alvos.length}…`);
      }
      setProgresso("");
      qc.invalidateQueries({ queryKey: ["table", "itens"] });
      if (falhas) toast.warning(`${ok} item(ns) atualizados, ${falhas} com falha.`);
      else toast.success(`Parâmetros salvos e ${ok} item(ns) recalculados.`);
    } else {
      toast.success("Parâmetros de precificação salvos.");
    }
    setSaving(false);
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
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="aplicar" className="text-sm font-semibold">Aplicar aos itens já cadastrados</Label>
              <Switch id="aplicar" checked={aplicar} onCheckedChange={setAplicar} />
            </div>
            {aplicar && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Natureza</Label>
                    <Select value={escopo} onValueChange={(x) => setEscopo(x as typeof escopo)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="produto">Apenas produtos</SelectItem>
                        <SelectItem value="servico">Apenas serviços</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end justify-between gap-2 pb-2">
                    <Label htmlFor="soativos">Somente ativos</Label>
                    <Switch id="soativos" checked={soAtivos} onCheckedChange={setSoAtivos} />
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  {alvos.length} item(ns) terão margem, imposto e preço de venda recalculados a partir do custo atual. Itens sem custo ficam de fora. Ofertas já gravadas não mudam.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? progresso || "Salvando…" : "Salvar"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
