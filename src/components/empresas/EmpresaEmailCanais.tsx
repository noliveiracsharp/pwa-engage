import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useCanaisEmail } from "@/components/email/SeletorCanalEmail";
import { FINALIDADES, PROVEDORES_SMTP, type CanalEmail } from "@/lib/email-canais";

type Form = Omit<CanalEmail, "id" | "empresa_id"> & { id?: string };
const NOVO: Form = {
  nome: "", finalidades: [], padrao: false, ativo: true, email_modo: "proprio",
  smtp_host: "smtp.hostinger.com", smtp_porta: 465, smtp_usuario: "", remetente_nome: "", remetente_email: "", responder_para: "",
};

async function erroDaFuncao(error: unknown, data: unknown) {
  let msg = (data as { erro?: string } | null)?.erro;
  if (error) {
    msg = (error as Error).message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) msg = ((await ctx.json()) as { erro?: string }).erro ?? msg; } catch { /* */ }
    if (/Failed to send|404/i.test(msg ?? "")) msg = 'Publique a versão nova da função "cobranca-regua" (v9).';
  }
  return msg;
}

/** Canais de disparo: vários e-mails de saída por empresa (Sistema, Comercial, Compras…). */
export function EmpresaEmailCanais({ empresaId, readOnly }: { empresaId: string; readOnly: boolean }) {
  const qc = useQueryClient();
  const { data: canais, isLoading, error } = useCanaisEmail(empresaId);
  const [semScript, setSemScript] = useState(false);
  const [comSenha, setComSenha] = useState<string[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from("empresas_email_canais" as never).select("id").limit(1).then(({ error: e }) => setSemScript(!!e));
    void supabase.rpc("email_canais_com_senha" as never, { p_empresa_id: empresaId } as never).then(({ data }) => setComSenha(((data ?? []) as unknown[]).map((x) => String(typeof x === "object" && x ? Object.values(x)[0] : x))));
  }, [empresaId, canais]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["email-canais", empresaId] });

  if (semScript || error) return <p className="text-sm text-muted-foreground">Rode o script "atendeai-email-canais.sql" no banco para cadastrar vários e-mails de envio.</p>;
  if (isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f!, [k]: v }));

  const salvar = async () => {
    if (!form) return;
    if (!form.nome.trim()) return void toast.error("Dê um nome ao canal (ex.: Comercial).");
    setSalvando(true);
    const { id, ...dados } = form;
    const linha = { ...dados, empresa_id: empresaId, atualizado_em: new Date().toISOString() };
    const r = id
      ? await supabase.from("empresas_email_canais" as never).update(linha as never).eq("id", id).select("id").single()
      : await supabase.from("empresas_email_canais" as never).insert(linha as never).select("id").single();
    if (r.error) { setSalvando(false); return void toast.error("Não foi possível salvar o canal."); }
    const canalId = (r.data as { id: string }).id;
    if (form.padrao) await supabase.from("empresas_email_canais" as never).update({ padrao: false } as never).eq("empresa_id", empresaId).neq("id", canalId);
    if (senha) {
      const s = await supabase.rpc("email_canal_salvar_senha" as never, { p_canal_id: canalId, p_senha: senha } as never);
      if (s.error) toast.error("Canal salvo, mas a senha não foi gravada.");
    }
    setSalvando(false); setForm(null); setSenha("");
    toast.success("Canal de e-mail salvo.");
    void recarregar();
  };

  const excluir = async (c: CanalEmail) => {
    if (!(await confirmar({ titulo: "Excluir canal", mensagem: `Excluir o canal "${c.nome}"?`, destrutivo: true } as never))) return;
    const { error: e } = await supabase.from("empresas_email_canais" as never).delete().eq("id", c.id);
    if (e) return void toast.error("Não foi possível excluir.");
    void recarregar();
  };

  const testar = async (c: CanalEmail) => {
    const para = c.responder_para || c.remetente_email;
    if (!para) return void toast.error("Informe o e-mail do remetente no canal.");
    setTestando(c.id);
    const { data, error: e } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "email_testar", empresa_id: empresaId, para, canal_id: c.id } });
    setTestando(null);
    const msg = await erroDaFuncao(e, data);
    if (msg) return void toast.error(msg);
    toast.success(`Teste enviado de ${c.remetente_email || c.nome} para ${para}.`);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">Canais de disparo</p>
          <p className="text-xs text-muted-foreground">Cadastre um e-mail para cada área (ex.: no-reply, comercial, compras). Ao enviar, o sistema pergunta de qual disparar.</p>
        </div>
        {!readOnly && <Button type="button" size="sm" onClick={() => { setForm({ ...NOVO }); setSenha(""); }}><Plus className="mr-1 h-4 w-4" />Novo canal</Button>}
      </div>
      {!canais?.length && <p className="text-sm text-muted-foreground">Nenhum canal ainda — todos os envios usam o e-mail geral acima.</p>}
      <div className="divide-y divide-border">
        {canais?.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.nome} {c.padrao && <Badge className="ml-1">padrão</Badge>} {!c.ativo && <Badge variant="outline" className="ml-1">inativo</Badge>}</p>
              <p className="truncate text-xs text-muted-foreground">{c.remetente_email || c.smtp_usuario || "—"} · {c.finalidades.map((f) => FINALIDADES.find((x) => x.valor === f)?.rotulo ?? f).join(", ") || "sem finalidade"}{c.email_modo === "proprio" && !comSenha.includes(c.id) ? " · sem senha" : ""}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" title="Enviar teste" onClick={() => testar(c)} disabled={testando === c.id}>{testando === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            {!readOnly && <Button type="button" variant="ghost" size="icon" title="Editar" onClick={() => { setForm({ ...c }); setSenha(""); }}><Pencil className="h-4 w-4" /></Button>}
            {!readOnly && <Button type="button" variant="ghost" size="icon" title="Excluir" onClick={() => excluir(c)}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form?.id ? "Editar canal" : "Novo canal de e-mail"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Nome do canal</Label><Input placeholder="Comercial" value={form.nome} onChange={(e) => set("nome", e.target.value)} /></div>
              <div className="space-y-1">
                <Label>Como enviar</Label>
                <Select value={form.email_modo} onValueChange={(v) => set("email_modo", v as Form["email_modo"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proprio">E-mail próprio (SMTP: Hostinger, Amazon SES, Google…)</SelectItem>
                    <SelectItem value="sistema">E-mail do sistema (módulo adicional)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Usar para</Label>
                <div className="flex flex-wrap gap-4">
                  {FINALIDADES.map((f) => (
                    <label key={f.valor} className="flex items-center gap-2 text-sm" title={f.uso}>
                      <Switch checked={form.finalidades.includes(f.valor)} onCheckedChange={(v) => set("finalidades", v ? [...form.finalidades, f.valor] : form.finalidades.filter((x) => x !== f.valor))} />
                      {f.rotulo} <span className="text-xs text-muted-foreground">({f.uso})</span>
                    </label>
                  ))}
                </div>
              </div>
              {form.email_modo === "proprio" && (<>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Provedor</Label>
                  <Select value={PROVEDORES_SMTP.find((p) => p.host === form.smtp_host)?.host ?? "outro"} onValueChange={(v) => { const p = PROVEDORES_SMTP.find((x) => x.host === v); if (p) { set("smtp_host", p.host); set("smtp_porta", p.porta); } }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVEDORES_SMTP.map((p) => <SelectItem key={p.host} value={p.host}>{p.nome}</SelectItem>)}
                      <SelectItem value="outro">Outro (preencher abaixo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Servidor de saída</Label><Input value={form.smtp_host ?? ""} onChange={(e) => set("smtp_host", e.target.value)} /></div>
                <div className="space-y-1"><Label>Porta</Label><Input type="number" value={form.smtp_porta} onChange={(e) => set("smtp_porta", Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Usuário</Label><Input placeholder="comercial@suaempresa.com" value={form.smtp_usuario ?? ""} onChange={(e) => set("smtp_usuario", e.target.value)} /></div>
                <div className="space-y-1"><Label>Senha {form.id && comSenha.includes(form.id) && <Badge variant="secondary" className="ml-1">cadastrada</Badge>}</Label><Input type="password" autoComplete="new-password" placeholder={form.id && comSenha.includes(form.id) ? "•••••• (deixe em branco para manter)" : "Senha da caixa de e-mail"} value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
              </>)}
              <div className="space-y-1"><Label>Nome do remetente</Label><Input value={form.remetente_nome ?? ""} onChange={(e) => set("remetente_nome", e.target.value)} /></div>
              <div className="space-y-1"><Label>E-mail do remetente</Label><Input type="email" value={form.remetente_email ?? ""} onChange={(e) => set("remetente_email", e.target.value)} /></div>
              <div className="space-y-1"><Label>Responder para</Label><Input type="email" value={form.responder_para ?? ""} onChange={(e) => set("responder_para", e.target.value)} /></div>
              <div className="flex items-end gap-6 pb-2">
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.padrao} onCheckedChange={(v) => set("padrao", v)} />Padrão</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />Ativo</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button type="button" onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
