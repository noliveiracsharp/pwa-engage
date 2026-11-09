import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import type { Row } from "@/lib/row";
import { nomeConfere, numerosEmConflito } from "@/lib/cond-unidade";
import { cn } from "@/lib/utils";
import { s } from "./cond-data";

type Props = { bloco: Row; blocos: Row[]; unidades: Row[]; onClose: () => void; onConcluido?: () => void };

export function ExcluirBlocoDialog({ bloco, blocos, unidades, onClose, onConcluido }: Props) {
  const qc = useQueryClient();
  const id = s(bloco["id"]);
  const nome = s(bloco["nome"]);
  const minhas = unidades.filter((u) => s(u["cond_bloco_id"]) === id);
  const ocupadas = minhas.filter((u) => ["propria", "alugada"].includes(s(u["ocupacao"]))).length;
  const vazio = minhas.length === 0;
  const [acao, setAcao] = useState<"transferir" | "cascata">("transferir");
  const [destino, setDestino] = useState("");
  const [digitado, setDigitado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const opcoes = blocos.filter((b) => s(b["id"]) !== id).map((b) => ({ value: s(b["id"]), label: s(b["nome"]) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  const conflitos = useMemo(() => destino
    ? numerosEmConflito(minhas.map((u) => s(u["numero"])), unidades.filter((u) => s(u["cond_bloco_id"]) === destino).map((u) => s(u["numero"])))
    : [], [destino, minhas, unidades]);

  const pode = vazio || (acao === "transferir" ? !!destino && conflitos.length === 0 : nomeConfere(digitado, nome));

  async function concluir() {
    const destNome = opcoes.find((o) => o.value === destino)?.label;
    const ok = await confirmar({
      title: vazio ? `Excluir ${nome}?` : acao === "transferir" ? `Transferir ${minhas.length} unidade(s) para ${destNome} e excluir ${nome}?` : `Apagar ${nome} e todas as ${minhas.length} unidade(s)?`,
      description: vazio || acao === "transferir" ? "Moradores, veículos e documentos são mantidos." : "Moradores vinculados, veículos, pets e documentos dessas unidades serão apagados. Não é possível desfazer.",
      destructive: true, confirmText: vazio ? "Excluir" : acao === "transferir" ? "Transferir e excluir" : "Apagar tudo",
    });
    if (!ok) return;
    setOcupado(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("cond_bloco_excluir", { p_bloco: id, p_destino: !vazio && acao === "transferir" ? destino : null });
      if (error) throw new Error(error.message);
      toast.success(!vazio && acao === "transferir" ? "Unidades transferidas e bloco excluído." : "Bloco excluído.");
      await qc.invalidateQueries({ queryKey: ["cond"] });
      onConcluido?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o bloco.");
    } finally { setOcupado(false); }
  }

  const Card = ({ v, icone: I, titulo, desc }: { v: "transferir" | "cascata"; icone: typeof Trash2; titulo: string; desc: string }) => (
    <button type="button" aria-pressed={acao === v} onClick={() => setAcao(v)}
      className={cn("flex w-full items-start gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        acao === v ? (v === "cascata" ? "border-destructive bg-destructive/5" : "border-primary bg-primary/5") : "hover:bg-muted/40")}>
      <I className={cn("mt-0.5 size-5 shrink-0", v === "cascata" ? "text-destructive" : "text-primary")} />
      <span><span className="block text-sm font-medium">{titulo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[100] max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Excluir {nome}</DialogTitle>
          <DialogDescription>{vazio ? "Este bloco não tem unidades." : `Este bloco tem ${minhas.length} unidade(s), ${ocupadas} com moradores.`}</DialogDescription>
        </DialogHeader>
        {!vazio && (
          <div className="space-y-3">
            <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>Antes de excluir, escolha o que fazer com as unidades.</span>
            </div>
            <Card v="transferir" icone={ArrowRightLeft} titulo="Transferir unidades para outro bloco" desc="Mantém moradores, veículos, pets e documentos." />
            <Card v="cascata" icone={Trash2} titulo="Apagar o bloco e todas as unidades" desc="Remove tudo de forma definitiva." />
            {acao === "transferir" ? (
              <div className="space-y-1.5">
                <Label>Bloco de destino</Label>
                {opcoes.length ? <SearchSelect value={destino} options={opcoes} onChange={setDestino} placeholder="Escolha o bloco" />
                  : <p className="text-sm text-muted-foreground">Não há outro bloco. Crie um bloco antes de transferir.</p>}
                {conflitos.length > 0 && <p role="alert" className="text-sm text-destructive">O destino já tem as unidades {conflitos.join(", ")}. Renomeie antes de transferir.</p>}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="conf-bloco">Para confirmar, digite <strong>{nome}</strong></Label>
                <Input id="conf-bloco" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant={acao === "cascata" || vazio ? "destructive" : "default"} disabled={!pode || ocupado} onClick={concluir}>
            {ocupado && <Loader2 className="size-4 animate-spin" />}
            {vazio ? "Excluir" : acao === "transferir" ? "Transferir e excluir" : "Apagar tudo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
