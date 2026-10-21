import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Mail, MessageCircle, Play, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { EXEMPLO_EMAIL, montarEmailCobrancaHtml, ETAPAS_PADRAO, MODELO_EMAIL_ASSUNTO_PADRAO, MODELO_WHATSAPP_PADRAO, rotuloEtapa, type Canal, type Etapa } from "@/lib/regua-cobranca";
import { useAuth } from "@/hooks/useAuth";
import { BannersEmailButton, useBannersEmail } from "@/components/layout/BannersEmail";
import { escolherBanner } from "@/lib/regua-cobranca";
import { formatBRL } from "@/lib/orcamentos";
import { text } from "@/lib/crud";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PADRAO = {
  ativo: false, canais: ["whatsapp", "email"] as Canal[], hora_disparo: 9, dias_semana: [1, 2, 3, 4, 5] as number[], etapas: ETAPAS_PADRAO as Etapa[],
  boleto_modo: "nao", boleto_dias_antes: 5, boleto_dia_mes: 1, nota_modo: "nao",
  modelo_whatsapp: MODELO_WHATSAPP_PADRAO, modelo_email_assunto: MODELO_EMAIL_ASSUNTO_PADRAO, link_base: "https://pwa-engage.lovable.app",
  email_modo: "sistema", smtp_host: "", smtp_porta: 465, smtp_usuario: "", remetente_nome: "", remetente_email: "", responder_para: "",
  fiscal_ambiente: "homologacao", fiscal_tipo: "nfse", fiscal_config: {} as any,
};
type Cfg = typeof PADRAO & { atualizado_em?: string; ultima_execucao?: string };

async function chamar(acao: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("cobranca-regua", { body: { acao, ...extra } });
  if (error) {
    let msg = error.message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) msg = ((await ctx.json()) as { erro?: string }).erro ?? msg; } catch { /* */ }
    if (/Failed to send|404/i.test(msg)) msg = 'Motor da régua não instalado. Publique a função "cobranca-regua".';
    throw new Error(msg);
  }
  if ((data as { erro?: string })?.erro) throw new Error((data as { erro: string }).erro);
  return data as { log?: string[] };
}

export function ReguaCobranca({ canEdit }: { canEdit: boolean }) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [segredos, setSegredos] = useState({ tem_smtp: false, tem_fiscal: false });
  const [senha, setSenha] = useState("");
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [semScript, setSemScript] = useState(false);
  const empresaAtiva = useEmpresaAtiva();
  const [previa, setPrevia] = useState(false);
  const { empresa: empresaRow } = useAuth();
  const banners = useBannersEmail(empresaId);
  const htmlPrevia = useMemo(() => {
    const e = (empresaRow ?? {}) as Record<string, unknown>;
    const s = (k: string) => (e[k] ? String(e[k]) : null);
    return montarEmailCobrancaHtml({
      ...EXEMPLO_EMAIL, empresaNome: empresaAtiva.nome ?? "", logo: empresaAtiva.logo, cor: empresaAtiva.claro ?? "",
      vencimento: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), link: "#",
      documento: s("cnpj_cpf"), endereco: s("endereco"), telefone: s("telefone1"),
      emailContato: cfg?.responder_para || cfg?.remetente_email || null, site: empresaAtiva.site || null,
      banner: escolherBanner(banners.data?.rows ?? [], "cobranca"),
    });
  }, [banners.data, empresaAtiva.nome, empresaAtiva.logo, empresaAtiva.claro, empresaAtiva.site, empresaRow, cfg?.responder_para, cfg?.remetente_email]);

  useEffect(() => {
    void (async () => {
      const { data: emp, error } = await supabase.rpc("cobranca_minha_empresa" as never);
      if (error) { setSemScript(true); return; }
      setEmpresaId(emp as unknown as string);
      const { data } = await supabase.from("cobranca_regua" as never).select("*").maybeSingle();
      setCfg({ ...PADRAO, ...((data as unknown as Partial<Cfg>) ?? {}) });
      const { data: s } = await supabase.rpc("cobranca_segredos_resumo" as never);
      if (s) setSegredos(s as never);
    })();
  }, []);

  if (semScript) return <p className="text-muted-foreground text-sm">Rode o script da régua de cobrança no banco para liberar esta tela.</p>;
  if (!cfg) return <Loader2 className="mx-auto h-5 w-5 animate-spin" />;

  const set = (k: keyof Cfg, v: unknown) => setCfg((c) => ({ ...c!, [k]: v }));
  const setFc = (k: string, v: unknown) => setCfg((c) => ({ ...c!, fiscal_config: { ...(c!.fiscal_config ?? {}), [k]: v } }));
  const etapas: Etapa[] = cfg.etapas ?? [];
  const setEtapa = (i: number, p: Partial<Etapa>) => set("etapas", etapas.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const salvar = async () => {
    if (!empresaId) return;
    setSalvando(true);
    const { atualizado_em: _a, ultima_execucao: _u, ...resto } = cfg;
    const etapasOrd = [...etapas].sort((a, b) => a.dias - b.dias);
    const { error } = await supabase.from("cobranca_regua" as never).upsert({ ...resto, etapas: etapasOrd, empresa_id: empresaId, atualizado_em: new Date().toISOString() } as never);
    if (!error && (senha || token)) {
      const r = await supabase.rpc("cobranca_salvar_segredos" as never, { p_smtp_senha: senha, p_fiscal_token: token } as never);
      if (r.error) { setSalvando(false); toast.error("Configuração salva, mas a senha/token não foi gravada."); return; }
      setSegredos((s) => ({ tem_smtp: s.tem_smtp || !!senha, tem_fiscal: s.tem_fiscal || !!token })); setSenha(""); setToken("");
    }
    setSalvando(false);
    if (error) { toast.error("Não foi possível salvar a régua."); return; }
    set("etapas", etapasOrd);
    toast.success("Régua de cobrança salva.");
  };

  const executar = async () => {
    setRodando(true);
    try { const r = await chamar("executar"); toast.success(r.log?.length ? `Pronto: ${r.log.length} ação(ões).` : "Nada a enviar hoje."); }
    catch (e) { toast.error((e as Error).message); }
    setRodando(false);
  };
  const testarEmail = async () => {
    const para = cfg.responder_para || cfg.remetente_email;
    if (!para) return void toast.error("Preencha o e-mail do remetente ou de resposta para receber o teste.");
    try { await chamar("testar_email", { para }); toast.success(`E-mail de teste enviado para ${para}.`); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Tabs defaultValue="regua" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="regua">Régua</TabsTrigger>
          <TabsTrigger value="emissao">Boleto e nota</TabsTrigger>
          <TabsTrigger value="email">E-mail</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria de leitura</TabsTrigger>
        </TabsList>
        <div className="flex gap-2">
          <BannersEmailButton empresaId={empresaId} cor={empresaAtiva.claro ?? ""} canEdit={canEdit} />
          <Button variant="outline" disabled={rodando} onClick={executar}>{rodando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Executar agora</Button>
          {canEdit && <Button disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar</Button>}
        </div>
      </div>

      <TabsContent value="regua" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Disparo automático</CardTitle><CardDescription>O sistema confere os títulos a receber todos os dias no horário escolhido.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 sm:col-span-2"><Switch checked={cfg.ativo} onCheckedChange={(v) => set("ativo", v)} /><Label>Régua ligada</Label></div>
            <div className="space-y-2">
              <Label>Canais da empresa</Label>
              <div className="flex gap-4">
                {(["whatsapp", "email"] as Canal[]).map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={cfg.canais.includes(c)} onCheckedChange={() => set("canais", toggle(cfg.canais, c))} />{c === "whatsapp" ? "WhatsApp" : "E-mail"}</label>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">Cada cliente pode ter a própria preferência no cadastro dele.</p>
            </div>
            <div className="space-y-1">
              <Label>Horário do disparo</Label>
              <Select value={String(cfg.hora_disparo)} onValueChange={(v) => set("hora_disparo", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Dias da semana</Label>
              <div className="flex flex-wrap gap-3">
                {SEMANA.map((d, i) => <label key={d} className="flex items-center gap-1.5 text-sm"><Checkbox checked={cfg.dias_semana.includes(i)} onCheckedChange={() => set("dias_semana", toggle(cfg.dias_semana, i))} />{d}</label>)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div><CardTitle className="text-base">Etapas da régua</CardTitle><CardDescription>Negativo = antes de vencer, 0 = no dia, positivo = em atraso.</CardDescription></div>
            <Button size="sm" variant="outline" onClick={() => set("etapas", [...etapas, { dias: 1, canais: ["whatsapp"], ativo: true }])}><Plus className="mr-1 h-4 w-4" />Etapa</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {etapas.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
                <Switch checked={e.ativo} onCheckedChange={(v) => setEtapa(i, { ativo: v })} />
                <Input type="number" className="w-20" value={e.dias} onChange={(ev) => setEtapa(i, { dias: Number(ev.target.value) })} />
                <span className="text-muted-foreground w-44 text-sm">{rotuloEtapa(e.dias)}</span>
                {(["whatsapp", "email"] as Canal[]).map((c) => (
                  <label key={c} className="flex items-center gap-1.5 text-sm"><Checkbox checked={e.canais.includes(c)} onCheckedChange={() => setEtapa(i, { canais: toggle(e.canais, c) })} />{c === "whatsapp" ? "WhatsApp" : "E-mail"}</label>
                ))}
                <Button size="icon" variant="ghost" className="ml-auto" onClick={() => set("etapas", etapas.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Mensagens</CardTitle><CardDescription>Variáveis: {"{cliente} {empresa} {descricao} {valor} {vencimento} {aviso} {link}"}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1"><Label>WhatsApp</Label><Textarea rows={6} value={cfg.modelo_whatsapp ?? ""} onChange={(e) => set("modelo_whatsapp", e.target.value)} /></div>
            <div className="space-y-1"><Label>Assunto do e-mail</Label><Input value={cfg.modelo_email_assunto ?? ""} onChange={(e) => set("modelo_email_assunto", e.target.value)} /></div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="emissao" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Boleto automático</CardTitle><CardDescription>Usa a conta bancária com integração escolhida em cada título.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Quando emitir</Label>
              <Select value={cfg.boleto_modo} onValueChange={(v) => set("boleto_modo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não emitir automaticamente</SelectItem>
                  <SelectItem value="dias_antes">Alguns dias antes do vencimento</SelectItem>
                  <SelectItem value="dia_mes">Em um dia fixo do mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cfg.boleto_modo === "dias_antes" && <div className="space-y-1"><Label>Dias antes do vencimento</Label><Input type="number" min={0} value={cfg.boleto_dias_antes} onChange={(e) => set("boleto_dias_antes", Number(e.target.value))} /></div>}
            {cfg.boleto_modo === "dia_mes" && <div className="space-y-1"><Label>Dia do mês (emite o que vence nos próximos 31 dias)</Label><Input type="number" min={1} max={28} value={cfg.boleto_dia_mes} onChange={(e) => set("boleto_dia_mes", Number(e.target.value))} /></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Nota fiscal de serviço (Focus NFe)</CardTitle><CardDescription>A nota vai junto no link da fatura enviado ao cliente.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Quando emitir</Label>
              <Select value={cfg.nota_modo} onValueChange={(v) => set("nota_modo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não emitir automaticamente</SelectItem>
                  <SelectItem value="emissao">Junto com o boleto</SelectItem>
                  <SelectItem value="pagamento">Quando o cliente pagar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ambiente</Label>
              <Select value={cfg.fiscal_ambiente} onValueChange={(v) => set("fiscal_ambiente", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="homologacao">Homologação (teste)</SelectItem><SelectItem value="producao">Produção</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2"><Label>Token do Focus NFe {segredos.tem_fiscal && <Badge variant="secondary" className="ml-1">cadastrado</Badge>}</Label><Input type="password" placeholder={segredos.tem_fiscal ? "•••••• (deixe em branco para manter)" : "Cole o token"} value={token} onChange={(e) => setToken(e.target.value)} /></div>
            <div className="space-y-1"><Label>Inscrição municipal</Label><Input value={text(cfg.fiscal_config?.inscricao_municipal)} onChange={(e) => setFc("inscricao_municipal", e.target.value)} /></div>
            <div className="space-y-1"><Label>Código IBGE do município</Label><Input value={text(cfg.fiscal_config?.codigo_municipio)} onChange={(e) => setFc("codigo_municipio", e.target.value)} /></div>
            <div className="space-y-1"><Label>Item da lista de serviço (LC 116)</Label><Input placeholder="ex.: 01.07" value={text(cfg.fiscal_config?.item_lista_servico)} onChange={(e) => setFc("item_lista_servico", e.target.value)} /></div>
            <div className="space-y-1"><Label>Alíquota ISS (%)</Label><Input type="number" step="0.01" value={text(cfg.fiscal_config?.aliquota)} onChange={(e) => setFc("aliquota", e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Código tributário do município (se a prefeitura exigir)</Label><Input value={text(cfg.fiscal_config?.codigo_tributario_municipio)} onChange={(e) => setFc("codigo_tributario_municipio", e.target.value)} /></div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="email" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Como enviar os e-mails</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Select value={cfg.email_modo} onValueChange={(v) => set("email_modo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="proprio">E-mail próprio da empresa (Google, Microsoft, outro)</SelectItem>
                  <SelectItem value="sistema">E-mail do sistema (módulo adicional)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cfg.email_modo === "proprio" && (<>
              <div className="space-y-1"><Label>Servidor de saída</Label><Input placeholder="smtp.gmail.com" value={cfg.smtp_host ?? ""} onChange={(e) => set("smtp_host", e.target.value)} /></div>
              <div className="space-y-1"><Label>Porta</Label><Input type="number" value={cfg.smtp_porta ?? 465} onChange={(e) => set("smtp_porta", Number(e.target.value))} /><p className="text-muted-foreground text-xs">Use 465 (a 587 é bloqueada pelo servidor).</p></div>
              <div className="space-y-1"><Label>Usuário</Label><Input value={cfg.smtp_usuario ?? ""} onChange={(e) => set("smtp_usuario", e.target.value)} /></div>
              <div className="space-y-1"><Label>Senha {segredos.tem_smtp && <Badge variant="secondary" className="ml-1">cadastrada</Badge>}</Label><Input type="password" placeholder={segredos.tem_smtp ? "•••••• (deixe em branco para manter)" : "Senha de app"} value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
            </>)}
            <div className="space-y-1"><Label>Nome do remetente</Label><Input value={cfg.remetente_nome ?? ""} onChange={(e) => set("remetente_nome", e.target.value)} /></div>
            <div className="space-y-1"><Label>E-mail do remetente</Label><Input type="email" value={cfg.remetente_email ?? ""} onChange={(e) => set("remetente_email", e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Responder para</Label><Input type="email" value={cfg.responder_para ?? ""} onChange={(e) => set("responder_para", e.target.value)} /></div>
            <div className="sm:col-span-2"><Button variant="outline" onClick={testarEmail}><Send className="mr-1 h-4 w-4" />Enviar e-mail de teste</Button><Button variant="outline" className="ml-2" onClick={() => setPrevia(true)}><Eye className="mr-1 h-4 w-4" />Visualizar modelo</Button><span className="text-muted-foreground ml-2 text-xs">Salve antes de testar. O teste usa dados de exemplo.</span>
              <Dialog open={previa} onOpenChange={setPrevia}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>Prévia do e-mail de cobrança</DialogTitle></DialogHeader>
                  <p className="text-muted-foreground text-xs">Exemplo com dados fictícios (lembrete 5 dias antes). Os dados reais do cliente e do título entram no envio.</p>
                  <iframe title="Prévia do e-mail" srcDoc={htmlPrevia} sandbox="" className="h-[70vh] w-full rounded-md border" />
                </DialogContent>
              </Dialog></div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="auditoria"><Auditoria /></TabsContent>
    </Tabs>
  );
}

type Envio = { id: string; titulo_id: string; etapa_dias: number; canal: string; destino: string | null; status: string; erro: string | null; enviado_em: string; aberto_em: string | null; aberturas: number };
type Leitura = { envio_id: string; documento: string; ip: string | null; lido_em: string };

function Auditoria() {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [titulos, setTitulos] = useState<Map<string, { descricao: string; valor: number }>>(new Map());
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("cobranca_envios" as never).select("*").order("enviado_em", { ascending: false }).limit(300);
      const env = (data ?? []) as Envio[];
      setEnvios(env);
      const ids = [...new Set(env.map((e) => e.titulo_id))];
      if (ids.length) {
        const { data: t } = await supabase.from("financeiro_titulos").select("id, descricao, valor").in("id", ids);
        setTitulos(new Map(((t ?? []) as { id: string; descricao: string; valor: number }[]).map((x) => [x.id, x])));
        const { data: l } = await supabase.from("cobranca_leituras" as never).select("envio_id, documento, ip, lido_em").in("envio_id", env.map((e) => e.id)).order("lido_em", { ascending: false });
        setLeituras((l ?? []) as Leitura[]);
      }
    })();
  }, []);

  const lista = useMemo(() => envios.filter((e) => !busca || `${titulos.get(e.titulo_id)?.descricao ?? ""} ${e.destino ?? ""}`.toLowerCase().includes(busca.toLowerCase())), [envios, titulos, busca]);
  const fmt = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const DOC: Record<string, string> = { email: "Abriu o e-mail", fatura: "Abriu a fatura", boleto: "Baixou o boleto", nota: "Baixou a nota" };

  return (
    <div className="space-y-3">
      <Input placeholder="Pesquisar por título ou destino" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
      {!lista.length && <p className="text-muted-foreground text-sm">Nenhum envio ainda.</p>}
      <div className="divide-y rounded-lg border">
        {lista.map((e) => {
          const t = titulos.get(e.titulo_id);
          const ls = leituras.filter((l) => l.envio_id === e.id);
          return (
            <div key={e.id} className="p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {e.canal === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                <span className="font-medium">{t?.descricao ?? "—"}</span>
                {t && <span className="text-muted-foreground">{formatBRL(t.valor)}</span>}
                <span className="text-muted-foreground">• {rotuloEtapa(e.etapa_dias)} • {e.destino ?? "sem destino"}</span>
                <span className="ml-auto flex items-center gap-2">
                  {e.status === "falhou" ? <Badge variant="destructive">Falhou</Badge> : e.status === "aberto" ? <Badge className="bg-success/15 text-success">Visualizado {e.aberturas}x</Badge> : <Badge variant="secondary">Enviado</Badge>}
                  <span className="text-muted-foreground text-xs">{fmt(e.enviado_em)}</span>
                  {!!ls.length && <Button size="icon" variant="ghost" onClick={() => setAberto(aberto === e.id ? null : e.id)}><Eye className="h-4 w-4" /></Button>}
                </span>
              </div>
              {e.erro && <p className="text-destructive mt-1 text-xs">{e.erro}</p>}
              {aberto === e.id && (
                <ul className="bg-muted/40 mt-2 space-y-1 rounded p-2 text-xs">
                  {ls.map((l, i) => <li key={i}>{fmt(l.lido_em)} — {DOC[l.documento] ?? l.documento}{l.ip ? ` • IP ${l.ip}` : ""}</li>)}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
