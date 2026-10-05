import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { uploadFoto } from "@/lib/laudos";
import { pick, type Row } from "@/lib/row";

/** Perfis que podem pular o checklist (com justificativa registrada). */
function usePodePular() {
  const { usuario, isMaster } = useAuth();
  const perfilId = pick<string>(usuario, ["perfil_id", "id_perfil"]);
  const { data } = useQuery({
    queryKey: ["perfil-desc", perfilId],
    enabled: !!perfilId && !isMaster,
    queryFn: async () => {
      const { data } = await supabase.from("perfil").select("*").eq("id", perfilId as never).maybeSingle();
      return String((data as Row | null)?.["descricao"] ?? "");
    },
  });
  return isMaster || /admin|gerente/i.test(data ?? "");
}

type Pedido = { atendimento: Row; etapa: Row; executar: () => Promise<boolean> };
type Valor = boolean | string;

/**
 * Stage-Gate: se a etapa de destino exige checklist, abre o formulário antes de mover.
 * `exigir` resolve `true` quando o movimento foi concluído (ou não precisava de checklist).
 */
export function useChecklistGate() {
  const { empresaId, usuarioId } = useAudit();
  const podePular = usePodePular();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [itens, setItens] = useState<Row[]>([]);
  const [valores, setValores] = useState<Record<string, Valor>>({});
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [pular, setPular] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ativo = (v: unknown) => v === true || v === 1 || ["true", "t", "1", "s", "sim"].includes(String(v ?? "").toLowerCase());

  // Sempre devolve true quando há etapa: a decisão real é feita em `exigir` com dados frescos do banco.
  function precisa(etapa: Row | undefined) {
    return !!etapa;
  }

  async function exigir(p: Pedido): Promise<boolean> {
    // Relê a etapa de destino para não depender de cache desatualizado.
    const { data: fresca } = await supabase.from("kanban_etapas").select("*").eq("id", String(p.etapa["id"])).maybeSingle();
    const etapa = { ...p.etapa, ...((fresca as Row | null) ?? {}) };
    if (!ativo(etapa["exige_checklist"])) return p.executar();
    if (!etapa["checklist_template_id"]) {
      toast.error("Esta etapa exige checklist, mas nenhum template está vinculado. Ajuste em Configurar quadro > Etapas.");
      return false;
    }
    p = { ...p, etapa };
    setPedido(p); setValores({}); setPular(false); setJustificativa(""); setCarregando(true);
    const { data, error } = await supabase.from("checklists_itens").select("*")
      .eq("template_id", String(p.etapa["checklist_template_id"])).order("ordem");
    setCarregando(false);
    if (error) { toast.error(error.message); setPedido(null); return false; }
    setItens((data ?? []) as Row[]);
    return new Promise((res) => { resolver.current = res; });
  }

  function fechar(ok: boolean) {
    setPedido(null);
    resolver.current?.(ok);
    resolver.current = null;
  }

  const preenchido = (it: Row) => {
    const v = valores[String(it["id"])];
    return typeof v === "boolean" ? v : !!String(v ?? "").trim();
  };
  const faltando = itens.filter((it) => it["obrigatorio"] !== false && !preenchido(it)).length;
  const liberado = pular ? justificativa.trim().length > 0 : faltando === 0;

  async function confirmar() {
    if (!pedido) return;
    setOcupado(true);
    const respostas: Row = {};
    for (const it of itens) {
      const id = String(it["id"]);
      respostas[id] = { descricao: it["descricao"], tipo: it["tipo"] ?? "checkbox", valor: valores[id] ?? null };
    }
    const { error } = await supabase.from("atendimentos_checklists").insert({
      empresa_id: pick(pedido.atendimento, ["empresa_id"]) ?? empresaId,
      atendimento_id: pedido.atendimento["id"],
      etapa_destino_id: pedido.etapa["id"],
      template_id: pedido.etapa["checklist_template_id"],
      preenchido_por: usuarioId,
      respostas,
      ignorado: pular,
      justificativa: pular ? justificativa.trim() : null,
    } as never);
    if (error) { setOcupado(false); toast.error(`Não foi possível salvar o checklist. ${error.message}`); return; }
    const ok = await pedido.executar();
    setOcupado(false);
    if (ok) toast.success("Checklist registrado e atendimento transferido.");
    fechar(ok);
  }

  async function anexar(id: string, file: File) {
    setEnviando(id);
    try {
      const url = await uploadFoto(file);
      setValores((v) => ({ ...v, [id]: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio do anexo.");
    } finally { setEnviando(null); }
  }

  const dialog = (
    <Dialog open={!!pedido} onOpenChange={(o) => !o && !ocupado && fechar(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /> Requisitos para Transferência</DialogTitle>
          <DialogDescription>
            Para entrar em <strong>{String(pedido?.etapa["descricao"] ?? "")}</strong>, preencha os itens abaixo.
          </DialogDescription>
        </DialogHeader>
        {carregando ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            {itens.length === 0 && <p className="text-sm text-muted-foreground">Este checklist ainda não tem itens.</p>}
            {itens.map((it) => {
              const id = String(it["id"]);
              const tipo = String(it["tipo"] ?? "checkbox");
              const obrig = it["obrigatorio"] !== false;
              const rotulo = <>{String(it["descricao"])}{obrig && <span className="text-destructive"> *</span>}</>;
              if (tipo === "texto") return (
                <div key={id} className="space-y-1">
                  <Label>{rotulo}</Label>
                  <Textarea rows={2} value={String(valores[id] ?? "")} onChange={(e) => setValores((v) => ({ ...v, [id]: e.target.value }))} />
                </div>
              );
              if (tipo === "anexo") {
                const url = String(valores[id] ?? "");
                return (
                  <div key={id} className="space-y-1">
                    <Label>{rotulo}</Label>
                    {url ? (
                      <div className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary underline">Anexo enviado</a>
                        <Button size="icon" variant="ghost" aria-label="Remover anexo" onClick={() => setValores((v) => ({ ...v, [id]: "" }))}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <Input type="file" disabled={enviando === id} onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexar(id, f); }} />
                    )}
                    {enviando === id && <p className="text-xs text-muted-foreground">Enviando…</p>}
                  </div>
                );
              }
              return (
                <label key={id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm">
                  <Checkbox checked={valores[id] === true} onCheckedChange={(c) => setValores((v) => ({ ...v, [id]: c === true }))} />
                  <span>{rotulo}</span>
                </label>
              );
            })}
            {podePular && (
              <div className="space-y-2 rounded-md border border-dashed border-warning/60 p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={pular} onCheckedChange={setPular} /> Transferir sem checklist (urgência)
                </label>
                {pular && <Textarea rows={2} placeholder="Justificativa (obrigatória)" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {!pular && faltando > 0 && <p className="mr-auto self-center text-xs text-muted-foreground">{faltando} item(ns) obrigatório(s) pendente(s)</p>}
          <Button variant="outline" disabled={ocupado} onClick={() => fechar(false)}>Cancelar</Button>
          <Button disabled={!liberado || ocupado || carregando || !!enviando} onClick={confirmar}>
            {ocupado && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Confirmar e Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { exigir, precisa, dialog };
}
