import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Archive, BarChart3, Ban, Building, Building2, CalendarClock, Eye, FileSpreadsheet, FileText, Film, ImageIcon, Loader2, Mail, Megaphone, MessageCircle, Paperclip, Pencil, Plus, Printer, RotateCcw, Search, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { TextoRico } from "@/components/ui/texto-rico";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { FilterMultiSelect } from "@/components/data-table/FilterField";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { rowId } from "@/lib/crud";
import { htmlParaTexto } from "@/lib/html-texto";
import { uploadAnexo } from "@/lib/manutencoes";
import { ACEITE_MIDIA_AVISO, LIMITE_MIDIA_MB, tipoMidiaAviso, validarMidiaAviso, PUBLICOS_AVISO, TIPOS_AVISO, planejarEnvios, validarAviso, imagensDoHtml, type CanalAviso, type Destinatario, type PublicoAviso } from "@/lib/cond-avisos";
import { STATUS_AVISO, acoesDoAviso, avisoExpirado, cancelamentoNotifica, mensagemCancelamento, percentualEnvio, rotuloCanalLeitura, statusDoAviso, tituloCancelamento, validarAgendamento } from "@/lib/cond-avisos-ciclo";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { CampoData } from "./CampoData";
import { ordemNatural, s, useCondRows } from "./cond-data";
import { buscarTodos, enfileirarAviso, inserirEmLotes, quandoConcluirEnvio, useFilaAvisos } from "./avisos-fila";

type Opt = { value: string; label: string };
type Perms = { canCreate: boolean; canUpdate?: boolean; canDelete?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const tipoLabel = (v: string) => TIPOS_AVISO.find((t) => t.value === v)?.label ?? v;
const dtHora = (v: unknown) => (v ? new Date(s(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—");
const dtCurta = (v: unknown) => (v ? new Date(s(v)).toLocaleDateString("pt-BR") : "—");
const tipoCor: Record<string, string> = {
  emergencia: "border-destructive/40 bg-destructive/10 text-destructive",
  assembleia: "border-primary/40 bg-primary/10 text-primary",
  obras: "border-warning/40 bg-warning/10 text-warning",
  financeiro: "border-success/40 bg-success/10 text-success",
};
const COLS_ENVIO = "id,aviso_id,usuario_id,cond_unidade_id,nome,unidades,canal,destino,status,erro,enviado_em";

export function AvisosPanel({ condominioId, condominios, blocos, unidades, perms }: { condominioId: string; condominios: Opt[]; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { data: avisos = [], isLoading } = useCondRows("cond_avisos", "condominio_id", condominioId);
  const [editor, setEditor] = useState<{ base?: Row } | null>(null);
  const [leituras, setLeituras] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<Row | null>(null);
  const [reenviar, setReenviar] = useState<Row | null>(null);
  const [busca, setBusca] = useState("");
  const [verArquivados, setVerArquivados] = useState(false);
  const podeGerir = perms.canUpdate ?? perms.canCreate;
  const nomeCond = condominios.find((c) => c.value === condominioId)?.label ?? "";
  const empresaId = String(rowId(empresa ?? {}));

  useEffect(() => { quandoConcluirEnvio(() => void qc.invalidateQueries({ queryKey: ["cond", "cond_avisos"] })); }, [qc]);

  // Agendados vencidos saem assim que alguém da gestão abre a tela (e a cada minuto com ela aberta).
  useEffect(() => {
    const disparar = () => {
      for (const a of avisos) {
        if (statusDoAviso(a["status"]) === "agendado" && a["agendado_para"] && new Date(s(a["agendado_para"])).getTime() <= Date.now())
          enfileirarAviso({ avisoId: s(a["id"]), titulo: s(a["titulo"]), empresaId, nomeCondominio: nomeCond });
      }
    };
    disparar();
    const t = setInterval(disparar, 60_000);
    return () => clearInterval(t);
  }, [avisos, empresaId, nomeCond]);

  const lista = useMemo(() => {
    const t = norm(busca.trim());
    return [...avisos]
      .filter((a) => (statusDoAviso(a["status"]) === "arquivado") === verArquivados)
      .sort((a, b) => s(b["created_at"]).localeCompare(s(a["created_at"])))
      .filter((a) => !t || norm(`${s(a["titulo"])} ${tipoLabel(s(a["tipo"]))}`).includes(t));
  }, [avisos, busca, verArquivados]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "cond_avisos"] });

  async function cancelar(a: Row) {
    const st = statusDoAviso(a["status"]);
    const notifica = cancelamentoNotifica(st, Number(a["enviados"] ?? 0));
    const ok = await confirmar({
      title: "Cancelar este aviso?",
      description: notifica ? `Será enviado um novo comunicado para as ${Number(a["enviados"] ?? 0)} pessoa(s) que já receberam, informando que "${s(a["titulo"])}" foi cancelado e o motivo. Não é possível desfazer.` : "O aviso ainda não foi enviado e será apenas cancelado — ninguém será notificado.",
      confirmText: "Prosseguir", destructive: true,
    });
    if (!ok) return;
    const motivo = await perguntar({ title: "Motivo do cancelamento", ...(notifica ? { description: "Este texto vai no comunicado de cancelamento." } : {}), multiline: true, required: true, placeholder: "Ex.: a manutenção foi adiada para a próxima semana." });
    if (!motivo?.trim()) return;
    try {
      await db.from("cond_avisos").update({ status: "cancelado", motivo_cancelamento: motivo.trim(), cancelado_em: new Date().toISOString(), agendado_para: null }).eq("id", a["id"]);
      if (notifica) {
        const recebidos = await buscarTodos("cond_avisos_envios", (q) => q.eq("aviso_id", a["id"]).eq("status", "enviado"), COLS_ENVIO);
        const { data: novo, error } = await db.from("cond_avisos").insert({
          lote_id: crypto.randomUUID(), condominio_id: a["condominio_id"], tipo: a["tipo"], titulo: tituloCancelamento(s(a["titulo"])),
          mensagem: mensagemCancelamento(s(a["titulo"]), motivo.trim(), dtHora(a["created_at"])), canais: a["canais"], publico: a["publico"],
          abrangencia: a["abrangencia"], total: recebidos.length, status: "enviando", natureza: "cancelamento", aviso_origem_id: a["id"],
        }).select("id").single();
        if (error) throw new Error(error.message);
        await inserirEmLotes("cond_avisos_envios", recebidos.map((e) => ({ aviso_id: novo.id, usuario_id: e["usuario_id"], cond_unidade_id: e["cond_unidade_id"], nome: e["nome"], unidades: e["unidades"], canal: e["canal"], destino: e["destino"] })));
        enfileirarAviso({ avisoId: novo.id, titulo: tituloCancelamento(s(a["titulo"])), empresaId, nomeCondominio: nomeCond });
        toast.success("Aviso cancelado. O comunicado de cancelamento está sendo enviado.");
      } else toast.success("Aviso cancelado.");
      await recarregar();
    } catch (x) { toast.error(x instanceof Error ? x.message : "Não foi possível cancelar."); }
  }

  async function arquivar(a: Row, voltar = false) {
    if (!voltar && !(await confirmar({ title: "Arquivar este aviso?", description: "Ele sai da lista principal, mas continua no histórico de arquivados com as leituras.", confirmText: "Arquivar" }))) return;
    const { error } = await db.from("cond_avisos").update(voltar ? { status: s(a["cancelado_em"]) ? "cancelado" : "enviado", arquivado_em: null } : { status: "arquivado", arquivado_em: new Date().toISOString() }).eq("id", a["id"]);
    if (error) toast.error(error.message); else { toast.success(voltar ? "Aviso restaurado." : "Aviso arquivado."); await recarregar(); }
  }

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
        <label className="flex items-center gap-2 text-sm"><Switch checked={verArquivados} onCheckedChange={setVerArquivados} /> Arquivados</label>
        <Button variant="outline" onClick={() => setLeituras(lista)} disabled={!lista.length}><BarChart3 className="size-4" /> Relatório de leitura</Button>
        {perms.canCreate && <Button onClick={() => setEditor({})}><Plus className="size-4" /> Novo aviso</Button>}
      </div>

      <div className="space-y-3">
        {isLoading ? <p className="rounded-lg border bg-card py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          : lista.length === 0 ? <p className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">{busca ? "Nenhum aviso encontrado." : verArquivados ? "Nenhum aviso arquivado." : "Nenhum aviso enviado ainda."}</p>
          : lista.map((a) => {
            const st = statusDoAviso(a["status"]);
            const acoes = acoesDoAviso(st, s(a["natureza"]) || "aviso");
            const expirado = avisoExpirado(s(a["expira_em"]) || null);
            return (
              <article key={s(a["id"])} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">{s(a["abrangencia"]) || "—"}</p>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {s(a["titulo"])}
                      {Number(a["versao"] ?? 1) > 1 && <Badge variant="outline">V{Number(a["versao"])}</Badge>}
                      {s(a["midia_url"]) && <a href={s(a["midia_url"])} target="_blank" rel="noopener noreferrer" className="text-primary" aria-label={`Abrir anexo ${s(a["midia_nome"])}`}>{s(a["midia_tipo"]) === "imagem" ? <ImageIcon className="size-4" /> : s(a["midia_tipo"]) === "video" ? <Film className="size-4" /> : <FileText className="size-4" />}</a>}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline" className={STATUS_AVISO[st].cor}>{STATUS_AVISO[st].label}</Badge>
                      <Badge variant="outline" className={tipoCor[s(a["tipo"])]}>{tipoLabel(s(a["tipo"]))}</Badge>
                      {((a["canais"] as string[]) ?? []).map((c) => c === "email" ? <Mail key={c} className="size-4" aria-label="E-mail" /> : <MessageCircle key={c} className="size-4" aria-label="WhatsApp" />)}
                      <span className="text-muted-foreground">{dtHora(a["created_at"])}</span>
                      {st === "agendado" && <span className="text-primary">· agendado para {dtHora(a["agendado_para"])}</span>}
                      <span className={expirado ? "text-destructive" : "text-muted-foreground"}>· {s(a["expira_em"]) ? `${expirado ? "expirou" : "visível até"} ${new Date(`${s(a["expira_em"]).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}` : "não expira"}</span>
                    </div>
                    {s(a["motivo_cancelamento"]) && <p className="text-xs text-destructive">Motivo do cancelamento: {s(a["motivo_cancelamento"])}</p>}
                    <p className="text-xs"><span className="text-success">{Number(a["enviados"] ?? 0)}</span> de {Number(a["total"] ?? 0)} entregues{Number(a["falhas"] ?? 0) > 0 && <span className="ml-1 text-destructive">· {Number(a["falhas"])} falha(s)</span>}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Button size="icon" variant="outline" aria-label="Quem recebeu e quem visualizou" onClick={() => setLeituras([a])}><Eye className="size-4" /></Button>
                    {podeGerir && acoes.cancelar && <Button size="sm" variant="destructive" onClick={() => cancelar(a)}><Ban className="size-4" /> Cancelar</Button>}
                    {podeGerir && acoes.editar && <Button size="sm" variant="outline" onClick={() => setEditor({ base: a })}><Pencil className="size-4" /> {acoes.editarCriaVersao ? "Editar (nova versão)" : "Editar"}</Button>}
                    {podeGerir && (st === "arquivado" ? <Button size="sm" variant="outline" onClick={() => arquivar(a, true)}><RotateCcw className="size-4" /> Restaurar</Button>
                      : acoes.arquivar && <Button size="sm" variant="outline" onClick={() => arquivar(a)}><Archive className="size-4" /> Arquivar</Button>)}
                    {podeGerir && acoes.reenviar && <Button size="sm" variant="outline" onClick={() => setReenviar(a)}><Send className="size-4" /> Reenviar</Button>}
                    <Button size="sm" variant="outline" onClick={() => setStatus(a)}><BarChart3 className="size-4" /> Status envio</Button>
                  </div>
                </div>
              </article>
            );
          })}
      </div>

      {editor && <AvisoEditorDialog {...(editor.base ? { base: editor.base } : {})} condominioId={condominioId} condominios={condominios} blocos={blocos} unidades={unidades} empresaId={empresaId} onClose={() => setEditor(null)} />}
      {leituras && <LeiturasDialog avisos={leituras} onClose={() => setLeituras(null)} />}
      {status && <StatusEnvioDialog aviso={status} onClose={() => setStatus(null)} />}
      {reenviar && <ReenviarDialog aviso={reenviar} empresaId={empresaId} nomeCondominio={nomeCond} onClose={() => setReenviar(null)} />}
    </section>
  );
}

/* ---------------------- Impressão / Excel ---------------------- */

function imprimirElemento(id: string) {
  const src = document.getElementById(id);
  if (!src) return;
  const host = document.createElement("div");
  host.className = "dre-print-host";
  host.appendChild(src.cloneNode(true));
  document.body.appendChild(host);
  document.documentElement.classList.add("dre-printing");
  const limpar = () => { document.documentElement.classList.remove("dre-printing"); host.remove(); window.removeEventListener("afterprint", limpar); };
  window.addEventListener("afterprint", limpar);
  const imgs = Array.from(host.querySelectorAll("img"));
  Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))).then(() => setTimeout(() => window.print(), 50));
}

function baixarExcel(nome: string, cab: string[], linhas: string[][]) {
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  const url = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${nome}.xls`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CabecalhoDoc({ titulo, sub }: { titulo: string; sub: string }) {
  const emp = useEmpresaAtiva();
  return (
    <>
      <header className="dre-head">
        <div className="dre-emp">
          {emp.logo && <img src={String(emp.logo)} alt="" data-no-zoom />}
          <div><div className="dre-emp-nome">{emp.nome}</div><div className="dre-rot">Relatório • Confidencial</div></div>
        </div>
        <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
      </header>
      <div className="dre-titulo"><h1>{titulo}</h1><p>{sub}</p></div>
    </>
  );
}

/* ---------------------- Leituras ("dedo duro") ---------------------- */

function LeiturasDialog({ avisos, onClose }: { avisos: Row[]; onClose: () => void }) {
  const ids = avisos.map((a) => s(a["id"]));
  const [filtro, setFiltro] = useState<"todos" | "leram" | "nao">("todos");
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["cond", "avisos-leituras", ids.join(",")],
    queryFn: async () => {
      const [envios, leituras] = await Promise.all([
        buscarTodos("cond_avisos_envios", (q) => q.in("aviso_id", ids), COLS_ENVIO),
        buscarTodos("cond_avisos_leituras", (q) => q.in("aviso_id", ids)),
      ]);
      return { envios, leituras };
    },
  });
  const porAviso = new Map(avisos.map((a) => [s(a["id"]), a]));
  const linhas = useMemo(() => {
    const lidas = new Map<string, Row[]>();
    for (const l of data?.leituras ?? []) { const k = `${s(l["aviso_id"])}|${s(l["usuario_id"])}`; lidas.set(k, [...(lidas.get(k) ?? []), l]); }
    // Uma linha por pessoa/aviso, juntando os canais por onde recebeu.
    const grupos = new Map<string, { e: Row; canais: Set<string>; status: Set<string> }>();
    for (const e of data?.envios ?? []) {
      const k = `${s(e["aviso_id"])}|${s(e["usuario_id"]) || s(e["destino"])}`;
      const g = grupos.get(k) ?? { e, canais: new Set(), status: new Set() };
      g.canais.add(s(e["canal"])); g.status.add(s(e["status"]));
      grupos.set(k, g);
    }
    const t = norm(busca.trim());
    return [...grupos.values()].map(({ e, canais, status }) => {
      const ls = (lidas.get(`${s(e["aviso_id"])}|${s(e["usuario_id"])}`) ?? []).sort((a, b) => s(a["lido_em"]).localeCompare(s(b["lido_em"])));
      const av = porAviso.get(s(e["aviso_id"]));
      return {
        id: `${s(e["aviso_id"])}|${s(e["usuario_id"])}|${s(e["destino"])}`, aviso: s(av?.["titulo"]), unidade: s(e["unidades"]), nome: s(e["nome"]),
        contato: [...canais].map((c) => (c === "email" ? "E-mail" : "WhatsApp")).join(", "),
        entrega: status.has("enviado") ? "Entregue" : status.has("falha") ? "Falha" : "Pendente",
        dataAviso: dtCurta(av?.["created_at"]),
        lido: ls[0] ? dtHora(ls[0]["lido_em"]) : "",
        semConfirmacao: !ls.length && status.has("enviado") && canais.size === 1 && canais.has("whatsapp"),
        onde: [...new Set(ls.map((l) => rotuloCanalLeitura(s(l["canal"]))))].join(", "),
      };
    })
      .filter((r) => filtro === "todos" || (filtro === "leram" ? !!r.lido : !r.lido))
      .filter((r) => !t || norm(`${r.nome} ${r.unidade} ${r.aviso}`).includes(t))
      .sort((a, b) => ordemNatural(a.unidade, b.unidade));
  }, [data, filtro, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const leram = linhas.filter((r) => r.lido).length;
  const varios = avisos.length > 1;
  const titulo = varios ? `${avisos.length} avisos` : s(avisos[0]?.["titulo"]);
  const cab = [...(varios ? ["Aviso"] : []), "Unidade", "Usuário", "Recebeu por", "Entrega", "Data aviso", "Data leitura", "Onde visualizou"];
  const valores = (r: (typeof linhas)[number]) => [...(varios ? [r.aviso] : []), r.unidade, r.nome, r.contato, r.entrega, r.dataAviso, r.lido || (r.semConfirmacao ? "Não foi possível conferir" : "Não visualizou"), r.onde || "—"];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="size-5" /> Leitura de avisos — {titulo}</DialogTitle></DialogHeader>
        {avisos.length === 1 && <div className="max-h-32 overflow-auto rounded-md border bg-muted/30 p-3 text-sm" dangerouslySetInnerHTML={{ __html: s(avisos[0]!["mensagem"]) }} />}
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-primary/5 p-3 text-sm">
          <span className="mr-auto">Resultado: <b>{linhas.length}</b> registro(s) · <b className="text-success">{leram}</b> visualizaram · <b className="text-destructive">{linhas.length - leram}</b> não visualizaram</span>
          <Button size="sm" variant="outline" onClick={() => imprimirElemento("avisos-leitura-print")}><Printer className="size-4" /> Imprimir</Button>
          <Button size="sm" onClick={() => baixarExcel(`leitura-avisos-${new Date().toISOString().slice(0, 10)}`, cab, linhas.map(valores))}><FileSpreadsheet className="size-4" /> Gerar Excel</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou unidade" className="pl-8" aria-label="Buscar pessoa ou unidade" /></div>
          <div className="w-48"><SearchSelect value={filtro} onChange={(v) => setFiltro((v || "todos") as typeof filtro)} allowClear={false} options={[{ value: "nao", label: "Não visualizaram" }, { value: "todos", label: "Todos" }, { value: "leram", label: "Visualizaram" }]} /></div>
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>{cab.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={cab.length} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                : !linhas.length ? <TableRow><TableCell colSpan={cab.length} className="py-6 text-center text-muted-foreground">Nenhum registro.</TableCell></TableRow>
                : linhas.map((r) => (
                  <TableRow key={r.id}>
                    {varios && <TableCell className="text-sm">{r.aviso}</TableCell>}
                    <TableCell className="text-sm">{r.unidade}</TableCell>
                    <TableCell className="text-sm font-medium">{r.nome}</TableCell>
                    <TableCell className="text-sm">{r.contato}</TableCell>
                    <TableCell><Badge variant="outline" className={r.entrega === "Entregue" ? "border-success/40 text-success" : r.entrega === "Falha" ? "border-destructive/40 text-destructive" : ""}>{r.entrega}</Badge></TableCell>
                    <TableCell className="text-sm">{r.dataAviso}</TableCell>
                    <TableCell className={cn("text-sm", !r.lido && "text-muted-foreground")}>{r.lido || (r.semConfirmacao ? "Não foi possível conferir" : "Não visualizou")}</TableCell>
                    <TableCell className="text-sm">{r.onde || "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Cada mensagem leva um link pessoal do comunicado: ao abrir por ele, a leitura é registrada com o canal (E-mail ou WhatsApp). No e-mail, a abertura com imagens liberadas também conta; robôs de pré-carregamento (Gmail, Apple, antivírus) são ignorados. No WhatsApp, sem clique no link, aparece "Não foi possível conferir".</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>

        <div className="dre-print-src" aria-hidden>
          <div id="avisos-leitura-print" className="dre-doc">
            <CabecalhoDoc titulo="Leitura de avisos" sub={titulo} />
            <table className="dre-kpis"><tbody><tr>
              <td><span>Destinatários</span><strong>{linhas.length}</strong></td>
              <td><span>Visualizaram</span><strong>{leram}</strong></td>
              <td><span>Não visualizaram</span><strong>{linhas.length - leram}</strong></td>
              <td><span>Taxa de leitura</span><strong>{percentualEnvio(leram, linhas.length)}%</strong></td>
            </tr></tbody></table>
            <table className="dre-tab"><thead><tr>{cab.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{linhas.map((r) => <tr key={r.id}>{valores(r).map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table>
            <footer className="dre-rodape">Leituras registradas pelo sistema. Documento de uso interno.</footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------- Status de envio ---------------------- */

function StatusEnvioDialog({ aviso, onClose }: { aviso: Row; onClose: () => void }) {
  const fila = useFilaAvisos().find((t) => t.avisoId === s(aviso["id"]) && (t.estado === "fila" || t.estado === "enviando"));
  const total = fila?.total || Number(aviso["total"] ?? 0);
  const feito = fila ? fila.feito : Number(aviso["enviados"] ?? 0) + Number(aviso["falhas"] ?? 0);
  const st = statusDoAviso(aviso["status"]);
  const situacao = fila ? `Enviando ${feito} de ${total}` : st === "agendado" ? `Agendado para ${dtHora(aviso["agendado_para"])}` : aviso["finalizado_em"] ? `Finalizado em ${dtHora(aviso["finalizado_em"])}` : STATUS_AVISO[st].label;
  const linhas: [string, string][] = [
    ["Título", s(aviso["titulo"])], ["Início", dtHora(aviso["iniciado_em"] ?? aviso["created_at"])], ["Fim", dtHora(aviso["finalizado_em"])],
    ["Status envio", situacao], ["Entregues", String(aviso["enviados"] ?? 0)], ["Falhas", String(aviso["falhas"] ?? 0)],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Status de envio</DialogTitle></DialogHeader>
        <Table><TableBody>{linhas.map(([k, v]) => <TableRow key={k}><TableCell className="w-40 text-muted-foreground">{k}</TableCell><TableCell>{v}</TableCell></TableRow>)}</TableBody></Table>
        <div className="space-y-1"><Progress value={percentualEnvio(feito, total)} className="h-4" /><p className="text-right text-xs text-muted-foreground">{feito} / {total} ({percentualEnvio(feito, total)}%)</p></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => imprimirElemento("aviso-status-print")}><Printer className="size-4" /> Imprimir</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
        <div className="dre-print-src" aria-hidden>
          <div id="aviso-status-print" className="dre-doc">
            <CabecalhoDoc titulo="Status de envio" sub={s(aviso["titulo"])} />
            <table className="dre-tab"><tbody>{linhas.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
            <footer className="dre-rodape">Documento de uso interno.</footer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------- Reenviar / agendar ---------------------- */

function ReenviarDialog({ aviso, empresaId, nomeCondominio, onClose }: { aviso: Row; empresaId: string; nomeCondominio: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [quem, setQuem] = useState<"todos" | "falhas" | "nao_leram">(Number(aviso["falhas"] ?? 0) > 0 ? "falhas" : "nao_leram");
  const [agendar, setAgendar] = useState(false);
  const [quando, setQuando] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function confirmarReenvio() {
    if (agendar) { const e = validarAgendamento(quando); if (e) { toast.error(e); return; } }
    setSalvando(true);
    try {
      const id = aviso["id"];
      let alvo: Row[];
      if (quem === "falhas") alvo = await buscarTodos("cond_avisos_envios", (q) => q.eq("aviso_id", id).eq("status", "falha"), "id");
      else if (quem === "todos") alvo = await buscarTodos("cond_avisos_envios", (q) => q.eq("aviso_id", id), "id");
      else {
        const [env, lid] = await Promise.all([buscarTodos("cond_avisos_envios", (q) => q.eq("aviso_id", id), "id,usuario_id"), buscarTodos("cond_avisos_leituras", (q) => q.eq("aviso_id", id), "id,usuario_id")]);
        const leu = new Set(lid.map((l) => s(l["usuario_id"])));
        alvo = env.filter((e) => !leu.has(s(e["usuario_id"])));
      }
      if (!alvo.length) { toast.error("Ninguém se encaixa nessa opção."); setSalvando(false); return; }
      const ids = alvo.map((e) => e["id"]);
      for (let i = 0; i < ids.length; i += 200) await db.from("cond_avisos_envios").update({ status: "pendente", erro: null }).in("id", ids.slice(i, i + 200));
      if (agendar) {
        await db.from("cond_avisos").update({ status: "agendado", agendado_para: new Date(quando).toISOString() }).eq("id", id);
        toast.success(`Reenvio agendado para ${dtHora(new Date(quando).toISOString())}.`);
      } else {
        enfileirarAviso({ avisoId: s(id), titulo: s(aviso["titulo"]), empresaId, nomeCondominio });
        toast.success(`Reenviando para ${alvo.length} contato(s) em segundo plano.`);
      }
      await qc.invalidateQueries({ queryKey: ["cond", "cond_avisos"] });
      onClose();
    } catch (x) { toast.error(x instanceof Error ? x.message : "Não foi possível reenviar."); setSalvando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="size-5" /> Reenviar aviso</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{s(aviso["titulo"])}</p>
        <div><Label className="mb-1.5 block">Para quem</Label>
          <SearchSelect value={quem} onChange={(v) => setQuem((v || "todos") as typeof quem)} allowClear={false}
            options={[{ value: "falhas", label: `Só quem teve falha (${Number(aviso["falhas"] ?? 0)})` }, { value: "nao_leram", label: "Só quem ainda não visualizou" }, { value: "todos", label: "Todos os destinatários" }]} /></div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={agendar} onCheckedChange={setAgendar} /><CalendarClock className="size-4" /> Agendar em vez de enviar agora</label>
        {agendar && <div><Label htmlFor="re-quando" className="mb-1.5 block">Data e hora</Label><Input id="re-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /></div>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={confirmarReenvio} disabled={salvando}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {agendar ? "Agendar" : "Reenviar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------- Novo / editar ---------------------- */

function AvisoEditorDialog({ base, condominioId, condominios, blocos, unidades, empresaId, onClose }: { base?: Row; condominioId: string; condominios: Opt[]; blocos: Row[]; unidades: Row[]; empresaId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const editando = !!base;
  const novaVersao = editando && statusDoAviso(base!["status"]) === "enviado";
  const [escopo, setEscopo] = useState<"condominio" | "carteira">("condominio");
  const [torres, setTorres] = useState<string[]>([]);
  const [unids, setUnids] = useState<string[]>([]);
  const [publico, setPublico] = useState<PublicoAviso>("todos");
  const [tipo, setTipo] = useState(s(base?.["tipo"]) || "geral");
  const [titulo, setTitulo] = useState(s(base?.["titulo"]));
  const [mensagem, setMensagem] = useState(s(base?.["mensagem"]));
  const [expira, setExpira] = useState(s(base?.["expira_em"]).slice(0, 10));
  const canaisBase = (base?.["canais"] as string[] | undefined) ?? ["whatsapp", "email"];
  const [whats, setWhats] = useState(canaisBase.includes("whatsapp"));
  const [email, setEmail] = useState(canaisBase.includes("email"));
  const [agendar, setAgendar] = useState(editando && statusDoAviso(base!["status"]) === "agendado");
  const [quando, setQuando] = useState(() => { const v = s(base?.["agendado_para"]); if (!v) return ""; const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [salvando, setSalvando] = useState(false);
  const [anexo, setAnexo] = useState<File | null>(null);
  const previa = useMemo(() => (anexo ? URL.createObjectURL(anexo) : ""), [anexo]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);
  const tipoAnexo = anexo ? tipoMidiaAviso(anexo.type, anexo.name) : null;
  function escolherAnexo(f: File | undefined) {
    if (!f) return;
    const motivo = validarMidiaAviso(f);
    if (motivo) { toast.error(motivo); return; }
    setAnexo(f);
  }

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
    enabled: !editando && condIds.length > 0,
    queryFn: async (): Promise<Destinatario[]> => {
      const { data, error } = await db.rpc("cond_avisos_destinatarios", { p_condominios: condIds, p_blocos: pTorres, p_unidades: pUnids });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: Row) => ({ ...r, condominio_id: s(r["condominio_id"]), cond_unidade_id: s(r["cond_unidade_id"]), usuario_id: s(r["usuario_id"]), unidade: s(r["unidade"]), bloco: s(r["bloco"]), nome: s(r["nome"]), papel: s(r["papel"]), email: (r["email"] as string) ?? null, celular: (r["celular"] as string) ?? null }));
    },
  });
  const plano = useMemo(() => planejarEnvios(dest, publico, canais), [dest, publico, canais.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrangencia = escopo === "carteira" ? `Carteira (${condominios.length} condomínios)`
    : pUnids.length ? `${pUnids.length} unidade(s)` : pTorres.length ? blocosOpt.filter((b) => pTorres.includes(b.value)).map((b) => b.label).join(", ") : "Todas as torres";

  async function salvar() {
    const imagensTexto = imagensDoHtml(mensagem);
    const erro = validarAviso({ titulo, mensagemTexto: htmlParaTexto(mensagem), canais, condominios: editando ? [condominioId] : condIds, temImagem: imagensTexto.length > 0 || !!base?.["midia_url"] });
    if (erro) { toast.error(erro); return; }
    if (agendar) { const e = validarAgendamento(quando); if (e) { toast.error(e); return; } }
    if (!editando && !plano.envios.length) { toast.error("Nenhuma pessoa com contato para esse público."); return; }
    const acao = agendar ? "Agendar" : "Enviar";
    const desc = editando
      ? novaVersao ? `Será criada a versão V${Number(base!["versao"] ?? 1) + 1} e enviada para os mesmos destinatários. A versão anterior fica marcada como substituída.` : "O aviso agendado será atualizado."
      : `${plano.envios.length} mensagem(ns) para ${plano.pessoas} pessoa(s). O envio roda em segundo plano — você pode continuar usando o sistema.`;
    if (!(await confirmar({ title: editando ? (novaVersao ? "Enviar nova versão?" : "Salvar alterações?") : `${acao} aviso?`, description: desc, confirmText: editando && !novaVersao ? "Salvar" : acao }))) return;
    setSalvando(true);
    const nomeCond = new Map(condominios.map((c) => [c.value, c.label]));
    try {
      let midia: Row = {};
      if (anexo && tipoAnexo) midia = { midia_url: await uploadAnexo(anexo), midia_tipo: tipoAnexo, midia_nome: anexo.name };
      const comum = { tipo, titulo: titulo.trim(), mensagem, canais, expira_em: expira || null, status: agendar ? "agendado" : "enviando", agendado_para: agendar ? new Date(quando).toISOString() : null, ...midia };
      const disparar = (id: string, cid: string) => { if (!agendar) enfileirarAviso({ avisoId: id, titulo: titulo.trim(), empresaId, nomeCondominio: nomeCond.get(cid) ?? "" }); };

      if (editando && !novaVersao) {
        const { error } = await db.from("cond_avisos").update(comum).eq("id", base!["id"]);
        if (error) throw new Error(error.message);
        disparar(s(base!["id"]), s(base!["condominio_id"]));
      } else if (novaVersao) {
        const anteriores = await buscarTodos("cond_avisos_envios", (q) => q.eq("aviso_id", base!["id"]), COLS_ENVIO);
        const vistos = new Set<string>();
        const novos = anteriores.filter((e) => canais.includes(s(e["canal"]) as CanalAviso)).filter((e) => { const k = `${s(e["usuario_id"])}|${s(e["canal"])}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
        const { data: av, error } = await db.from("cond_avisos").insert({
          ...comum, lote_id: crypto.randomUUID(), condominio_id: base!["condominio_id"], publico: base!["publico"], abrangencia: base!["abrangencia"], total: novos.length,
          versao: Number(base!["versao"] ?? 1) + 1, aviso_origem_id: base!["id"],
          ...(anexo ? {} : { midia_url: base!["midia_url"] ?? null, midia_tipo: base!["midia_tipo"] ?? null, midia_nome: base!["midia_nome"] ?? null }),
        }).select("id").single();
        if (error) throw new Error(error.message);
        await inserirEmLotes("cond_avisos_envios", novos.map((e) => ({ aviso_id: av.id, usuario_id: e["usuario_id"], cond_unidade_id: e["cond_unidade_id"], nome: e["nome"], unidades: e["unidades"], canal: e["canal"], destino: e["destino"] })));
        await db.from("cond_avisos").update({ status: "substituido" }).eq("id", base!["id"]);
        disparar(av.id, s(base!["condominio_id"]));
      } else {
        const lote = crypto.randomUUID();
        const porCond = new Map<string, typeof plano.envios>();
        for (const e of plano.envios) porCond.set(e.condominio_id, [...(porCond.get(e.condominio_id) ?? []), e]);
        for (const [cid, envios] of porCond) {
          const { data: av, error } = await db.from("cond_avisos").insert({ ...comum, lote_id: lote, condominio_id: cid, publico, abrangencia, total: envios.length }).select("id").single();
          if (error) throw new Error(error.message);
          await inserirEmLotes("cond_avisos_envios", envios.map((e) => ({ aviso_id: av.id, usuario_id: e.usuario_id, cond_unidade_id: e.cond_unidade_id, nome: e.nome, unidades: e.unidades, canal: e.canal, destino: e.destino })));
          disparar(av.id, cid);
        }
      }
      await qc.invalidateQueries({ queryKey: ["cond", "cond_avisos"] });
      toast.success(agendar ? "Aviso agendado." : "Envio iniciado. Acompanhe o progresso no canto da tela.");
      onClose();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle className="flex items-center gap-2"><Megaphone className="size-5" /> {editando ? (novaVersao ? `Editar aviso — nova versão V${Number(base!["versao"] ?? 1) + 1}` : "Editar aviso agendado") : "Novo aviso"}</DialogTitle></DialogHeader>

        <div className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-2">
          {editando ? (
            <p className="rounded-md border bg-muted/30 p-3 text-sm">Destinatários: <b>{s(base!["abrangencia"])}</b> — os mesmos do aviso original ({Number(base!["total"] ?? 0)} contato(s)).</p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">1. Para quem</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Abrangência">
                {([["condominio", Building, "Este condomínio", "Escolha torres e unidades"], ["carteira", Building2, "Toda a carteira", `${condominios.length} condomínios`]] as const).map(([v, Icon, t, sub]) => (
                  <button key={v} type="button" role="radio" aria-checked={escopo === v} onClick={() => setEscopo(v)} disabled={salvando}
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
          )}

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">{editando ? "Mensagem" : "2. Mensagem"}</legend>
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={tipo} onChange={(v) => setTipo(v || "geral")} options={[...TIPOS_AVISO].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))} allowClear={false} /></div>
              <div><Label htmlFor="av-titulo" className="mb-1.5 block">Título</Label><Input id="av-titulo" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Manutenção do elevador social" /></div>
            </div>
            <div className="sm:w-1/2">
              <Label htmlFor="av-expira" className="mb-1.5 block">Data final de visualização</Label>
              <CampoData id="av-expira" value={expira} onChange={setExpira} inicio={new Date().getFullYear()} />
              <p className="mt-1 text-xs text-muted-foreground">Em branco, o aviso não expira. Depois dessa data ele deixa de aparecer como vigente, mas não é excluído.</p>
            </div>
            <div>
              <Label className="mb-1.5 block">Texto</Label>
              <TextoRico value={mensagem} onChange={setMensagem} minHeight={140} placeholder="Escreva o comunicado, cole ou arraste uma imagem…" enviarImagem={uploadAnexo} />
              <p className="mt-1 text-xs text-muted-foreground">Use {"{{nome}}"}, {"{{unidade}}"} e {"{{condominio}}"} para personalizar. Imagens no texto vão como foto no WhatsApp; a formatação vira texto simples.</p>
            </div>
            <div>
              <Label className="mb-1.5 block">Anexo (opcional){editando && s(base!["midia_nome"]) && !anexo ? ` — atual: ${s(base!["midia_nome"])}` : ""}</Label>
              {!anexo ? (
                <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); escolherAnexo(e.dataTransfer.files[0]); }}
                  className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground transition hover:border-primary/60 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary/30">
                  <Paperclip className="size-5 text-primary" />
                  <span><b className="text-foreground">Clique ou arraste</b> uma imagem, vídeo ou PDF</span>
                  <span className="text-xs">Imagem até {LIMITE_MIDIA_MB.imagem} MB · Vídeo MP4 até {LIMITE_MIDIA_MB.video} MB · PDF até {LIMITE_MIDIA_MB.documento} MB</span>
                  <input type="file" accept={ACEITE_MIDIA_AVISO} className="sr-only" disabled={salvando} onChange={(e) => { escolherAnexo(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  {tipoAnexo === "imagem" ? <img src={previa} alt="Prévia do anexo" className="size-16 rounded object-cover" />
                    : tipoAnexo === "video" ? <video src={previa} className="h-16 w-24 rounded bg-muted object-cover" muted />
                    : <div className="flex size-16 items-center justify-center rounded bg-primary/10"><FileText className="size-7 text-primary" /></div>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{anexo.name}</p>
                    <p className="text-xs text-muted-foreground">{tipoAnexo === "imagem" ? "Imagem" : tipoAnexo === "video" ? "Vídeo" : "PDF"} · {(anexo.size / 1024 / 1024).toFixed(1)} MB · no WhatsApp o texto vai como legenda</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover anexo" onClick={() => setAnexo(null)} disabled={salvando}><X className="size-4" /></Button>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">{editando ? "Canais e envio" : "3. Canais e envio"}</legend>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={whats} onCheckedChange={setWhats} disabled={salvando} /><MessageCircle className="size-4" /> WhatsApp</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={email} onCheckedChange={setEmail} disabled={salvando} /><Mail className="size-4" /> E-mail</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={agendar} onCheckedChange={setAgendar} disabled={salvando} /><CalendarClock className="size-4" /> Agendar envio</label>
            </div>
            {agendar && <div className="sm:w-1/2"><Label htmlFor="av-quando" className="mb-1.5 block">Data e hora do envio</Label><Input id="av-quando" type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Sai automaticamente no horário quando alguém da gestão estiver com o sistema aberto.</p></div>}
          </fieldset>

          {!editando && (
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
          )}
        </div>

        <DialogFooter className="-mx-6 -mb-6 shrink-0 border-t bg-background px-6 py-3">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || (!editando && isFetching)}>{salvando ? <Loader2 className="size-4 animate-spin" /> : agendar ? <CalendarClock className="size-4" /> : <Megaphone className="size-4" />} {editando && !novaVersao ? "Salvar" : agendar ? "Agendar aviso" : "Enviar aviso"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
