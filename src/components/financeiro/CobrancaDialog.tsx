import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Ban, Copy, FileDown, Landmark, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { abrirPdfBase64, chamarBanco, STATUS_COBRANCA } from "@/lib/banco-api";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowId, text, useTableRows } from "@/lib/crud";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { formatBRL, formatDate, num } from "@/lib/orcamentos";
import { gerarPixCopiaECola, mensagemCobranca, nomeBanco } from "@/lib/pix";
import { sanitizarTelefone } from "@/lib/atendimentos-envio";
import { pick, type Row } from "@/lib/row";

/** Cobrança de um título a receber: Pix copia e cola + QR, linha digitável/PDF do boleto e envio por WhatsApp. */
export function CobrancaDialog({ titulo, parceiro, onClose, onSaved }: { titulo: Row; parceiro: Row | undefined; onClose: () => void; onSaved: () => void }) {
  const { empresa } = useAuth();
  const { data: contas = [] } = useTableRows("financeiro_contas_bancarias");
  const ativas = useMemo(() => contas.filter((c) => c["ativo"] !== false), [contas]);
  const [contaId, setContaId] = useState(text(titulo["conta_bancaria_id"]));
  const [linha, setLinha] = useState(text(titulo["linha_digitavel"]));
  const [boletoUrl, setBoletoUrl] = useState(text(titulo["boleto_url"]));
  const [qr, setQr] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!contaId && ativas.length) setContaId(text(rowId(ativas.find((c) => c["padrao"]) ?? ativas[0]!)));
  }, [ativas, contaId]);
  const conta = ativas.find((c) => text(rowId(c)) === contaId);

  const pix = useMemo(() => {
    if (!conta?.["chave_pix"]) return "";
    try {
      return gerarPixCopiaECola({
        chave: text(conta["chave_pix"]), nome: text(conta["titular_nome"] || pick(empresa ?? {}, ["razao_social", "nome_fantasia"])),
        cidade: text(conta["cidade"] || pick(empresa ?? {}, ["cidade"])), valor: num(titulo["valor"]), txid: text(rowId(titulo)).replace(/-/g, "").slice(0, 25),
      });
    } catch { return ""; }
  }, [conta, titulo, empresa]);
  useEffect(() => { if (pix) void QRCode.toDataURL(pix, { margin: 1, width: 220 }).then(setQr); else setQr(""); }, [pix]);

  const copiar = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copiado."); };
  const [stCob, setStCob] = useState(text(titulo["cobranca_status"]));
  const [banco, setBanco] = useState<string | null>(null);
  const acaoBanco = async (acao: "emitir" | "consultar" | "pdf" | "cancelar") => {
    let motivo = "";
    if (acao === "cancelar") { if (!(await confirmar("Cancelar este boleto no banco?"))) return; motivo = "Cancelado pelo emissor"; }
    if (acao === "emitir" && contaId !== text(titulo["conta_bancaria_id"])) { if (!(await salvar(false))) return; }
    setBanco(acao);
    try {
      const r = await chamarBanco<Record<string, unknown>>(acao, { titulo_id: text(rowId(titulo)), motivo });
      if (acao === "pdf") abrirPdfBase64(text(r["pdf"]));
      else {
        if (r["linha_digitavel"]) setLinha(text(r["linha_digitavel"]));
        setStCob(acao === "cancelar" ? "cancelado" : text(r["cobranca_status"]));
        toast.success(acao === "emitir" ? "Boleto registrado no banco." : acao === "cancelar" ? "Boleto cancelado." : "Situação atualizada.");
        onSaved();
      }
    } catch (e) { toast.error((e as Error).message); }
    setBanco(null);
  };
  const salvar = async (enviado: boolean) => {
    setSalvando(true);
    const upd: Record<string, unknown> = { conta_bancaria_id: contaId || null, linha_digitavel: linha.trim() || null, boleto_url: boletoUrl.trim() || null, pix_copia_cola: pix || null };
    if (enviado) upd["cobranca_enviada_em"] = new Date().toISOString();
    const { error } = await supabase.from("financeiro_titulos").update(upd as never).eq("id", text(rowId(titulo)));
    setSalvando(false);
    if (error) { toast.error(erroFinanceiro(error)); return false; }
    onSaved(); return true;
  };
  const enviar = async () => {
    const fone = sanitizarTelefone(pick(parceiro ?? {}, ["whatsapp", "celular", "telefone", "telefone2"]));
    if (!fone) return void toast.error("Cliente sem telefone cadastrado.");
    if (!pix && !linha.trim()) return void toast.error("Informe a chave Pix da conta ou a linha digitável do boleto.");
    if (!(await salvar(true))) return;
    const msg = mensagemCobranca({
      cliente: text(pick(parceiro ?? {}, ["nome_fantasia", "razao_social"])), descricao: text(titulo["descricao"]), valor: formatBRL(titulo["valor"]),
      vencimento: formatDate(titulo["vencimento"]), pix, linha: linha.trim(), boletoUrl: boletoUrl.trim(), empresa: text(pick(empresa ?? {}, ["nome_fantasia", "razao_social"])),
    });
    window.open(`https://wa.me/${fone}?text=${encodeURIComponent(msg)}`, "_blank");
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Cobrança — Boleto + Pix</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg p-3 text-sm">
            <p className="font-medium">{text(titulo["descricao"])}</p>
            <p className="text-muted-foreground">{formatBRL(titulo["valor"])} • vence {formatDate(titulo["vencimento"])}</p>
          </div>
          {!ativas.length ? (
            <p className="text-warning text-sm">Cadastre uma conta bancária na aba "Contas Bancárias" para gerar o Pix.</p>
          ) : (
            <div className="space-y-1">
              <Label>Conta que recebe</Label>
              <Select value={contaId} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{ativas.map((c) => <SelectItem key={text(rowId(c))} value={text(rowId(c))}>{text(c["descricao"])} — {nomeBanco(c["banco"])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {conta && !pix && <p className="text-warning text-sm">Esta conta não tem chave Pix cadastrada.</p>}
          {pix && (
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              {qr && <img src={qr} alt="QR Code Pix" className="rounded border bg-background" data-zoom />}
              <div className="space-y-1">
                <Label>Pix copia e cola (com valor)</Label>
                <Textarea readOnly value={pix} className="h-28 font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copiar(pix)}><Copy className="mr-1 h-4 w-4" />Copiar Pix</Button>
              </div>
            </div>
          )}
          {conta?.["api_ativo"] === true && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Landmark className="text-primary h-4 w-4" />
                <span className="text-sm font-medium">Boleto + Pix pelo banco ({text(conta["provedor_api"])})</span>
                {stCob && <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COBRANCA[stCob]?.cls ?? "bg-muted"}`}>{STATUS_COBRANCA[stCob]?.label ?? stCob}</span>}
              </div>
              {text(titulo["cobranca_erro"]) && !stCob && <p className="text-destructive text-xs">Última tentativa: {text(titulo["cobranca_erro"])}</p>}
              <div className="flex flex-wrap gap-2">
                {(!stCob || stCob === "cancelado" || stCob === "baixado") ? (
                  <Button size="sm" disabled={!!banco} onClick={() => acaoBanco("emitir")}>{banco === "emitir" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Landmark className="mr-1 h-4 w-4" />}Emitir boleto pelo banco</Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" disabled={!!banco} onClick={() => acaoBanco("pdf")}><FileDown className="mr-1 h-4 w-4" />PDF oficial</Button>
                    <Button size="sm" variant="outline" disabled={!!banco} onClick={() => acaoBanco("consultar")}><RefreshCw className="mr-1 h-4 w-4" />Atualizar situação</Button>
                    {stCob !== "pago" && <Button size="sm" variant="outline" disabled={!!banco} onClick={() => acaoBanco("cancelar")}><Ban className="text-destructive mr-1 h-4 w-4" />Cancelar boleto</Button>}
                  </>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label>Linha digitável do boleto</Label><Input value={linha} onChange={(e) => setLinha(e.target.value)} placeholder="Cole aqui a linha gerada no Inter/Santander" /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Link do PDF do boleto (opcional)</Label><Input value={boletoUrl} onChange={(e) => setBoletoUrl(e.target.value)} placeholder="https://..." /></div>
          </div>
          {titulo["cobranca_enviada_em"] ? <p className="text-muted-foreground text-xs">Última cobrança enviada em {new Date(text(titulo["cobranca_enviada_em"])).toLocaleString("pt-BR")}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" disabled={salvando} onClick={async () => { if (await salvar(false)) { toast.success("Cobrança salva."); onClose(); } }}>Salvar</Button>
          <Button disabled={salvando} onClick={enviar}><MessageCircle className="mr-1 h-4 w-4" />Enviar no WhatsApp</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
