import { ResponsaveisPicker, responsaveisDe } from "@/components/projetos/ResponsaveisPicker";
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
import { useTableRows, rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { C, PRIORIDADES, doneValue, filterPayload, isDone, nomePessoa, prioridadeClass, progressoCor, progressoPayload, resolveCol, tarefaPct, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";

const BUCKET = "projetos";

export function TarefaSheet({ tarefa, tarefasDoProjeto, projetoId, perms, onClose, isNew }: {
  tarefa: Row | null; tarefasDoProjeto: Row[]; projetoId: string; perms: Perms; onClose: () => void; isNew: boolean;
}) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: tCols } = useCols("projetos_tarefas");
  const allT = tarefasDoProjeto;
  const tc = {
    projeto: resolveCol(tCols, allT, C.tarefa.projeto),
    nome: resolveCol(tCols, allT, C.tarefa.nome),
    descricao: resolveCol(tCols, allT, C.tarefa.descricao),
    resp: resolveCol(tCols, allT, C.tarefa.responsavel),
    ini: resolveCol(tCols, allT, C.tarefa.dtInicio),
    fim: resolveCol(tCols, allT, C.tarefa.dtFim),
    prio: resolveCol(tCols, allT, C.tarefa.prioridade),
    done: resolveCol(tCols, allT, C.tarefa.concluida),
  };
  const open = Boolean(tarefa) || isNew;
  const readOnly = isNew ? !perms.canCreate : !perms.canUpdate;
  const [form, setForm] = useState<Row>({});
  useEffect(() => {
    setForm(tarefa ? { ...tarefa } : { [tc.prio]: "Normal" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa, isNew]);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const resps = responsaveisDe(form, tc.resp);
  async function salvar() {
    if (!String(form[tc.nome] ?? "").trim()) { toast.error("Informe o nome da tarefa."); return; }
    const base: Row = {
      [tc.nome]: form[tc.nome], [tc.descricao]: form[tc.descricao] ?? null, [tc.resp]: resps[0] ?? null, responsaveis: resps,
      [tc.ini]: form[tc.ini] || null, [tc.fim]: form[tc.fim] || null, [tc.prio]: form[tc.prio] ?? "Normal",
    };
    if (tc.nome === tc.descricao) delete base[tc.descricao];
    let error;
    if (tarefa) {
      ({ error } = await supabase.from("projetos_tarefas").update(filterPayload(stamp(base, false), tCols)).eq(idColumn(tarefa), rowId(tarefa) as never));
    } else {
      base[tc.projeto] = projetoId;
      ({ error } = await supabase.from("projetos_tarefas").insert(filterPayload(stamp({ ...base, ordem: tarefasDoProjeto.reduce((mx, t) => Math.max(mx, Number(t["ordem"] ?? -1) || 0), -1) + 1 }, true), tCols)));
    }
    if (error) { toast.error(error.message); return; }
    toast.success("Tarefa salva.");
    qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
    onClose();
  }

  const tid = tarefa ? String(rowId(tarefa)) : "";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{isNew ? "Nova tarefa" : String(tarefa?.[tc.nome] ?? "Tarefa")}</SheetTitle>
          <SheetDescription>Detalhes, checklist, dependências e anexos da tarefa.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {tarefa && <ProgressoTarefa tarefa={tarefa} tarefaId={tid} doneCol={tc.done} tCols={tCols} readOnly={!perms.canUpdate} />}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome da tarefa</Label>
              <Input disabled={readOnly} value={String(form[tc.nome] ?? "")} onChange={(e) => set(tc.nome, e.target.value)} />
            </div>
            {tc.descricao !== tc.nome && (
              <div className="sm:col-span-2 space-y-1">
                <Label>Descrição</Label>
                <Textarea disabled={readOnly} rows={3} value={String(form[tc.descricao] ?? "")} onChange={(e) => set(tc.descricao, e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Responsáveis</Label>
              <div><ResponsaveisPicker disabled={readOnly} value={resps} usuarios={usuarios} onChange={(v) => setForm((f) => ({ ...f, responsaveis: v, [tc.resp]: v[0] ?? null }))} /></div>
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select disabled={readOnly} value={String(form[tc.prio] ?? "Normal")} onValueChange={(v) => set(tc.prio, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}><Badge className={prioridadeClass(p)}>{p}</Badge></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Dt Início</Label>
              <Input type="date" disabled={readOnly} value={String(form[tc.ini] ?? "").slice(0, 10)} onChange={(e) => set(tc.ini, e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Dt Fim</Label>
              <Input type="date" disabled={readOnly} value={String(form[tc.fim] ?? "").slice(0, 10)} onChange={(e) => set(tc.fim, e.target.value)} />
            </div>
          </section>

          {tarefa ? (
            <>
              <Checklist tarefaId={tid} readOnly={!perms.canUpdate} />
              <Dependencias tarefaId={tid} tarefas={allT.filter((t) => String(rowId(t)) !== tid)} nomeCol={tc.nome} readOnly={!perms.canUpdate} />
              <Anexos tarefaId={tid} projetoId={projetoId} readOnly={!perms.canUpdate} />
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
              Salve a tarefa para liberar checklist, dependências e anexos.
            </p>
          )}
          {tarefa && isDone(tarefa[tc.done]) && <Badge className="bg-success text-success-foreground">Concluída</Badge>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProgressoTarefa({ tarefa, tarefaId, doneCol, tCols, readOnly }: { tarefa: Row; tarefaId: string; doneCol: string; tCols: string[] | undefined; readOnly: boolean }) {
  const T = "projetos_tarefas_checklists";
  const qc = useQueryClient();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const tC = resolveCol(cols, all, C.check.tarefa);
  const okC = resolveCol(cols, all, C.check.concluido);
  const items = all.filter((r) => String(r[tC]) === tarefaId);
  const temChecklist = items.length > 0;
  const auto = temChecklist ? Math.round((items.filter((i) => isDone(i[okC])).length / items.length) * 100) : null;
  const [pct, setPct] = useState(() => tarefaPct(tarefa, doneCol));
  const salvo = useRef(pct);
  useEffect(() => { const v = tarefaPct(tarefa, doneCol); setPct(v); salvo.current = v; }, [tarefa, doneCol]);

  async function gravar(novo: number) {
    const anterior = salvo.current;
    if (novo === anterior) return;
    setPct(novo); salvo.current = novo;
    const payload = progressoPayload(novo, anterior);
    if (doneCol !== "situacao" && (novo >= 100 || anterior >= 100)) payload[doneCol] = doneValue(doneCol, novo >= 100);
    const { error } = await supabase.from("projetos_tarefas").update(filterPayload(payload, tCols?.length ? [...tCols, "progresso"] : tCols)).eq(idColumn(tarefa), rowId(tarefa) as never);
    if (error) { toast.error(error.message); salvo.current = anterior; setPct(anterior); return; }
    qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
  }
  // Com checklist: progresso automático, gravado sempre que a proporção muda.
  useEffect(() => { if (auto !== null && !readOnly) void gravar(auto); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auto]);

  const mostrado = auto ?? pct;
  const travado = readOnly || temChecklist;
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Progresso</h3>
        <span className="text-sm font-semibold" style={{ color: progressoCor(mostrado) }}>{mostrado}%</span>
      </div>
      <Progress value={mostrado} indicatorColor={progressoCor(mostrado)} className="h-2.5 bg-muted" />
      <div className="flex flex-wrap gap-2">
        {[0, 25, 50, 75, 100].map((v) => (
          <Button key={v} size="sm" variant={mostrado === v ? "default" : "outline"} disabled={travado} onClick={() => gravar(v)}>{v}%</Button>
        ))}
      </div>
      {temChecklist && <p className="text-xs text-muted-foreground">Calculado automaticamente pelo checklist.</p>}
    </section>
  );
}

function Checklist({ tarefaId, readOnly }: { tarefaId: string; readOnly: boolean }) {
  const T = "projetos_tarefas_checklists";
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const tC = resolveCol(cols, all, C.check.tarefa);
  const dC = resolveCol(cols, all, C.check.descricao);
  const okC = resolveCol(cols, all, C.check.concluido);
  const items = all.filter((r) => String(r[tC]) === tarefaId).sort((a, b) => String(rowId(a)).localeCompare(String(rowId(b)), undefined, { numeric: true }));
  const [txt, setTxt] = useState("");
  const done = items.filter((i) => isDone(i[okC])).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", T] });

  async function add() {
    if (!txt.trim()) return;
    const { error } = await supabase.from(T).insert(filterPayload(stamp({ [tC]: tarefaId, [dC]: txt.trim(), [okC]: doneValue(okC, false) }, true), cols));
    if (error) { toast.error(error.message); return; }
    setTxt(""); refresh();
  }
  async function toggle(r: Row, v: boolean) {
    const { error } = await supabase.from(T).update({ [okC]: doneValue(okC, v) }).eq(idColumn(r), rowId(r) as never);
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
      {items.length > 0 && <Progress value={(done / items.length) * 100} className="h-1.5" />}
      <ul className="space-y-1">
        {items.map((r) => (
          <li key={String(rowId(r))} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
            <Checkbox disabled={readOnly} checked={isDone(r[okC])} onCheckedChange={(v) => toggle(r, v === true)} />
            <span className={`flex-1 text-sm ${isDone(r[okC]) ? "text-muted-foreground line-through" : ""}`}>{String(r[dC] ?? "")}</span>
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

function Dependencias({ tarefaId, tarefas, nomeCol, readOnly }: { tarefaId: string; tarefas: Row[]; nomeCol: string; readOnly: boolean }) {
  const T = "projetos_tarefas_dependencias";
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const tC = resolveCol(cols, all, C.dep.tarefa);
  const dC = resolveCol(cols, all, C.dep.depende);
  const mine = all.filter((r) => String(r[tC]) === tarefaId);
  const selected = new Set(mine.map((r) => String(r[dC])));
  const nome = (id: string) => String(tarefas.find((t) => String(rowId(t)) === id)?.[nomeCol] ?? "Tarefa");

  async function toggle(id: string) {
    const existing = mine.find((r) => String(r[dC]) === id);
    const { error } = existing
      ? await supabase.from(T).delete().eq(idColumn(existing), rowId(existing) as never)
      : await supabase.from(T).insert(filterPayload(stamp({ [tC]: tarefaId, [dC]: id }, true), cols));
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", T] });
  }
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-foreground">Dependências</h3>
      <p className="text-xs text-muted-foreground">Tarefas deste projeto que precisam terminar antes desta.</p>
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
            <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />Selecionar tarefas</Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-72 overflow-y-auto p-2">
            {tarefas.length === 0 && <p className="p-2 text-sm text-muted-foreground">Não há outras tarefas no projeto.</p>}
            {tarefas.map((t) => {
              const id = String(rowId(t));
              return (
                <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} />
                  {String(t[nomeCol] ?? "")}
                </label>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </section>
  );
}

function Anexos({ tarefaId, projetoId, readOnly }: { tarefaId: string; projetoId: string; readOnly: boolean }) {
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
  const mine = all.filter((r) => String(r[c.t]) === tarefaId);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    for (const f of Array.from(files)) {
      const safe = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
      const path = `${projetoId}/${tarefaId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, f.type ? { contentType: f.type } : {});
      if (up.error) { toast.error(`${f.name}: ${up.error.message}`); continue; }
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from(T).insert(filterPayload(stamp({ [c.t]: tarefaId, [c.nome]: f.name, [c.url]: url, [c.path]: path, [c.tam]: f.size, [c.tipo]: f.type }, true), cols));
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
