import { useState } from "react";
import { KeyRound, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { text } from "@/lib/crud";
import { erroFinanceiro } from "@/lib/financeiro-db";
import { PROVEDORES_API, chamarBanco } from "@/lib/banco-api";
import type { Row } from "@/lib/row";

/** Configuração genérica da integração bancária de uma conta. Segredos nunca voltam para a tela. */
export function BancoApiSheet({ conta, onClose, onSaved }: { conta: Row; onClose: () => void; onSaved: () => void }) {
  const cfg = (conta["api_config"] as Record<string, unknown> | null) ?? {};
  const [provedor, setProvedor] = useState(text(conta["provedor_api"]) || "nenhum");
  const [ambiente, setAmbiente] = useState(text(conta["api_ambiente"]) || "producao");
  const [ativo, setAtivo] = useState(conta["api_ativo"] === true);
  const [contaCorrente, setContaCorrente] = useState(text(cfg["conta_corrente"]));
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [crt, setCrt] = useState("");
  const [key, setKey] = useState("");
  const [salvando, setSalvando] = useState(false);
  const credOk = conta["api_credenciais_ok"] === true;
  const ler = (f: File | undefined, set: (v: string) => void) => { if (f) void f.text().then(set); };

  const salvar = async () => {
    setSalvando(true);
    const id = text(conta["id"]);
    const semProv = provedor === "nenhum";
    const { error } = await supabase.from("financeiro_contas_bancarias" as never).update({
      provedor_api: semProv ? null : provedor, api_ambiente: ambiente, api_ativo: semProv ? false : ativo,
      api_config: { ...cfg, conta_corrente: contaCorrente.replace(/\D/g, "") || undefined },
    } as never).eq("id", id);
    if (!error && !semProv && (clientId || secret || crt || key)) {
      const r = await supabase.rpc("salvar_credenciais_banco" as never, { p_conta: id, p_client_id: clientId, p_client_secret: secret, p_crt: crt, p_key: key } as never);
      if (r.error) { setSalvando(false); return void toast.error(erroFinanceiro(r.error)); }
    }
    setSalvando(false);
    if (error) return void toast.error(erroFinanceiro(error));
    toast.success("Integração salva."); onSaved(); onClose();
  };

  const registrarWebhook = async () => {
    try { await chamarBanco("webhook_registrar", { conta_id: text(conta["id"]) }); toast.success("Baixa automática ativada no banco."); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Integração bancária — {text(conta["descricao"])}</SheetTitle>
          <SheetDescription>Emita boleto com Pix direto pelo banco e receba a baixa automática.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Banco da integração</Label>
              <Select value={provedor} onValueChange={setProvedor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum (conta manual)</SelectItem>
                  {PROVEDORES_API.map((p) => <SelectItem key={p.id} value={p.id} disabled={!p.disponivel}>{p.nome}{p.disponivel ? "" : " (em breve)"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ambiente</Label>
              <Select value={ambiente} onValueChange={setAmbiente}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="homologacao">Homologação (testes)</SelectItem><SelectItem value="producao">Produção</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {provedor !== "nenhum" && (
            <>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div><p className="font-medium">Integração ativa</p><p className="text-muted-foreground text-xs">Libera o botão "Emitir boleto pelo banco" nas cobranças.</p></div>
                <Switch checked={ativo} onCheckedChange={setAtivo} />
              </div>
              <div className="space-y-1">
                <Label>Conta corrente na API (só números, opcional)</Label>
                <Input value={contaCorrente} onChange={(e) => setContaCorrente(e.target.value)} placeholder="Usa agência/conta cadastradas se vazio" />
              </div>
              <div className={`rounded-lg p-3 text-sm ${credOk ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                <KeyRound className="mr-1 inline h-4 w-4" />
                {credOk ? "Credenciais já guardadas com segurança. Preencha só o que quiser trocar." : "Credenciais ainda não informadas."}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Client ID</Label><Input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" /></div>
                <div className="space-y-1"><Label>Client Secret</Label><Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" /></div>
              </div>
              <div className="space-y-1">
                <Label>Certificado (.crt)</Label>
                <Input type="file" accept=".crt,.pem,.cer" onChange={(e) => ler(e.target.files?.[0], setCrt)} />
                <Textarea value={crt ? "Certificado carregado ✓" : ""} readOnly className="h-10 text-xs" placeholder="Envie o arquivo .crt baixado no Internet Banking" />
              </div>
              <div className="space-y-1">
                <Label>Chave privada (.key)</Label>
                <Input type="file" accept=".key,.pem" onChange={(e) => ler(e.target.files?.[0], setKey)} />
                <Textarea value={key ? "Chave carregada ✓" : ""} readOnly className="h-10 text-xs" placeholder="Envie o arquivo .key" />
              </div>
              <p className="text-muted-foreground text-xs">Os segredos ficam numa área do banco de dados que nenhuma tela consegue ler — só o motor bancário.</p>
              {credOk && conta["api_ativo"] === true && (
                <Button variant="outline" onClick={registrarWebhook}><Webhook className="mr-1 h-4 w-4" />Ativar baixa automática (webhook)</Button>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>Salvar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
