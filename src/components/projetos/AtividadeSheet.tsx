import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileIcon, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ResponsaveisPicker } from "@/components/projetos/ResponsaveisPicker";
import { useTableRows, rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { ATIVIDADES, ATIV_DEPS, C, PRIORIDADES, atividadePct, doneValue, filterPayload, isDone, prioridadeClass, progressoCor, resolveCol, sincronizarTarefa, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";

const BUCKET = "projetos";

export function AtividadeSheet({ atividade, isNew, tarefaId, projetoId, atividadesDoProjeto, tCols, perms, onClose }: {
  atividade: Row | null; isNew: boolean; tarefaId: string; projetoId: string; atividadesDoProjeto: Row[];
  tCols: string[] | undefined; perms: Perms; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: usuarios = [] } = useTableRows("usuarios");
  const open = Boolean(atividade) || isNew;
  const readOnly = isNew ? !perms.canCreate : !perms.canUpdate;
  const [form, setForm] = useState<Row>({});
  const formKey = isNew ? `nova-${tarefaId}` : atividade ? String(rowId(atividade)) : "";
  useEffect(() => {
    setForm(atividade ? { ...atividade } : { prioridade: "Normal", responsaveis: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const resps = Array.isArray(form["responsaveis"]) ? (form["responsaveis"] as unknown[]).map(String) : [];
  const aid = atividade ? String(rowId(atividade)) : "";
  const tid = atividade ? String(atividade["tarefa_id"]) : tarefaId;

  async function salvar() {
    if (!String(form["nome"] ?? "").trim()) { toast.error("Informe o nome da atividade."); return; }
    if (form["dt_inicio"] && form["dt_fim"] && String(form["dt_fim"]) < String(form["dt_inicio"])) { toast.error("A data fim deve ser igual ou posterior ao início."); return; }
    const base: Row = {
      nome: String(form["nome"]).trim(), descricao: form["descricao"] || null, responsaveis: resps,
      dt_inicio: form["dt_inicio"] || null, dt_fim: form["dt_fim"] || null, prioridade: form["prioridade"] ?? "Normal",
    };
    let error;
    if (atividade) {
      ({ error } = await supabase.from(ATIVIDADES as never).update(stamp(base, false) as never).eq("id", aid as never));
    } else {
      const irmas = atividadesDoProjeto.filter((a) => String(a["tarefa_id"]) === tarefaId);
      const ordem = irmas.reduce((mx, a) => Math.max(mx, Number(a["ordem"] ?? 0)), -1) + 1;
      ({ error } = await supabase.from(ATIVIDADES as never).insert(stamp({ ...base, tarefa_id: tarefaId, progresso: 0, situacao: "Em andamento", ordem }, true) as never));
    }
    if (error) { toast.error(error.message); return; }
    await sincronizarTarefa(tid, tCols);
    toast.success("Atividade salva.");
    qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] });
    qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{isNew ? "Nova atividade" : String(atividade?.["nome"] ?? "Atividade")}</SheetTitle>
          <SheetDescription>Período, responsáveis, progresso, checklist, dependências e anexos.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {atividade && <ProgressoAtividade atividade={atividade} tCols={tCols} readOnly={!perms.canUpdate} />}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nome da atividade *</Label>
              <Input disabled={readOnly} value={String(form["nome"] ?? "")} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea disabled={readOnly} rows={3} value={String(form["descricao"] ?? "")} onChange={(e) => set("descricao", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Responsáveis</Label>
              <div><ResponsaveisPicker disabled={readOnly} value={resps} usuarios={usuarios} onChange={(v) => set("responsaveis", v)} /></div>
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select disabled={readOnly} value={String(form["prioridade"] ?? "Normal")} onValueChange={(v) => set("prioridade", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => <SelectItem key={p} value={p}><Badge className={prioridadeClass(p)}>{p}</Badge></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Dt Início</Label>
              <Input type="date" disabled={readOnly} value={String(form["dt_inicio"] ?? "").slice(0, 10)} onChange={(e) => set("dt_inicio", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Dt Fim</Label>
              <Input type="date" disabled={readOnly} value={String(form["dt_fim"] ?? "").slice(0, 10)} onChange={(e) => set("dt_fim", e.target.value)} />
            </div>
          </section>
          {atividade ? (
            <>
              <Checklist atividadeId={aid} tarefaId={tid} readOnly={!perms.canUpdate} />
              <Dependencias atividadeId={aid} atividades={atividadesDoProjeto.filter((a) => String(rowId(a)) !== aid)} readOnly={!perms.canUpdate} />
              <Anexos atividadeId={aid} tarefaId={tid} projetoId={projetoId} readOnly={!perms.canUpdate} />
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              Salve a atividade para liberar checklist, dependências e anexos.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProgressoAtividade({ atividade, tCols, readOnly }: { atividade: Row; tCols: string[] | undefined; readOnly: boolean }) {
  const T = "projetos_tarefas_checklists";
  const qc = useQueryClient();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const okC = resolveCol(cols, all, C.check.concluido);
  const aid = String(rowId(atividade));
  const items = all.filter((r) => String(r["atividade_id"] ?? "") === aid);
  const temChecklist = items.length > 0;
  const auto = temChecklist ? Math.round((items.filter((i) => isDone(i[okC])).length / items.length) * 100) : null;
  const [pct, setPct] = useState(() => atividadePct(atividade));
  const salvo = useRef(pct);
  useEffect(() => { const v = atividadePct(atividade); setPct(v); salvo.current = v; }, [atividade]);

  async function gravar(novo: number) {
    const anterior = salvo.current;
    if (novo === anterior) return;
    setPct(novo); salvo.current = novo;
    const { error } = await supabase.from(ATIVIDADES as never)
      .update({ progresso: novo, situacao: novo >= 100 ? "Concluída" : "Em andamento" } as never).eq("id", aid as never);
    if (error) { toast.error(error.message); salvo.current = anterior; setPct(anterior); return; }
    await sincronizarTarefa(String(atividade["tarefa_id"]), tCols);
    qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] });
    qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
  }
  useEffect(() => { if (auto !== null && !readOnly) void gravar(auto); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auto]);

  const mostrado = auto ?? pct;
  const travado = readOnly || temChecklist;
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Progresso da atividade</h3>
        <span className="text-sm font-semibold" style={{ color: progressoCor(mostrado) }}>{mostrado}%</span>
      </div>
      <Progress value={mostrado} indicatorColor={progressoCor(mostrado)} className="h-2.5 bg-muted" />
      <div className="flex flex-wrap gap-2">
        {[0, 25, 50, 75, 100].map((v) => (
          <Button key={v} size="sm" variant={mostrado === v ? "default" : "outline"} disabled={travado} onClick={() => gravar(v)}>{v}%</Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {temChecklist ? "Calculado automaticamente pelo checklist." : "Controle manual. Ao adicionar itens no checklist, o progresso passa a ser automático."}
      </p>
    </section>
  );
}

function Checklist({ atividadeId, tarefaId, readOnly }: { atividadeId: string; tarefaId: string; readOnly: boolean }) {
  const T = "projetos_tarefas_checklists";
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const tC = resolveCol(cols, all, C.check.tarefa);
  const dC = resolveCol(cols, all, C.check.descricao);
  const okC = resolveCol(cols, all, C.check.concluido);
  const items = all.filter((r) => String(r["atividade_id"] ?? "") === atividadeId)
    .sort((a, b) => String(rowId(a)).localeCompare(String(rowId(b)), undefined, { numeric: true }));
  const [txt, setTxt] = useState("");
  const done = items.filter((i) => isDone(i[okC])).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", T] });

  async function add() {
    if (!txt.trim()) return;
    const payload = filterPayload(stamp({ [tC]: tarefaId, atividade_id: atividadeId, [dC]: txt.trim(), [okC]: doneValue(okC, false) }, true), cols?.length ? [...cols, "atividade_id"] : cols);
    const { error } = await supabase.from(T).insert(payload as never);
    if (error) { toast.error(error.message); return; }
    setTxt(""); refresh();
  }
  async function toggle(r: Row, v: boolean) {
    const { error } = await supabase.from(T).update({ [okC]: doneValue(okC, v) } as never).eq(idColumn(r), rowId(r) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function del(r: Row) {
    const { error } = await supabase.from(T).delete().eq(idColumn(r), rowId(r) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Checklist</h3>
        <span className="text-xs text-muted-foreground">{done}/{items.length}</span>
      </div>
      <ul className="space-y-1">
        {items.map((r) => (
          <li key={String(rowId(r))} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
            <Checkbox disabled={readOnly} checked={isDone(r[okC])} onCheckedChange={(v) => toggle(r, v === true)} />
            <span className={`flex-1 text-sm ${isDone(r[okC]) ? "font-medium" : ""}`} style={isDone(r[okC]) ? { color: "var(--progress-100)" } : undefined}>{String(r[dC] ?? "")}</span>
            {!readOnly && (
              <button className="opacity-0 group-hover:opacity-100" onClick={() => del(r)} aria-label="Remover item">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="flex gap-2">
          <Input placeholder="Adicionar item…" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button variant="secondary" onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
      )}
    </section>
  );
}

function Dependencias({ atividadeId, atividades, readOnly }: { atividadeId: string; atividades: Row[]; readOnly: boolean }) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: all = [] } = useTableRows(ATIV_DEPS);
  const mine = all.filter((r) => String(r["atividade_id"]) === atividadeId);
  const selected = new Set(mine.map((r) => String(r["depende_de_id"])));
  const nome = (id: string) => String(atividades.find((t) => String(rowId(t)) === id)?.["nome"] ?? "Atividade");

  async function toggle(id: string) {
    const existing = mine.find((r) => String(r["depende_de_id"]) === id);
    const { error } = existing
      ? await supabase.from(ATIV_DEPS as never).delete().eq("id", rowId(existing) as never)
      : await supabase.from(ATIV_DEPS as never).insert(stamp({ atividade_id: atividadeId, depende_de_id: id }, true) as never);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", ATIV_DEPS] });
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-foreground">Dependências</h3>
      <p className="text-xs text-muted-foreground">Atividades deste projeto que precisam terminar antes desta.</p>
      <div className="flex flex-wrap gap-2">
        {[...selected].map((id) => (
          <Badge key={id} variant="secondary" className="gap-1">
            {nome(id)}
            {!readOnly && <button onClick={() => toggle(id)} aria-label="Remover dependência"><X className="h-3 w-3" /></button>}
          </Badge>
        ))}
        {selected.size === 0 && <span className="text-sm text-muted-foreground">Nenhuma dependência.</span>}
      </div>
      {!readOnly && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />Selecionar atividades</Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-80 overflow-y-auto p-2">
            {atividades.length === 0 && <p className="p-2 text-sm text-muted-foreground">Não há outras atividades no projeto.</p>}
            {atividades.map((t) => {
              const id = String(rowId(t));
              return (
                <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} />
                  {String(t["nome"] ?? "")}
                </label>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </section>
  );
}

function Anexos({ atividadeId, tarefaId, projetoId, readOnly }: { atividadeId: string; tarefaId: string; projetoId: string; readOnly: boolean }) {
  const T = "projetos_tarefas_anexos";
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const c = {
    t: resolveCol(cols, all, C.anexo.tarefa), nome: resolveCol(cols, all, C.anexo.nome),
    url: resolveCol(cols, all, C.anexo.url), path: resolveCol(cols, all, C.anexo.path),
    tam: resolveCol(cols, all, C.anexo.tamanho), tipo: resolveCol(cols, all, C.anexo.tipo),
  };
  const mine = all.filter((r) => String(r["atividade_id"] ?? "") === atividadeId);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    for (const f of Array.from(files)) {
      const safe = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const path = `${projetoId}/${tarefaId}/${atividadeId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, f.type ? { contentType: f.type } : {});
      if (up.error) { toast.error(`${f.name}: ${up.error.message}`); continue; }
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const payload = filterPayload(stamp({ [c.t]: tarefaId, atividade_id: atividadeId, [c.nome]: f.name, [c.url]: url, [c.path]: path, [c.tam]: f.size, [c.tipo]: f.type }, true), cols?.length ? [...cols, "atividade_id"] : cols);
      const { error } = await supabase.from(T).insert(payload as never);
      if (error) { toast.error(error.message); await supabase.storage.from(BUCKET).remove([path]); }
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["table", T] });
  }
  async function del(r: Row) {
    if (!confirm(`Remover o anexo "${r[c.nome]}"?`)) return;
    const path = String(r[c.path] ?? "") || String(r[c.url] ?? "").split(`/${BUCKET}/`)[1] || "";
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    const { error } = await supabase.from(T).delete().eq(idColumn(r), rowId(r) as never);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", T] });
  }
  async function abrir(r: Row) {
    const path = String(r[c.path] ?? "");
    if (path) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank"); return; }
    }
    if (r[c.url]) window.open(String(r[c.url]), "_blank");
  }

  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-foreground">Anexos</h3>
      {!readOnly && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${drag ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span>{busy ? "Enviando…" : "Arraste arquivos aqui ou clique para escolher"}</span>
          <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
      )}
      <ul className="space-y-1">
        {mine.map((r) => (
          <li key={String(rowId(r))} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <button className="flex-1 truncate text-left hover:underline" onClick={() => abrir(r)}>{String(r[c.nome] ?? "arquivo")}</button>
            {r[c.tam] ? <span className="text-xs text-muted-foreground">{(Number(r[c.tam]) / 1024).toFixed(0)} KB</span> : null}
            {!readOnly && <button onClick={() => del(r)} aria-label="Remover anexo"><Trash2 className="h-4 w-4 text-destructive" /></button>}
          </li>
        ))}
        {mine.length === 0 && <li className="flex items-center gap-2 text-sm text-muted-foreground"><Paperclip className="h-4 w-4" />Nenhum anexo.</li>}
      </ul>
    </section>
  );
}
