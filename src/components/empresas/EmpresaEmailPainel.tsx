import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmpresaEmailCanais } from "./EmpresaEmailCanais";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Cfg = {
  email_modo: "proprio" | "sistema";
  smtp_host: string; smtp_porta: number; smtp_usuario: string;
  remetente_nome: string; remetente_email: string; responder_para: string;
};
const PADRAO: Cfg = { email_modo: "proprio", smtp_host: "", smtp_porta: 465, smtp_usuario: "", remetente_nome: "", remetente_email: "", responder_para: "" };

/** Provedor de e-mail (SMTP) da empresa: usado no login (nova senha), Ofertas, cobranças e avisos. */
export function EmpresaEmailPainel({ empresaId, readOnly }: { empresaId: string; readOnly: boolean }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [semScript, setSemScript] = useState(false);
  const [temSenha, setTemSenha] = useState(false);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [paraTeste, setParaTeste] = useState("");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data, error } = await supabase.from("empresas_email_config" as never).select("*").eq("empresa_id", empresaId).maybeSingle();
      if (!vivo) return;
      if (error) { setSemScript(true); return; }
      setCfg({ ...PADRAO, ...((data as Partial<Cfg> | null) ?? {}) });
      const r = await supabase.rpc("empresa_email_tem_senha" as never, { p_empresa_id: empresaId } as never);
      if (vivo) setTemSenha(r.data === true);
    })();
    return () => { vivo = false; };
  }, [empresaId]);

  if (semScript) return <p className="text-sm text-muted-foreground">Rode o script "atendeai-email-empresa.sql" no banco para liberar esta aba.</p>;
  if (!cfg) return <Loader2 className="mx-auto h-5 w-5 animate-spin" />;

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c!, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from("empresas_email_config" as never)
      .upsert({ ...cfg, empresa_id: empresaId, atualizado_em: new Date().toISOString() } as never);
    if (!error && senha) {
      const r = await supabase.rpc("empresa_email_salvar_senha" as never, { p_empresa_id: empresaId, p_senha: senha } as never);
      if (r.error) { setSalvando(false); toast.error("Configuração salva, mas a senha não foi gravada."); return; }
      setTemSenha(true); setSenha("");
    }
    setSalvando(false);
    if (error) return void toast.error("Não foi possível salvar o e-mail da empresa.");
    toast.success("E-mail da empresa salvo.");
  };

  const testar = async () => {
    const para = paraTeste || cfg.responder_para || cfg.remetente_email;
    if (!para) return void toast.error("Informe para qual e-mail enviar o teste.");
    setTestando(true);
    const { data, error } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "email_testar", empresa_id: empresaId, para } });
    setTestando(false);
    let msg = (data as { erro?: string } | null)?.erro;
    if (error) {
      msg = error.message;
      try { const ctx = (error as { context?: Response }).context; if (ctx) msg = ((await ctx.json()) as { erro?: string }).erro ?? msg; } catch { /* */ }
      if (/Failed to send|404/i.test(msg ?? "")) msg = 'Publique a versão nova da função "cobranca-regua".';
    }
    if (msg) return void toast.error(msg);
    toast.success(`E-mail de teste enviado para ${para}.`);
  };

  return (
    <div className="space-y-4">
      <EmpresaEmailCanais empresaId={empresaId} readOnly={readOnly} />
      <details className="group rounded-lg border border-border p-3">
        <summary className="cursor-pointer select-none text-sm font-medium">
          E-mail de contingência <span className="font-normal text-muted-foreground">— usado só se nenhum canal acima atender o envio</span>
        </summary>
        <div className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Como enviar</Label>
          <Select value={cfg.email_modo} onValueChange={(v) => set("email_modo", v as Cfg["email_modo"])} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="proprio">E-mail próprio da empresa (Hostinger, Amazon SES, Google, Microsoft…)</SelectItem>
              <SelectItem value="sistema">E-mail do sistema (módulo adicional)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {cfg.email_modo === "proprio" && (<>
          <div className="space-y-1"><Label>Servidor de saída</Label><Input disabled={readOnly} placeholder="smtp.hostinger.com" value={cfg.smtp_host ?? ""} onChange={(e) => set("smtp_host", e.target.value)} /></div>
          <div className="space-y-1"><Label>Porta</Label><Input disabled={readOnly} type="number" value={cfg.smtp_porta ?? 465} onChange={(e) => set("smtp_porta", Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Usuário</Label><Input disabled={readOnly} value={cfg.smtp_usuario ?? ""} onChange={(e) => set("smtp_usuario", e.target.value)} /></div>
          <div className="space-y-1"><Label>Senha {temSenha && <Badge variant="secondary" className="ml-1">cadastrada</Badge>}</Label><Input disabled={readOnly} type="password" autoComplete="new-password" placeholder={temSenha ? "•••••• (deixe em branco para manter)" : "Senha de app"} value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
        </>)}
        <div className="space-y-1"><Label>Nome do remetente</Label><Input disabled={readOnly} value={cfg.remetente_nome ?? ""} onChange={(e) => set("remetente_nome", e.target.value)} /></div>
        <div className="space-y-1"><Label>E-mail do remetente</Label><Input disabled={readOnly} type="email" value={cfg.remetente_email ?? ""} onChange={(e) => set("remetente_email", e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Responder para</Label><Input disabled={readOnly} type="email" value={cfg.responder_para ?? ""} onChange={(e) => set("responder_para", e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input className="max-w-xs" type="email" placeholder="Testar contingência para…" value={paraTeste} onChange={(e) => setParaTeste(e.target.value)} />
        <Button type="button" variant="outline" onClick={testar} disabled={testando}>{testando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Testar</Button>
        {!readOnly && <Button type="button" onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar contingência</Button>}
      </div>
        </div>
      </details>
    </div>
  );
}
