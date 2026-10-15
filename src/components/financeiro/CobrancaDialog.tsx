import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, MessageCircle } from "lucide-react";
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
