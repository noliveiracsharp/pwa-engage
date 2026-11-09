import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ordemNatural, s, useCondRows } from "./cond-data";

type Props = { open: boolean; onOpenChange: (v: boolean) => void; condominioId: string; podeEditar: boolean };
type Val = { veic: string; pess: string };
const txt = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Edição em lote de vagas (veículos liberados) e pessoas (locação temporária) por unidade. */
export function GerenciarUnidadesDialog({ open, onOpenChange, condominioId, podeEditar }: Props) {
  const qc = useQueryClient();
  const { data: blocos = [] } = useCondRows("cond_blocos", "condominio_id", condominioId, "ordem");
  const { data: unidades = [], isLoading } = useCondRows("cond_unidades", "condominio_id", condominioId);
  const [v, setV] = useState<Record<string, Val>>({});
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const ini: Record<string, Val> = {};
    for (const u of unidades) ini[s(u["id"])] = { veic: txt(u["limite_veiculos"]), pess: txt(u["limite_pessoas"]) };
    setV(ini); setBusca("");
  }, [open, unidades]);

  const nomeBloco = useMemo(() => Object.fromEntries(blocos.map((b) => [s(b["id"]), s(b["nome"])])), [blocos]);
  const ordemBloco = useMemo(() => Object.fromEntries(blocos.map((b, i) => [s(b["id"]), i])), [blocos]);
  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...unidades]
      .filter((u) => !q || `${nomeBloco[s(u["cond_bloco_id"])] ?? ""} ${s(u["numero"])}`.toLowerCase().includes(q))
      .sort((a, b) => (ordemBloco[s(a["cond_bloco_id"])] ?? 0) - (ordemBloco[s(b["cond_bloco_id"])] ?? 0) || ordemNatural(s(a["numero"]), s(b["numero"])));
  }, [unidades, busca, nomeBloco, ordemBloco]);

  async function salvar() {
    const mudou = unidades.filter((u) => {
      const x = v[s(u["id"])];
      return x && (x.veic !== txt(u["limite_veiculos"]) || x.pess !== txt(u["limite_pessoas"]));
    });
    if (!mudou.length) { onOpenChange(false); return; }
    setSalvando(true);
    try {
      for (const u of mudou) {
        const x = v[s(u["id"])]!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("cond_unidades").update({ limite_veiculos: num(x.veic), limite_pessoas: num(x.pess) }).eq("id", s(u["id"]));
        if (error) throw new Error(error.message);
      }
      await qc.invalidateQueries({ queryKey: ["cond", "cond_unidades"] });
      toast.success(`${mudou.length} unidade(s) atualizada(s).`);
      onOpenChange(false);
    } catch (e) {
      const m = (e as Error).message;
      toast.error(/limite_pessoas|limite_veiculos/.test(m) ? "Rode o script de unidades no banco antes de salvar." : m);
    } finally { setSalvando(false); }
  }

  const campo = (id: string, k: keyof Val, rotulo: string) => (
    <Input aria-label={rotulo} inputMode="numeric" disabled={!podeEditar} placeholder="Sem limite" className="h-9"
      value={v[id]?.[k] ?? ""} onChange={(e) => setV({ ...v, [id]: { ...(v[id] ?? { veic: "", pess: "" }), [k]: e.target.value.replace(/\D/g, "") } })} />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gerenciar unidades</DialogTitle>
          <DialogDescription>
            <strong>Vagas</strong>: quantos veículos a unidade pode ter liberados na portaria. <strong>Pessoas</strong>: quantas pessoas podem usar a unidade na locação temporária. Vazio = sem limite (o de vagas usa o padrão do condomínio).
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar torre ou unidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr><th className="p-2">Torre / Bloco</th><th className="p-2">Unidade</th><th className="p-2">Vagas (veículos)</th><th className="p-2">Pessoas (locação temp.)</th></tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4} className="p-6 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
                : !linhas.length ? <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhuma unidade encontrada.</td></tr>
                : linhas.map((u) => {
                  const id = s(u["id"]);
                  const un = s(u["numero"]);
                  return (
                    <tr key={id} className="border-t">
                      <td className="p-2">{nomeBloco[s(u["cond_bloco_id"])] ?? "—"}</td>
                      <td className="p-2 font-medium">{un}</td>
                      <td className="p-2">{campo(id, "veic", `Vagas da unidade ${un}`)}</td>
                      <td className="p-2">{campo(id, "pess", `Pessoas da unidade ${un}`)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          {podeEditar && <Button disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="size-4 animate-spin" />}Salvar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
