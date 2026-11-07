import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRightLeft, CalendarClock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import type { Row } from "@/lib/row";
import { ITENS_IMPACTO, OPCOES_PADRAO, confirmacaoValida, unidadeVazia, type Impacto, type Opcoes } from "@/lib/cond-transferencia";
import { PAPEIS, s, useCondRows } from "./cond-data";

const rpc = (fn: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).rpc(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;

type Props = {
  modo: "excluir" | "morador";
  unidade: Row;
  condominioId: string;
  vinculo?: Row;
  pessoaNome?: string;
  onClose: () => void;
  onConcluido?: () => void;
};

const dataBR = (x: string) => (x ? new Date(x).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

export function TransferenciaDialog({ modo, unidade, condominioId, vinculo, pessoaNome, onClose, onConcluido }: Props) {
  const qc = useQueryClient();
  const uid = s(unidade["id"]);
  const numero = s(unidade["numero"]);
  const { data: impacto, isLoading } = useQuery({
    queryKey: ["cond", "impacto", uid],
    queryFn: async () => {
      const { data, error } = await rpc("cond_unidade_impacto", { p_unidade: uid });
      if (error) throw new Error(error.message);
      return data as Impacto;
    },
  });
  const { data: unidades = [] } = useCondRows("cond_unidades", "condominio_id", condominioId);
  const { data: blocos = [] } = useCondRows("cond_blocos", "condominio_id", condominioId, "ordem");
  const destinos = useMemo(() => {
    const bn = new Map(blocos.map((b) => [s(b["id"]), s(b["nome"])]));
    return unidades.filter((u) => s(u["id"]) !== uid)
      .map((u) => ({ value: s(u["id"]), label: `${bn.get(s(u["cond_bloco_id"])) ?? ""} · Unidade ${s(u["numero"])}` }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true }));
  }, [unidades, blocos, uid]);

  const [acao, setAcao] = useState<"transferir" | "cascata">(modo === "morador" ? "transferir" : "transferir");
  const [destino, setDestino] = useState("");
  const [papel, setPapel] = useState(s(vinculo?.["papel"]));
  // No morador, itens da unidade só vão junto se o usuário pedir.
  const [op, setOp] = useState<Opcoes>(modo === "morador" ? { veiculos: false, pets: false, contatos: false, documentos: false, vagas: false, agendamentos: true } : OPCOES_PADRAO);
  const [digitado, setDigitado] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const vazia = impacto ? unidadeVazia(impacto) : false;
  const ags = impacto?.agendamentos_lista ?? [];
  const itens = impacto ? ITENS_IMPACTO.filter((x) => (impacto[x.k] ?? 0) > 0) : [];
  const opcoesVisiveis = ITENS_IMPACTO.filter((x) => x.k !== "pessoas" && (impacto?.[x.k] ?? 0) > 0) as { k: keyof Opcoes; l: string }[];

  const podeConfirmar = modo === "morador" ? !!destino
    : vazia || (acao === "transferir" ? !!destino : confirmacaoValida(digitado, numero));

  async function concluir() {
    setOcupado(true);
    try {
      if (modo === "morador") {
        const { error } = await rpc("cond_morador_transferir", { p_vinculo: s(vinculo?.["id"]), p_destino: destino, p_papel: papel, p_opcoes: { ...op, agendamentos_pessoa: op.agendamentos } });
        if (error) throw new Error(error.message);
        toast.success(`${pessoaNome ?? "Pessoa"} transferida.`);
      } else {
        if (vazia && !(await confirmar({ title: `Excluir a unidade ${numero}?`, description: "A unidade está vazia e será removida.", destructive: true, confirmText: "Excluir" }))) return;
        const { error } = await rpc("cond_unidade_excluir", { p_unidade: uid, p_destino: !vazia && acao === "transferir" ? destino : null, p_opcoes: op });
        if (error) throw new Error(error.message);
        toast.success(acao === "transferir" && !vazia ? "Cadastros transferidos e unidade excluída." : "Unidade excluída.");
      }
      await qc.invalidateQueries({ queryKey: ["cond"] });
      onConcluido?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally { setOcupado(false); }
  }

  const Opcao = ({ k, l }: { k: keyof Opcoes; l: string }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <Label htmlFor={`op-${k}`} className="font-normal">{modo === "morador" ? `Levar ${l.toLowerCase()} da unidade` : `Transferir ${l.toLowerCase()}`} <span className="text-muted-foreground">({impacto?.[k] ?? 0})</span></Label>
      <Switch id={`op-${k}`} checked={op[k]} onCheckedChange={(c) => setOp({ ...op, [k]: c })} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[100] max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {modo === "morador" ? <><ArrowRightLeft className="size-5" /> Transferir {pessoaNome ?? "pessoa"}</> : <><Trash2 className="size-5 text-destructive" /> Excluir unidade {numero}</>}
          </DialogTitle>
          <DialogDescription>
            {modo === "morador" ? `Mover o cadastro da unidade ${numero} para outra unidade. Os dados pessoais continuam os mesmos.` : "Antes de excluir, veja o que está ligado a esta unidade."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-4">
            {modo === "excluir" && (vazia
              ? <p className="rounded-lg border bg-muted/30 p-3 text-sm">Esta unidade está vazia: não há pessoas, veículos, pets, vagas nem agendamentos.</p>
              : <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <p className="mb-2 flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warning" /> Esta unidade possui cadastros:</p>
                  <ul className="grid gap-1 sm:grid-cols-2">{itens.map((x) => <li key={x.k}>• {x.l}: <strong>{impacto?.[x.k]}</strong></li>)}</ul>
                </div>)}

            {ags.length > 0 && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="mb-2 flex items-center gap-2 font-medium"><CalendarClock className="size-4 text-primary" /> {ags.length} agendamento(s) futuro(s)</p>
                <ul className="space-y-1">{ags.map((a, i) => <li key={i}>• <strong>{a.espaco}</strong> — {dataBR(a.inicio)}{a.titular ? ` · ${a.titular}` : ""}</li>)}</ul>
              </div>
            )}

            {modo === "excluir" && !vazia && (
              <div className="grid gap-2 sm:grid-cols-2">
                {([["transferir", "Transferir para outra unidade", ArrowRightLeft], ["cascata", "Apagar tudo junto", Trash2]] as const).map(([v, l, I]) => (
                  <button key={v} type="button" onClick={() => setAcao(v)}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${acao === v ? (v === "cascata" ? "border-destructive bg-destructive/10" : "border-primary bg-primary/10") : "hover:bg-muted/40"}`}>
                    <I className="size-4" /> {l}
                  </button>
                ))}
              </div>
            )}

            {(modo === "morador" || (!vazia && acao === "transferir")) && (
              <>
                <div><Label className="mb-1.5 block">Unidade de destino *</Label>
                  <SearchSelect value={destino} onChange={setDestino} options={destinos} placeholder="Buscar unidade" /></div>
                {modo === "morador" && (
                  <div><Label className="mb-1.5 block">Papel na nova unidade</Label>
                    <SearchSelect value={papel} allowClear={false} onChange={setPapel} options={[...PAPEIS].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} /></div>
                )}
                {opcoesVisiveis.length > 0 && <div className="space-y-2">{opcoesVisiveis.map((x) => <Opcao key={x.k} k={x.k} l={x.l} />)}</div>}
                {modo === "excluir" && <p className="text-xs text-muted-foreground">Pessoas sempre vão para a unidade de destino. Itens desmarcados serão apagados com a unidade; agendamentos desmarcados serão cancelados.</p>}
              </>
            )}

            {modo === "excluir" && !vazia && acao === "cascata" && (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p>Os vínculos, veículos, pets, contatos e documentos desta unidade serão apagados, as vagas ficarão livres e os agendamentos serão cancelados. <strong>O cadastro das pessoas continua no sistema.</strong></p>
                <Label htmlFor="conf-num" className="block">Digite <strong>{numero}</strong> para confirmar</Label>
                <Input id="conf-num" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant={modo === "excluir" && (vazia || acao === "cascata") ? "destructive" : "default"} disabled={!podeConfirmar || ocupado || isLoading} onClick={concluir}>
            {ocupado && <Loader2 className="size-4 animate-spin" />}
            {modo === "morador" ? "Transferir" : vazia ? "Excluir" : acao === "transferir" ? "Transferir e excluir" : "Excluir tudo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
