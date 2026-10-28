import { TextoRico } from "@/components/ui/texto-rico";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, Play, Plus, ScanLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { BannersEmailButton, useBannersEmail } from "@/components/layout/BannersEmail";
import { escolherBanner } from "@/lib/regua-cobranca";
import { REGUA_OFERTA_PADRAO, reguaOfertaSchema, montarEmailOferta, preencherModelo, type ReguaOferta, type EtapaOferta } from "@/lib/regua-ofertas";
import { verificarNumeroWhatsApp } from "@/lib/ofertas-acompanhamento.functions";
import { telefoneConsulta } from "@/lib/whatsapp-verificacao";
import { useAuth } from "@/hooks/useAuth";
import { type Row } from "@/lib/row";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function ReguaOfertas({ open, onOpenChange, canEdit, situacoes }: { open: boolean; onOpenChange: (v:boolean)=>void; canEdit:boolean; situacoes:string[] }) {
  const [cfg,setCfg] = useState<ReguaOferta | null>(null);
  const [empresaId,setEmpresaId] = useState<string>();
  const [erro,setErro] = useState("");
  const [busy,setBusy] = useState(false);
  const [previa,setPrevia] = useState<string | null>(null);
  const [historico,setHistorico] = useState<Row[]>([]);
  const [lote,setLote] = useState("");
  const { empresa } = useAuth();
  const banners = useBannersEmail(empresaId);
  const consultar = useServerFn(verificarNumeroWhatsApp);
  useEffect(() => {
    if (!open) return;
    let ativo = true;
    void (async () => {
      const { data:emp,error } = await supabase.rpc("acompanhamento_empresa");
      if (!ativo) return;
      if (error || !emp) { setErro("Instalação da régua pendente ou empresa indisponível."); return; }
      setEmpresaId(String(emp));
      const r = await supabase.from("oferta_regua").select("*").eq("empresa_id",emp).maybeSingle();
      if (!ativo) return;
      if (r.error) { setErro("Não foi possível carregar a régua. Confira a instalação e as permissões."); return; }
      setErro(""); setCfg(r.data ? reguaOfertaSchema.parse(r.data) : { ...REGUA_OFERTA_PADRAO, situacoes: situacoes.length ? [situacoes[0] ?? "Em andamento"] : ["Em andamento"] });
      const h = await supabase.from("oferta_envios").select("*").eq("empresa_id",emp).order("criado_em",{ascending:false}).limit(50);
      if (ativo) setHistorico(h.data ?? []);
    })().catch(() => setErro("Não foi possível carregar a régua."));
    return () => { ativo = false; };
  },[open]);
  const alterar = (i:number,p:Partial<EtapaOferta>) => setCfg(c => c ? {...c,etapas:c.etapas.map((e,j)=>j===i?{...e,...p}:e)} : c);
  const salvar = async () => {
    if (!cfg || !empresaId) return;
    const valid = reguaOfertaSchema.safeParse(cfg);
    if (!valid.success) { toast.error(valid.error.issues[0]?.message ?? "Confira os campos."); return; }
    setBusy(true);
    const { error } = await supabase.from("oferta_regua").upsert({...valid.data,empresa_id:empresaId,atualizado_em:new Date().toISOString()});
    setBusy(false);
    if (error) toast.error("Não foi possível salvar a régua."); else toast.success("Régua de Ofertas salva.");
  };
  const executar = async () => {
    setBusy(true);
    const { data,error } = await supabase.rpc("oferta_executar");
    setBusy(false);
    if (error) toast.error("Não foi possível agendar. Salve e ligue a régua primeiro."); else toast.success(`${Number(data ?? 0)} envio(s) agendado(s).`);
  };
  const verificarCadastros = async () => {
    if (!empresaId) return;
    setBusy(true); setLote("Lendo cadastros…");
    try {
      const { data,error } = await supabase.rpc("whatsapp_telefones_cadastrados");
      if (error) throw new Error("Não foi possível ler os cadastros autorizados.");
      const numeros = [...new Set((Array.isArray(data) ? data : []).map(v => telefoneConsulta(String(v))).filter((v):v is string => !!v))];
      let sim=0,nao=0,falha=0;
      for (let i=0;i<numeros.length;i++) {
        const numero=numeros[i]; if (!numero) continue;
        const r = await consultar({data:{telefone:`+${numero}`,atualizar:true}});
        if (r.status==='possui') sim++; else if(r.status==='nao_possui') nao++; else falha++;
        setLote(`${i+1}/${numeros.length} · ${sim} com WhatsApp · ${nao} sem WhatsApp · ${falha} não verificados`);
      }
      if (!numeros.length) setLote("Nenhum telefone válido nos cadastros autorizados.");
      toast.success("Consulta dos cadastros concluída.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Consulta interrompida."); }
    finally { setBusy(false); }
  };
  const mostrarPrevia = (e:EtapaOferta) => {
    const vars={cliente:"Cliente Exemplo",empresa:String(empresa?.["nome_fantasia"] ?? empresa?.["razao_social"] ?? "Empresa"),numero:"#2026-0001",valor:"R$ 299,90",validade:"30/10/2026",descricao:"Oferta de serviços",link:"#"};
    setPrevia(montarEmailOferta({empresaNome:vars.empresa,logo:String(empresa?.["logo"] ?? empresa?.["logo_url"] ?? ""),cor:String(empresa?.["cor_primaria_claro"] ?? ""),cliente:vars.cliente,dias:0,descricao:vars.descricao,valor:299.90,vencimento:"2026-10-30",link:"#",numero:vars.numero,mensagem:preencherModelo(e.mensagem,vars),documento:String(empresa?.["cnpj_cpf"] ?? ""),endereco:String(empresa?.["endereco"] ?? ""),telefone:String(empresa?.["telefone1"] ?? ""),site:String(empresa?.["site_url"] ?? ""),banner:escolherBanner(banners.data?.rows ?? [],"oferta")}));
  };
  return <Sheet open={open} onOpenChange={v=>{if(!busy)onOpenChange(v)}}><SheetContent className="flex flex-col gap-0 p-0 sm:max-w-none">
    <SheetHeader className="border-b p-5"><SheetTitle>Régua de acompanhamento de Ofertas</SheetTitle></SheetHeader>
    <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
      {erro ? <p className="text-sm text-muted-foreground">{erro}</p> : !cfg ? <Loader2 className="h-5 w-5 animate-spin"/> : <>
        <fieldset disabled={!canEdit || busy} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Switch checked={cfg.ativo} onCheckedChange={ativo=>setCfg({...cfg,ativo})}/><Label>Régua ligada</Label></div><BannersEmailButton empresaId={empresaId} cor={String(empresa?.["cor_primaria_claro"] ?? "")} canEdit={canEdit} /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Horário (Brasília)</Label><Select value={String(cfg.hora_disparo)} onValueChange={v=>setCfg({...cfg,hora_disparo:Number(v)})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:24},(_,h)=><SelectItem key={h} value={String(h)}>{String(h).padStart(2,"0")}:00</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Dias da semana</Label><div className="flex flex-wrap gap-3">{SEMANA.map((s,i)=><label key={s} className="flex items-center gap-1 text-xs"><Switch checked={cfg.dias_semana.includes(i)} onCheckedChange={v=>setCfg({...cfg,dias_semana:v?[...cfg.dias_semana,i]:cfg.dias_semana.filter(d=>d!==i)})}/>{s}</label>)}</div></div></div>
          <div className="space-y-2"><Label>Situações acompanhadas</Label><div className="flex flex-wrap gap-4">{[...new Set([...situacoes,...cfg.situacoes])].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(s=><label key={s} className="flex items-center gap-2 text-sm"><Switch checked={cfg.situacoes.includes(s)} onCheckedChange={v=>setCfg({...cfg,situacoes:v?[...cfg.situacoes,s]:cfg.situacoes.filter(x=>x!==s)})}/>{s}</label>)}</div></div>
          <div className="flex justify-between items-center"><h3 className="font-medium">Etapas e mensagens</h3><Button type="button" size="sm" variant="outline" onClick={()=>setCfg({...cfg,etapas:[...cfg.etapas,{...REGUA_OFERTA_PADRAO.etapas[0],id:crypto.randomUUID(),referencia:"envio",dias:7,ativo:true,canais:["email"],whatsapp:"",assunto:"{empresa} — Oferta {numero}",mensagem:"Olá! Podemos ajudar com a Oferta {numero}?"}]})}><Plus className="h-4 w-4 mr-1"/>Etapa</Button></div>
          {cfg.etapas.map((e,i)=><section key={e.id} className="border rounded-md p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-center"><Switch checked={e.ativo} onCheckedChange={ativo=>alterar(i,{ativo})}/><Select value={e.referencia} onValueChange={v=>alterar(i,{referencia:v as EtapaOferta["referencia"]})}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="envio">Após o envio</SelectItem><SelectItem value="validade">Em relação à validade</SelectItem></SelectContent></Select><Input type="number" aria-label="Dias da etapa" className="w-20" value={e.dias} onChange={v=>alterar(i,{dias:Number(v.target.value)})}/><span className="text-sm text-muted-foreground">dias</span><Button size="icon" variant="ghost" type="button" title="Excluir etapa" aria-label="Excluir etapa" className="ml-auto" onClick={()=>setCfg({...cfg,etapas:cfg.etapas.filter(x=>x.id!==e.id)})}><Trash2 className="h-4 w-4"/></Button></div>
            <div className="flex gap-4">{(["email","whatsapp"] as const).map(c=><label key={c} className="flex gap-2 items-center text-sm"><Switch checked={e.canais.includes(c)} onCheckedChange={v=>alterar(i,{canais:v?[...e.canais,c]:e.canais.filter(x=>x!==c)})}/>{c==='email'?'E-mail':'WhatsApp'}</label>)}</div>
            {e.canais.includes('whatsapp')&&<div className="space-y-1"><Label>Mensagem WhatsApp</Label><Textarea value={e.whatsapp} rows={3} onChange={v=>alterar(i,{whatsapp:v.target.value})}/></div>}
            {e.canais.includes('email')&&<><div className="space-y-1"><Label>Assunto do e-mail</Label><Input value={e.assunto} onChange={v=>alterar(i,{assunto:v.target.value})}/></div><div className="space-y-1"><Label>Mensagem do e-mail</Label><TextoRico value={e.mensagem} minHeight={90} onChange={v=>alterar(i,{mensagem:v})}/></div></>}
            <Button type="button" variant="outline" size="sm" onClick={()=>mostrarPrevia(e)}><Eye className="h-4 w-4 mr-1"/>Prévia do e-mail</Button>
          </section>)}
        </fieldset>
        {previa&&<div><Button size="sm" variant="ghost" onClick={()=>setPrevia(null)}>Fechar prévia</Button><iframe title="Prévia do e-mail de Oferta" sandbox="" srcDoc={previa} className="w-full h-[660px] border rounded-md"/></div>}
        {canEdit&&<div className="space-y-2 border-t pt-4"><Button disabled={busy} variant="outline" onClick={verificarCadastros}><ScanLine className="h-4 w-4 mr-2"/>Verificar telefones dos cadastros</Button>{lote&&<p className="text-sm text-muted-foreground" role="status">{lote}</p>}</div>}
        <section className="border-t pt-4"><h3 className="font-medium mb-2">Últimos envios</h3>{historico.length?<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Data</th><th className="p-2">Etapa</th><th className="p-2">Canal</th><th className="p-2">Situação</th></tr></thead><tbody>{historico.map(h=><tr key={String(h['id'])} className="border-t"><td className="p-2">{new Date(String(h['criado_em'])).toLocaleString('pt-BR')}</td><td className="p-2">{String(h['etapa_id'])}</td><td className="p-2">{String(h['canal'])}</td><td className="p-2" title={String(h['erro']??'')}>{String(h['status'])}</td></tr>)}</tbody></table></div>:<p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>}</section>
      </>}
    </div><SheetFooter className="shrink-0 border-t p-4 flex-row flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>Cancelar</Button>{canEdit&&cfg&&<><Button variant="outline" disabled={busy} onClick={executar}><Play className="h-4 w-4 mr-1"/>Executar agora</Button><Button disabled={busy} onClick={salvar}>{busy&&<Loader2 className="h-4 w-4 animate-spin mr-1"/>}Salvar</Button></>}</SheetFooter>
  </SheetContent></Sheet>;
}
