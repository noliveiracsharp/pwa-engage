import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { custoHoraTecnica, custoServico } from "@/lib/precificacao";

const n = (v: string) => { const x = Number(v.replace(",", ".")); return Number.isFinite(x) ? x : 0; };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Calcula o custo de um serviço a partir do custo real da hora técnica. */
export function HoraTecnicaDialog({ open, onOpenChange, onAplicar }: { open: boolean; onOpenChange: (o: boolean) => void; onAplicar: (custo: number) => void }) {
  const [v, setV] = useState({ salario: "", encargos: "70", beneficios: "", horasMes: "176", eficiencia: "70", horas: "1", extras: "" });
  const hora = custoHoraTecnica({ salario: n(v.salario), encargosPct: n(v.encargos), beneficios: n(v.beneficios), horasMes: n(v.horasMes), eficienciaPct: n(v.eficiencia) });
  const total = hora === null ? null : custoServico(n(v.horas), hora, n(v.extras));
  const campo = (k: keyof typeof v, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ht-${k}`}>{label}</Label>
      <Input id={`ht-${k}`} type="number" step="0.01" value={v[k]} onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calcular custo pela hora técnica</DialogTitle>
          <DialogDescription>Custo/hora = (salário + encargos + benefícios) ÷ horas faturáveis do mês.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            {campo("salario", "Salário (R$)")}
            {campo("encargos", "Encargos (%)")}
            {campo("beneficios", "Benefícios (R$/mês)")}
            {campo("horasMes", "Jornada (h/mês)")}
            {campo("eficiencia", "Tempo faturável (%)")}
            <div className="flex flex-col justify-end text-sm">
              <span className="text-muted-foreground">Custo da hora</span>
              <strong>{hora === null ? "—" : brl(hora)}</strong>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            {campo("horas", "Horas do serviço")}
            {campo("extras", "Deslocamento e insumos (R$)")}
          </div>
          <p className="text-sm">Custo do serviço: <strong>{total === null ? "—" : brl(total)}</strong></p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={total === null} onClick={() => { if (total !== null) { onAplicar(total); onOpenChange(false); } }}>Usar como preço de custo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
