import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Building, Building2, Loader2, Mail, Megaphone, MessageCircle, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TextoRico } from "@/components/ui/texto-rico";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { FilterMultiSelect } from "@/components/data-table/FilterField";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowId } from "@/lib/crud";
import { htmlParaTexto } from "@/lib/html-texto";
import { enviarWhatsappEmpresa } from "@/lib/manutencoes";
import { PUBLICOS_AVISO, TIPOS_AVISO, planejarEnvios, preencherAviso, validarAviso, type CanalAviso, type Destinatario, type PublicoAviso } from "@/lib/cond-avisos";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { ordemNatural, s, useCondRows } from "./cond-data";

type Opt = { value: string; label: string };
type Perms = { canCreate: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const tipoLabel = (v: string) => TIPOS_AVISO.find((t) => t.value === v)?.label ?? v;
const tipoCor: Record<string, string> = {
  emergencia: "border-destructive/40 bg-destructive/10 text-destructive",
  assembleia: "border-primary/40 bg-primary/10 text-primary",
  obras: "border-warning/40 bg-warning/10 text-warning",
  financeiro: "border-success/40 bg-success/10 text-success",
};

export function AvisosPanel({ condominioId, condominios, blocos, unidades, perms }: { condominioId: string; condominios: Opt[]; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const { data: avisos = [], isLoading } = useCondRows("cond_avisos", "condominio_id", condominioId);
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<Row | null>(null);
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => {
    const t = norm(busca.trim());
    return [...avisos].sort((a, b) => s(b["created_at"]).localeCompare(s(a["created_at"]))).filter((a) => !t || norm(`${s(a["titulo"])} ${tipoLabel(s(a["tipo"]))}`).includes(t));
  }, [avisos, busca]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Megaphone className="size-5" /> Avisos & Comunicados</h2>
          <p className="text-sm text-muted-foreground">Envie por WhatsApp e e-mail para a carteira, o condomínio, torres ou unidades.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aviso" className="pl-8 pr-8" aria-label="Buscar aviso" />
          {busca && <button type="button" className="absolute right-2 top-2.5 text-muted-foreground" onClick={() => setBusca("")} aria-label="Limpar busca"><X className="size-4" /></button>}
        </div>
        {perms.canCreate && <Button onClick={() => setNovo(true)}><Plus className="size-4" /> Novo aviso</Button>}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Aviso</TableHead><TableHead>Abrangência</TableHead><TableHead>Canais</TableHead><TableHead className="text-right">Entregas</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
            ) : lista.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{busca ? "Nenhum aviso encontrado." : "Nenhum aviso enviado ainda."}</TableCell></TableRow>
            ) : lista.map((a) => (
              <TableRow key={s(a["id"])} className="cursor-pointer" onClick={() => setDetalhe(a)}>
                <TableCell className="whitespace-nowrap text-sm">{new Date(s(a["created_at"])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                <TableCell><p className="font-medium">{s(a["titulo"])}</p><Badge variant="outline" className={cn("mt-1", tipoCor[s(a["tipo"])])}>{tipoLabel(s(a["tipo"]))}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{s(a["abrangencia"]) || "—"}</TableCell>
                <TableCell><div className="flex gap-1">{((a["canais"] as string[]) ?? []).map((c) => c === "email" ? <Mail key={c} className="size-4" aria-label="E-mail" /> : <MessageCircle key={c} className="size-4" aria-label="WhatsApp" />)}</div></TableCell>
                <TableCell className="text-right text-sm"><span className="text-success">{Number(a["enviados"] ?? 0)}</span> / {Number(a["total"] ?? 0)}{Number(a["falhas"] ?? 0) > 0 && <span className="ml-1 text-destructive">({Number(a["falhas"])} falha)</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {novo && <NovoAvisoDialog condominioId={condominioId} condominios={condominios} blocos={blocos} unidades={unidades} onClose={() => setNovo(false)} />}
      {detalhe && <DetalheDialog aviso={detalhe} onClose={() => setDetalhe(null)} />}
    </section>
  );
}

function DetalheDialog({ aviso, onClose }: { aviso: Row; onClose: () => void }) {
  const { data: envios = [], isLoading } = useCondRows("cond_avisos_envios", "aviso_id", s(aviso["id"]));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{s(aviso["titulo"])}</DialogTitle></DialogHeader>
        <div className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-3 text-sm" dangerouslySetInnerHTML={{ __html: s(aviso["mensagem"]) }} />
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Pessoa</TableHead><TableHead>Canal</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow> : envios.map((e) => (
                <TableRow key={s(e["id"])}>
                  <TableCell><p className="font-medium">{s(e["nome"])}</p><p className="text-xs text-muted-foreground">{s(e["unidades"])}</p></TableCell>
                  <TableCell className="text-sm">{s(e["canal"]) === "email" ? "E-mail" : "WhatsApp"}<p className="text-xs text-muted-foreground">{s(e["destino"])}</p></TableCell>
                  <TableCell>
                    {s(e["status"]) === "enviado" ? <Badge variant="outline" className="border-success/40 bg-success/10 text-success">Enviado</Badge>
                      : s(e["status"]) === "falha" ? <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive" title={s(e["erro"])}>Falha</Badge>
                      : <Badge variant="outline">Pendente</Badge>}
                    {s(e["erro"]) && <p className="mt-1 text-xs text-destructive">{s(e["erro"])}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NovoAvisoDialog({ condominioId, condominios, blocos, unidades, onClose }: { condominioId: string; condominios: Opt[]; blocos: Row[]; unidades: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const [escopo, setEscopo] = useState<"condominio" | "carteira">("condominio");
  const [torres, setTorres] = useState<string[]>([]);
  const [unids, setUnids] = useState<string[]>([]);
  const [publico, setPublico] = useState<PublicoAviso>("todos");
  const [tipo, setTipo] = useState("geral");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [whats, setWhats] = useState(true);
  const [email, setEmail] = useState(true);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);

  const condIds = escopo === "carteira" ? condominios.map((c) => c.value) : [condominioId];
  const blocosOpt = useMemo(() => [...blocos].sort((a, b) => ordemNatural(s(a["nome"]), s(b["nome"]))).map((b) => ({ value: s(b["id"]), label: s(b["nome"]) })), [blocos]);
  const unidOpt = useMemo(() => {
    const nomeBloco = new Map(blocos.map((b) => [s(b["id"]), s(b["nome"])]));
    return unidades
      .filter((u) => !torres.length || torres.includes(s(u["cond_bloco_id"])))
      .map((u) => ({ value: s(u["id"]), label: `${nomeBloco.get(s(u["cond_bloco_id"])) ?? ""} · ${s(u["numero"])}` }))
      .sort((a, b) => ordemNatural(a.label, b.label));
  }, [unidades, blocos, torres]);
  const canais: CanalAviso[] = [...(whats ? ["whatsapp" as const] : []), ...(email ? ["email" as const] : [])];

  const pTorres = escopo === "carteira" ? [] : torres;
  const pUnids = escopo === "carteira" ? [] : unids.filter((u) => unidOpt.some((o) => o.value === u));
  const { data: dest = [], isFetching } = useQuery({
    queryKey: ["cond", "avisos-dest", condIds.join(","), pTorres.join(","), pUnids.join(",")],
    enabled: condIds.length > 0,
    queryFn: async (): Promise<Destinatario[]> => {
      const { data, error } = await db.rpc("cond_avisos_destinatarios", { p_condominios: condIds, p_blocos: pTorres, p_unidades: pUnids });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: Row) => ({ ...r, condominio_id: s(r["condominio_id"]), cond_unidade_id: s(r["cond_unidade_id"]), usuario_id: s(r["usuario_id"]), unidade: s(r["unidade"]), bloco: s(r["bloco"]), nome: s(r["nome"]), papel: s(r["papel"]), email: (r["email"] as string) ?? null, celular: (r["celular"] as string) ?? null }));
    },
  });
  const plano = useMemo(() => planejarEnvios(dest, publico, canais), [dest, publico, canais.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrangencia = escopo === "carteira" ? `Carteira (${condominios.length} condomínios)`
    : pUnids.length ? `${pUnids.length} unidade(s)` : pTorres.length ? blocosOpt.filter((b) => pTorres.includes(b.value)).map((b) => b.label).join(", ") : "Todas as torres";

  async function enviar() {
    const erro = validarAviso({ titulo, mensagemTexto: htmlParaTexto(mensagem), canais, condominios: condIds });
    if (erro) { toast.error(erro); return; }
    if (!plano.envios.length) { toast.error("Nenhuma pessoa com contato para esse público."); return; }
    const ok = await confirmar({ title: "Enviar aviso agora?", description: `${plano.envios.length} mensagem(ns) para ${plano.pessoas} pessoa(s). Não é possível desfazer.`, confirmText: "Enviar" });
    if (!ok) return;
    const lote = crypto.randomUUID();
    const nomeCond = new Map(condominios.map((c) => [c.value, c.label]));
    setProgresso({ feito: 0, total: plano.envios.length });
    try {
      const porCond = new Map<string, typeof plano.envios>();
      for (const e of plano.envios) porCond.set(e.condominio_id, [...(porCond.get(e.condominio_id) ?? []), e]);
      let feito = 0;
      for (const [cid, envios] of porCond) {
        const { data: av, error } = await db.from("cond_avisos").insert({ lote_id: lote, condominio_id: cid, tipo, titulo: titulo.trim(), mensagem, canais, publico, abrangencia, total: envios.length }).select("id").single();
        if (error) throw new Error(error.message);
        const { data: linhas, error: e2 } = await db.from("cond_avisos_envios").insert(envios.map((e) => ({ aviso_id: av.id, usuario_id: e.usuario_id, cond_unidade_id: e.cond_unidade_id, nome: e.nome, unidades: e.unidades, canal: e.canal, destino: e.destino }))).select("id");
        if (e2) throw new Error(e2.message);
        let okN = 0, falhaN = 0;
        for (let i = 0; i < envios.length; i++) {
          const e = envios[i]!;
          const vars = { nome: e.nome, unidade: e.unidades, condominio: nomeCond.get(cid) ?? "" };
          let motivo: string | null = null;
          try {
            if (e.canal === "whatsapp") {
              const texto = `*${titulo.trim()}*\n\n${preencherAviso(htmlParaTexto(mensagem), vars)}`;
              motivo = await enviarWhatsappEmpresa(rowId(empresa ?? {}), e.destino, texto);
            } else {
              const { data, error: fe } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "cond_aviso_email", condominio_id: cid, para: e.destino, nome: e.nome, unidades: e.unidades, titulo: titulo.trim(), tipo_label: tipoLabel(tipo), mensagem: preencherAviso(mensagem, vars) } });
              motivo = fe ? fe.message : (data as Row | null)?.["erro"] ? s((data as Row)["erro"]) : null;
            }
          } catch (x) { motivo = x instanceof Error ? x.message : "Falha no envio."; }
          if (motivo) falhaN++; else okN++;
          await db.from("cond_avisos_envios").update(motivo ? { status: "falha", erro: motivo } : { status: "enviado", enviado_em: new Date().toISOString() }).eq("id", linhas[i].id);
          setProgresso({ feito: ++feito, total: plano.envios.length });
        }
        await db.from("cond_avisos").update({ enviados: okN, falhas: falhaN }).eq("id", av.id);
      }
      await qc.invalidateQueries({ queryKey: ["cond", "cond_avisos"] });
      toast.success("Aviso enviado. Veja as entregas no histórico.");
      onClose();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "Não foi possível enviar.");
      setProgresso(null);
    }
  }

  const enviando = !!progresso;
  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Megaphone className="size-5" /> Novo aviso</DialogTitle></DialogHeader>

        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">1. Para quem</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Abrangência">
              {([["condominio", Building, "Este condomínio", "Escolha torres e unidades"], ["carteira", Building2, "Toda a carteira", `${condominios.length} condomínios`]] as const).map(([v, Icon, t, sub]) => (
                <button key={v} type="button" role="radio" aria-checked={escopo === v} onClick={() => setEscopo(v)} disabled={enviando}
                  className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition", escopo === v ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-primary/50")}>
                  <Icon className="size-5 text-primary" /><span><span className="block text-sm font-semibold">{t}</span><span className="text-xs text-muted-foreground">{sub}</span></span>
                </button>
              ))}
            </div>
            {escopo === "condominio" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label className="mb-1.5 block">Torres / blocos</Label><FilterMultiSelect label="Todas as torres" value={torres} onChange={setTorres} options={blocosOpt} /></div>
                <div><Label className="mb-1.5 block">Unidades</Label><FilterMultiSelect label="Todas as unidades" value={unids} onChange={setUnids} options={unidOpt} /></div>
              </div>
            )}
            <div className="sm:w-1/2"><Label className="mb-1.5 block">Público</Label><SearchSelect value={publico} onChange={(v) => setPublico((v || "todos") as PublicoAviso)} options={[...PUBLICOS_AVISO].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} allowClear={false} /></div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">2. Mensagem</legend>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={tipo} onChange={(v) => setTipo(v || "geral")} options={[...TIPOS_AVISO].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} allowClear={false} /></div>
              <div><Label htmlFor="av-titulo" className="mb-1.5 block">Título</Label><Input id="av-titulo" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Manutenção do elevador social" /></div>
            </div>
            <div>
              <Label className="mb-1.5 block">Texto</Label>
              <TextoRico value={mensagem} onChange={setMensagem} minHeight={140} placeholder="Escreva o comunicado…" />
              <p className="mt-1 text-xs text-muted-foreground">Use {"{{nome}}"}, {"{{unidade}}"} e {"{{condominio}}"} para personalizar. No WhatsApp a formatação vira texto simples.</p>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">3. Canais</legend>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={whats} onCheckedChange={setWhats} disabled={enviando} /><MessageCircle className="size-4" /> WhatsApp</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={email} onCheckedChange={setEmail} disabled={enviando} /><Mail className="size-4" /> E-mail</label>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
            {isFetching ? <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Calculando destinatários…</span> : (
              <>
                <span className="flex items-center gap-1.5"><Users className="size-4" /> <b>{plano.pessoas}</b> pessoa(s)</span>
                <span className="flex items-center gap-1.5"><MessageCircle className="size-4" /> {plano.envios.filter((e) => e.canal === "whatsapp").length}</span>
                <span className="flex items-center gap-1.5"><Mail className="size-4" /> {plano.envios.filter((e) => e.canal === "email").length}</span>
                {plano.semContato > 0 && <span className="text-warning">{plano.semContato} sem contato no canal escolhido</span>}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-3">
          {progresso && <span className="mr-auto self-center text-sm text-muted-foreground">Enviando {progresso.feito} de {progresso.total}…</span>}
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando || isFetching}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />} Enviar aviso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
