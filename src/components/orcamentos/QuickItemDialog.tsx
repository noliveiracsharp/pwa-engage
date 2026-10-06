import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { rowId } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { pick, type Row } from "@/lib/row";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itens: Row[];
  unidadeOptions: Array<{ value: string; label: string }>;
  onCreated: (item: Row) => void;
};

function nextCodigo(itens: Row[], tipo: string) {
  const prefixo = tipo.startsWith("Serviço") ? "S" : "P";
  let max = 0;
  for (const r of itens) {
    const m = new RegExp(`^${prefixo}(\\d{5,})$`, "i").exec(String(pick(r, ["codigo"]) ?? ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefixo}${String(max + 1).padStart(5, "0")}`;
}

/** Cadastro rápido de item a partir do orçamento: tipo, código automático, descrição e unidade. */
export function QuickItemDialog({ open, onOpenChange, itens, unidadeOptions, onCreated }: Props) {
  const { stamp } = useAudit();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState("Produto");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("Produto");
      setDescricao("");
      setUnidade("");
    }
  }, [open]);

  const codigo = nextCodigo(itens, tipo);

  const salvar = async () => {
    if (!descricao.trim()) { toast.error("Informe a descrição."); return; }
    setSaving(true);
    const values = stamp(
      { tipo, codigo, descricao: descricao.trim(), unidade_medida_id: unidade || null, status: true },
      true,
    );
    const { data, error } = await supabase.from("itens").insert(values).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["table", "itens"] });
    toast.success("Item cadastrado.");
    if (data && rowId(data as Row) !== undefined) onCreated(data as Row);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="block text-sm">Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Produto">Produto</SelectItem>
                  <SelectItem value="Serviço">Serviço avulso</SelectItem>
                  <SelectItem value="Serviço Recorrente">Serviço recorrente (mensal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="block text-sm">Código</Label>
              <Input value={codigo} readOnly disabled />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qi-desc" className="block text-sm">Descrição</Label>
            <Input id="qi-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="block text-sm">Unidade de medida</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {unidadeOptions.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
