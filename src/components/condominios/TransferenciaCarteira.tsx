import { useState } from "react";
import { ArrowRightLeft, Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { acaoParaCnpj, acoesPermitidas, soDigitos, type SituacaoCnpj } from "@/lib/cond-transf-gestao";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
type Transf = { id: string; condominio_id: string; cnpj: string; empresa_origem_id: string | null; empresa_destino_id: string; status: string; motivo: string | null; resposta: string | null; created_at: string };
const SCRIPT = "Rode o script conectcon-condominios-transferencia.sql no banco.";

/** Botão + modal: consultar CNPJ, pedir transferência e responder pedidos da carteira. */
export function TransferenciaCarteira() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [sit, setSit] = useState<SituacaoCnpj | null>(null);
  const [busy, setBusy] = useState(false);

  const minha = useQuery({ queryKey: ["cond", "minha-empresa"], retry: false, queryFn: async () => {
    const r = await db().rpc("cond_minha_empresa"); if (r.error) throw r.error; return String(r.data ?? "");
  } });
  const lista = useQuery({ queryKey: ["cond", "transferencias"], retry: false, enabled: !!minha.data, queryFn: async () => {
    const r = await db().from("cond_transferencias").select("*").order("created_at", { ascending: false }).limit(50);
    if (r.error) throw r.error; return (r.data ?? []) as Transf[];
  } });
  const pendentesParaMim = (lista.data ?? []).filter((t) => t.status === "pendente" && t.empresa_origem_id === minha.data).length;

  async function consultar() {
    setBusy(true); setSit(null);
    const r = await db().rpc("cond_cnpj_situacao", { p_cnpj: soDigitos(cnpj) });
    setBusy(false);
    if (r.error) { toast.error(/function|schema/i.test(r.error.message) ? SCRIPT : r.error.message); return; }
    setSit(r.data as SituacaoCnpj);
  }
  async function solicitar() {
    const motivo = await perguntar({ title: "Solicitar transferência", description: "Explique o motivo (ex.: eleita em assembleia de 10/11). A administradora atual receberá o pedido.", multiline: true, placeholder: "Motivo", confirmText: "Enviar pedido" });
    if (motivo === null) return;
    const r = await db().rpc("cond_transf_solicitar", { p_cnpj: soDigitos(cnpj), p_motivo: motivo });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Pedido enviado. Você será avisado quando a administradora responder.");
    setSit(null); setCnpj(""); void qc.invalidateQueries({ queryKey: ["cond", "transferencias"] });
  }
  async function responder(t: Transf, acao: "aprovar" | "recusar" | "cancelar") {
    let resposta: string | null = "";
    if (acao === "aprovar" && !(await confirmar({ title: "Aprovar transferência?", description: "O condomínio, com unidades, moradores e histórico, passa para a outra administradora e sai da sua carteira.", confirmText: "Aprovar", destructive: true }))) return;
    if (acao === "recusar") { resposta = await perguntar({ title: "Recusar transferência", description: "Informe o motivo da recusa.", multiline: true, required: true, confirmText: "Recusar" }); if (resposta === null) return; }
    if (acao === "cancelar" && !(await confirmar("Cancelar este pedido?"))) return;
    const r = await db().rpc("cond_transf_responder", { p_id: t.id, p_acao: acao, p_resposta: resposta });
    if (r.error) { toast.error(r.error.message); return; }
    toast.success(acao === "aprovar" ? "Transferência concluída." : acao === "recusar" ? "Pedido recusado." : "Pedido cancelado.");
    for (const k of [["cond", "transferencias"], ["table", "parceiros"], ["ambientes"]]) void qc.invalidateQueries({ queryKey: k });
  }

  const acao = acaoParaCnpj(sit);
  const fmtCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const rotStatus: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} className="relative">
        <ArrowRightLeft className="mr-1 size-4" /> Transferências
        {pendentesParaMim > 0 && <Badge variant="destructive" className="ml-2 h-5 px-1.5">{pendentesParaMim}</Badge>}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transferência de gestão</DialogTitle>
            <DialogDescription>Digite o CNPJ do condomínio. Se ele estiver com outra administradora, peça a transferência online.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={cnpj} onChange={(e) => { setCnpj(e.target.value); setSit(null); }} placeholder="CNPJ do condomínio" inputMode="numeric" aria-label="CNPJ do condomínio"
              onKeyDown={(e) => { if (e.key === "Enter") void consultar(); }} />
            <Button onClick={consultar} disabled={busy || soDigitos(cnpj).length !== 14}><Search className="mr-1 size-4" /> Consultar</Button>
          </div>
          {sit && (
            <div className="rounded-lg border p-3 text-sm">
              {acao === "nada" && "CNPJ inválido."}
              {acao === "cadastrar" && "CNPJ não cadastrado. Cadastre o condomínio normalmente em Parceiros."}
              {acao === "ja_meu" && sit.situacao === "meu" && <>“{sit.nome}” já está na sua carteira.</>}
              {(acao === "solicitar" || acao === "aguardar") && sit.situacao === "outra" && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>“{sit.nome}” é administrado por <b>{sit.administradora ?? "outra administradora"}</b>.</span>
                  {acao === "solicitar" ? <Button size="sm" onClick={solicitar}>Solicitar transferência</Button> : <Badge variant="secondary">Já existe pedido pendente</Badge>}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Pedidos</p>
            {lista.error && <p className="text-sm text-muted-foreground">{SCRIPT}</p>}
            {!lista.error && !(lista.data ?? []).length && <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {(lista.data ?? []).map((t) => {
                const recebido = t.empresa_origem_id === minha.data;
                return (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{fmtCnpj(t.cnpj)} · {recebido ? "Pedido recebido" : "Pedido enviado"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}{t.motivo ? ` · ${t.motivo}` : ""}{t.resposta ? ` · Resposta: ${t.resposta}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === "pendente" ? "secondary" : "outline"}>{rotStatus[t.status] ?? t.status}</Badge>
                      {acoesPermitidas(t, minha.data ?? "").map((a) => (
                        <Button key={a} size="sm" variant={a === "aprovar" ? "default" : "outline"} onClick={() => responder(t, a)}>
                          {a === "aprovar" ? <Check className="mr-1 size-4" /> : <X className="mr-1 size-4" />}
                          {a === "aprovar" ? "Aprovar" : a === "recusar" ? "Recusar" : "Cancelar"}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
