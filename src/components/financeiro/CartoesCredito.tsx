import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { limiteDisponivelCartao, limiteUsadoCartao, melhorDiaCompra } from "@/lib/financeiro";
import { formatBRL, num, round2 } from "@/lib/orcamentos";
import { cn } from "@/lib/utils";
import type { Row } from "@/lib/row";
import { confirmar } from "@/components/layout/DialogoGlobal";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const TABELA = "despesas_cartoes";
const limiteDe = (c: Row) => num(c["limite_total"]) || num(c["limite_mensal"]);

export function CartoesCredito({ perms }: { perms: Perms }) {
  const qc = useQueryClient();
  const { data: cartoes = [] } = useTableRows(TABELA);
  const { data: contas = [] } = useTableRows("financeiro_contas_bancarias");
  const { data: titulos = [] } = useTableRows("financeiro_titulos");
  const [editar, setEditar] = useState<Row | null | undefined>(undefined);
  const invalidar = () => qc.invalidateQueries({ queryKey: ["table", TABELA] });
  const contaNome = (id: unknown) => text(contas.find((c) => text(rowId(c)) === text(id))?.["descricao"]) || "Sem conta vinculada";

  const excluir = async (c: Row) => {
    if (!await confirmar(`Excluir o cartão "${text(c["descricao"])}"?`)) return;
    const { error } = await supabase.from(TABELA as never).delete().eq("id", text(rowId(c)));
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Cartão excluído."); invalidar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Cartões de crédito</h2>
          <p className="text-muted-foreground text-sm">Limite disponível desconta as parcelas em aberto lançadas no cartão.</p>
        </div>
        {perms.canCreate && <Button onClick={() => setEditar(null)}><Plus className="mr-1 h-4 w-4" />Novo cartão</Button>}
      </div>
      {!cartoes.length ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">Nenhum cartão cadastrado ainda.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((c) => {
            const limite = limiteDe(c);
            const usado = limiteUsadoCartao(titulos, text(rowId(c)));
            const disp = limiteDisponivelCartao(limite, usado);
            const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
            const melhor = num(c["melhor_dia_compra"]) || melhorDiaCompra(num(c["dia_fechamento"]));
            return (
              <div key={text(rowId(c))} className="bg-card space-y-2 rounded-lg border p-4">
                <div className="flex items-start gap-2">
                  <CreditCard className="text-primary h-5 w-5" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{text(c["descricao"])}</p>
                    <p className="text-muted-foreground text-xs">{text(c["bandeira"]) || "—"}{c["final4"] ? ` • final ${text(c["final4"])}` : ""} • {contaNome(c["conta_bancaria_id"])}{c["ativo"] === false ? " • Inativo" : ""}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs tabular-nums"><span>Usado {formatBRL(usado)}</span><span className="text-muted-foreground">Limite {formatBRL(limite)}</span></div>
                  <div className="bg-muted h-2 rounded"><div className={cn("h-2 rounded", pct >= 85 ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} /></div>
                  <p className="text-sm">Disponível: <span className="font-semibold tabular-nums">{formatBRL(disp)}</span></p>
                </div>
                <p className="text-muted-foreground text-xs">Fecha dia {text(c["dia_fechamento"]) || "—"} • Vence dia {text(c["dia_vencimento"]) || "—"} • Melhor dia de compra {melhor || "—"}</p>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditar(c)}><Pencil className="h-4 w-4" /></Button>
                  {perms.canDelete && <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => excluir(c)}><Trash2 className="text-destructive h-4 w-4" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editar !== undefined && <CartaoCreditoSheet registro={editar} contas={contas} readOnly={!!editar && !perms.canUpdate} onClose={() => setEditar(undefined)} onSaved={invalidar} />}
    </div>
  );
}

function CartaoCreditoSheet({ registro, contas, readOnly, onClose, onSaved }: { registro: Row | null; contas: Row[]; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const { empresaId } = useAudit();
  const [v, setV] = useState({
    descricao: text(registro?.["descricao"]), bandeira: text(registro?.["bandeira"]), final4: text(registro?.["final4"]),
    conta: text(registro?.["conta_bancaria_id"]), limite: registro ? String(limiteDe(registro)).replace(".", ",") : "",
    fech: text(registro?.["dia_fechamento"]), venc: text(registro?.["dia_vencimento"]), melhor: text(registro?.["melhor_dia_compra"]),
    ativo: registro ? registro["ativo"] !== false : true,
  });
  const [salvando, setSalvando] = useState(false);
  const sugerido = melhorDiaCompra(Number(v.fech));
  const salvar = async () => {
    if (!v.descricao.trim()) return void toast.error("Informe o nome do cartão.");
    if (!v.fech || !v.venc) return void toast.error("Informe o dia de fechamento e o de vencimento da fatura.");
    const dia = (x: string) => (x ? Math.min(31, Math.max(1, Number(x))) : null);
    const limite = round2(num(v.limite));
    const base = {
      descricao: v.descricao.trim(), bandeira: v.bandeira || null, final4: v.final4.replace(/\D/g, "").slice(0, 4) || null,
      conta_bancaria_id: v.conta || null, limite_total: limite, limite_mensal: limite,
      dia_fechamento: dia(v.fech), dia_vencimento: dia(v.venc), melhor_dia_compra: dia(v.melhor) ?? (sugerido || null), ativo: v.ativo,
    };
    setSalvando(true);
    const { error } = registro
      ? await supabase.from(TABELA as never).update(base as never).eq("id", text(rowId(registro)))
      : await supabase.from(TABELA as never).insert({ ...base, empresa_id: empresaId } as never);
    setSalvando(false);
    if (error) return void toast.error(/conta_bancaria_id|limite_total|melhor_dia/.test(error.message) ? "Execute o script de cartões de crédito no SQL Editor." : erroFinanceiro(error));
    toast.success("Cartão salvo."); onSaved(); onClose();
  };
  const campo = (k: keyof typeof v, label: string, extra: Record<string, unknown> = {}) => (
    <div className="space-y-1"><Label>{label}</Label><Input value={String(v[k])} disabled={readOnly} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} /></div>
  );
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{registro ? "Editar" : "Novo"} cartão de crédito</SheetTitle>
          <SheetDescription>Guarde só os 4 últimos dígitos; nunca o número completo.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{campo("descricao", "Nome do cartão *", { placeholder: "Ex.: Mastercard Black PJ" })}</div>
          {campo("bandeira", "Bandeira")}
          {campo("final4", "Final (4 dígitos)", { inputMode: "numeric", maxLength: 4 })}
          <div className="space-y-1 sm:col-span-2"><Label>Conta bancária vinculada</Label>
            <SearchSelect value={v.conta} disabled={readOnly} placeholder="Escolha a conta" onChange={(x) => setV({ ...v, conta: x })}
              options={contas.map((c) => ({ value: text(rowId(c)), label: text(c["descricao"]) || "—" }))} /></div>
          {campo("limite", "Limite total (R$)", { inputMode: "decimal", placeholder: "0,00" })}
          {campo("fech", "Dia de fechamento da fatura *", { type: "number", min: 1, max: 31 })}
          {campo("venc", "Dia de vencimento da fatura *", { type: "number", min: 1, max: 31 })}
          {campo("melhor", "Melhor dia de compra", { type: "number", min: 1, max: 31, placeholder: sugerido ? `Sugerido: ${sugerido}` : "" })}
          <div className="flex items-center gap-3 sm:col-span-2"><Switch id="cc-ativo" checked={v.ativo} disabled={readOnly} onCheckedChange={(c) => setV({ ...v, ativo: c })} /><Label htmlFor="cc-ativo">Ativo</Label></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar} disabled={salvando}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
