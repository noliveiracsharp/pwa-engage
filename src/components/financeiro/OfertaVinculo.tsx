import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { useSaveOrcamento } from "@/hooks/useSaveOrcamento";
import { rowId, text, useTableRows } from "@/lib/crud";
import { formatBRL, formatDate, num } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

/** Id da Oferta vinculada ao lançamento (coluna própria ou origem gerada pela Oferta). */
export const ofertaDoTitulo = (t: Row): string =>
  text(t["oferta_id"]) || (t["origem_tipo"] === "oferta" ? text(t["origem_id"]) : "");

const erroColuna = (m: string) => /oferta_id|column/i.test(m)
  ? "Rode o script atendeai-titulo-oferta.sql no banco para habilitar o vínculo com Ofertas." : m;

export function VincularOfertaDialog({ titulo, onClose }: { titulo: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useSaveOrcamento();
  const { data: ofertas = [] } = useTableRows("orcamentos");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const [modo, setModo] = useState<"nova" | "existente">("nova");
  const [ofertaId, setOfertaId] = useState("");
  const temSerie = !!titulo["origem_id"] && titulo["origem_tipo"] === "manual";
  const [serie, setSerie] = useState(temSerie);
  const [busy, setBusy] = useState(false);
  const cliente = text(titulo["parceiro_id"]);
  const nomeCli = (id: unknown) => { const p = parceiros.find((x) => text(rowId(x)) === text(id)); return p ? text(p["nome_fantasia"] || p["razao_social"] || p["nome"]) : ""; };
  const opcoes = useMemo(() => ofertas
    .filter((o) => !cliente || text(o["parceiro_id"]) === cliente)
    .map((o) => ({ value: text(rowId(o)), label: `#${text(o["numero"])} — ${nomeCli(o["parceiro_id"]) || "sem cliente"}` })), [ofertas, parceiros, cliente]);

  const confirmar = async () => {
    setBusy(true);
    try {
      let id = ofertaId;
      if (modo === "nova") {
        const r = await save.mutateAsync({ original: null, linhas: [], header: {
          parceiro_id: cliente || null, empresa_id: titulo["empresa_id"] ?? null,
          dt_orcamento: text(titulo["vencimento"]) || new Date().toISOString().slice(0, 10),
          descricao: text(titulo["descricao"]).replace(/\s*\(\d+\/\d+\)\s*$/, "") || "Contrato migrado",
        } });
        id = r.id;
      }
      if (!id) { toast.error("Escolha a Oferta."); return; }
      let q = supabase.from("financeiro_titulos").update({ oferta_id: id } as never);
      q = serie && temSerie ? q.eq("origem_tipo", "manual").eq("origem_id", text(titulo["origem_id"])) : q.eq("id", text(rowId(titulo)));
      const { error } = await q;
      if (error) throw new Error(erroColuna(error.message));
      qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
      toast.success(modo === "nova" ? "Oferta criada e vinculada. Agora lance os itens." : "Lançamento vinculado à Oferta.");
      onClose();
      if (modo === "nova") void navigate({ to: "/orcamentos", search: { abrir: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao vincular a Oferta.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Oferta de referência</DialogTitle>
          <DialogDescription>{text(titulo["descricao"])} — {formatBRL(titulo["valor"])}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={modo === "nova" ? "default" : "outline"} onClick={() => setModo("nova")}>Gerar nova Oferta</Button>
            <Button variant={modo === "existente" ? "default" : "outline"} onClick={() => setModo("existente")}>Vincular existente</Button>
          </div>
          {modo === "nova" ? (
            <p className="text-muted-foreground text-sm">A Oferta nasce com o cliente e a data deste lançamento e abre em seguida para você lançar os itens. Nenhuma conta nova é criada no Financeiro.</p>
          ) : (
            <div className="space-y-1.5"><Label>Oferta</Label>
              <SearchSelect value={ofertaId} onChange={setOfertaId} options={opcoes} placeholder="Selecione a Oferta" /></div>
          )}
          {temSerie && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="serie">Vincular todas as parcelas desta série</Label>
              <Switch id="serie" checked={serie} onCheckedChange={setSerie} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void confirmar()} disabled={busy}>{busy ? "Salvando…" : "Confirmar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OfertaConsultaSheet({ ofertaId, onClose }: { ofertaId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: ofertas = [] } = useTableRows("orcamentos");
  const { data: linhas = [] } = useTableRows("orcamento_itens");
  const { data: itens = [] } = useTableRows("itens");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const o = ofertas.find((x) => text(rowId(x)) === ofertaId);
  const meus = linhas.filter((l) => text(l["orcamento_id"]) === ofertaId);
  const nomeItem = (l: Row) => { const i = itens.find((x) => text(rowId(x)) === text(l["item_id"])); return text(l["descricao"]) || (i ? text(i["descricao"] || i["nome"]) : "Item"); };
  const p = o ? parceiros.find((x) => text(rowId(x)) === text(o["parceiro_id"])) : undefined;
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[60vw]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><FileText className="text-primary h-5 w-5" /> Oferta #{text(o?.["numero"]) || "—"}</SheetTitle>
          <SheetDescription>Consulta — {p ? text(p["nome_fantasia"] || p["razao_social"] || p["nome"]) : "sem cliente"}</SheetDescription>
        </SheetHeader>
        {!o ? <p className="text-muted-foreground mt-6 text-sm">Carregando Oferta…</p> : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-muted-foreground text-xs">Data</p><p>{formatDate(o["dt_orcamento"])}</p></div>
              <div><p className="text-muted-foreground text-xs">Situação</p><p>{text(o["situacao"]) || "—"}</p></div>
              <div><p className="text-muted-foreground text-xs">Total líquido</p><p className="font-semibold">{formatBRL(o["total_liquido"])}</p></div>
              <div><p className="text-muted-foreground text-xs">Mensalidade</p><p className="font-semibold">{num(o["total_recorrente"]) > 0 ? `${formatBRL(o["total_recorrente"])}/mês` : "—"}</p></div>
            </div>
            {o["descricao"] ? <p className="text-sm">{text(o["descricao"])}</p> : null}
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left"><tr><th className="p-2">Item</th><th className="p-2 text-right">Qtd</th><th className="p-2 text-right">Unitário</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>
                  {meus.length === 0 && <tr><td colSpan={4} className="text-muted-foreground p-3 text-center">Nenhum item lançado.</td></tr>}
                  {meus.map((l) => (
                    <tr key={text(rowId(l))} className="border-t">
                      <td className="p-2">{nomeItem(l)}</td>
                      <td className="p-2 text-right tabular-nums">{num(l["quantidade"])}</td>
                      <td className="p-2 text-right tabular-nums">{formatBRL(l["valor_unitario"])}</td>
                      <td className="p-2 text-right tabular-nums">{formatBRL(num(l["quantidade"]) * num(l["valor_unitario"]))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" onClick={() => { onClose(); void navigate({ to: "/orcamentos", search: { abrir: ofertaId } }); }}>
              <ExternalLink className="h-4 w-4" /> Abrir Oferta para editar
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
