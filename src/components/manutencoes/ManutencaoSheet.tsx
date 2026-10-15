import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileText, Loader2, Paperclip, Play, CheckCircle2, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { UploadInfo } from "@/components/ui/upload-info";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import {
  PRIORIDADES, STATUS, TIPOS, checklistDoModelo, prazoSla, proximoNumeroOs, resumoChecklist, uploadAnexo,
  type Anexo, type ItemChecklist,
} from "@/lib/manutencoes";

export type OsInicial = Partial<{
  tipo: string; prioridade: string; parceiro_id: string; pessoa_id: string; atendimento_id: string; descricao: string;
}>;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: Row | null;
  inicial?: OsInicial | undefined;
  onSaved?: ((os: Row) => void) | undefined;
};

const toLocal = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function ManutencaoSheet({ open, onOpenChange, record, inicial, onSaved }: Props) {
  const qc = useQueryClient();
  const { empresaId, usuarioId } = useAudit();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: modelos = [] } = useTableRows("manutencao_modelos");
  const [f, setF] = useState({
    tipo: "corretiva", prioridade: "normal", status: "agendada", parceiro_id: "", tecnico_usuario_id: "", modelo_id: "",
    equipamento: "", local: "", descricao: "", data_prevista: "", observacoes: "",
  });
  const [checklist, setChecklist] = useState<ItemChecklist[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [datas, setDatas] = useState<{ iniciado_em: string | null; concluido_em: string | null }>({ iniciado_em: null, concluido_em: null });
  const [subindo, setSubindo] = useState(false);
  const grupoRef = useRef<Anexo["grupo"]>("antes");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const r = record ?? {};
    setF({
      tipo: text(r["tipo"]) || inicial?.tipo || "corretiva",
      prioridade: text(r["prioridade"]) || inicial?.prioridade || "normal",
      status: text(r["status"]) || "agendada",
      parceiro_id: text(r["parceiro_id"]) || inicial?.parceiro_id || "",
      tecnico_usuario_id: text(r["tecnico_usuario_id"]),
      modelo_id: text(r["modelo_id"]),
      equipamento: text(r["equipamento"]),
      local: text(r["local"]),
      descricao: text(r["descricao"]) || inicial?.descricao || "",
      data_prevista: toLocal(r["data_prevista"]),
      observacoes: text(r["observacoes"]),
    });
    setChecklist(Array.isArray(r["checklist"]) ? (r["checklist"] as ItemChecklist[]) : []);
    setAnexos(Array.isArray(r["anexos"]) ? (r["anexos"] as Anexo[]) : []);
    setDatas({ iniciado_em: (r["iniciado_em"] as string) ?? null, concluido_em: (r["concluido_em"] as string) ?? null });
  }, [open, record, inicial]);

  const clientes = useMemo(() => {
    const c = parceiros.filter((p) => p["is_cliente"] === true);
    return (c.length ? c : parceiros).map((p) => ({
      value: text(rowId(p)),
      label: text(pick(p, ["nome_fantasia", "razao_social"])) || "—",
      keywords: [text(p["razao_social"]), text(p["cnpj_cpf"] ?? p["documento"])],
    }));
  }, [parceiros]);
  const resumo = resumoChecklist(checklist);

  function aplicarModelo(id: string) {
    setF((s) => ({ ...s, modelo_id: id }));
    const m = modelos.find((x) => text(rowId(x)) === id);
    if (m && (!checklist.length || confirm("Substituir o checklist atual pelo do modelo?"))) setChecklist(checklistDoModelo(m["itens"]));
  }
  const setItem = (i: number, p: Partial<ItemChecklist>) => setChecklist((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function enviarArquivos(files: FileList | null) {
    if (!files?.length) return;
    setSubindo(true);
    try {
      const novos: Anexo[] = [];
      for (const file of Array.from(files)) novos.push({ url: await uploadAnexo(file), nome: file.name, grupo: grupoRef.current });
      setAnexos((a) => [...a, ...novos]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar arquivo.");
    } finally {
      setSubindo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const escolher = (g: Anexo["grupo"]) => { grupoRef.current = g; fileRef.current?.click(); };

  const save = useMutation({
    mutationFn: async (extra: Row = {}) => {
      if (!f.parceiro_id) throw new Error("Selecione o cliente.");
      const payload: Row = {
        tipo: f.tipo, prioridade: f.prioridade, status: f.status,
        parceiro_id: f.parceiro_id || null, tecnico_usuario_id: f.tecnico_usuario_id || null, modelo_id: f.modelo_id || null,
        equipamento: f.equipamento.trim() || null, local: f.local.trim() || null, descricao: f.descricao.trim() || null,
        data_prevista: f.data_prevista ? new Date(f.data_prevista).toISOString() : null,
        observacoes: f.observacoes.trim() || null, checklist, anexos, ...datas, ...extra,
      };
      if (record) {
        const { data, error } = await supabase.from("manutencao_os").update(payload).eq("id", text(rowId(record))).select("*").single();
        if (error) throw error;
        return data as Row;
      }
      const numero = await proximoNumeroOs(empresaId);
      const { data, error } = await supabase.from("manutencao_os").insert({
        ...payload, numero, empresa_id: empresaId,
        pessoa_id: inicial?.pessoa_id || null, atendimento_id: inicial?.atendimento_id || null,
        prazo_sla: prazoSla(new Date(), f.prioridade).toISOString(),
      }).select("*").single();
      if (error) throw error;
      return data as Row;
    },
    onSuccess: (os) => {
      qc.invalidateQueries({ queryKey: ["table", "manutencao_os"] });
      toast.success(`Ordem ${text(os["numero"])} salva.`);
      onSaved?.(os);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar a ordem."),
  });

  const iniciar = () => { const agora = new Date().toISOString(); setDatas((d) => ({ ...d, iniciado_em: agora })); setF((s) => ({ ...s, status: "em_execucao" })); };
  const concluir = () => {
    if (resumo.respondidos < resumo.total && !confirm("Há itens do checklist sem resposta. Concluir assim mesmo?")) return;
    save.mutate({ status: "concluida", concluido_em: new Date().toISOString(), iniciado_em: datas.iniciado_em ?? new Date().toISOString() });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-4xl">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{record ? `Ordem ${text(record["numero"])}` : "Nova ordem de manutenção"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Prioridade</Label>
              <Select value={f.prioridade} onValueChange={(v) => setF({ ...f, prioridade: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label} · SLA {t.horas}h</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Situação</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Cliente *</Label>
              <SearchSelect value={f.parceiro_id} onChange={(v) => setF({ ...f, parceiro_id: v })} options={clientes} placeholder="Selecione o cliente" /></div>
            <div className="space-y-1.5"><Label>Data/hora prevista</Label>
              <Input type="datetime-local" value={f.data_prevista} onChange={(e) => setF({ ...f, data_prevista: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Técnico responsável</Label>
              <Select value={f.tecnico_usuario_id || "_"} onValueChange={(v) => setF({ ...f, tecnico_usuario_id: v === "_" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_">Não definido</SelectItem>
                  {usuarios.map((u) => <SelectItem key={text(rowId(u))} value={text(rowId(u))}>{text(pick(u, ["nome", "nome_completo", "email"]))}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Equipamento</Label>
              <Input value={f.equipamento} onChange={(e) => setF({ ...f, equipamento: e.target.value })} placeholder="Ex.: Motor portão principal" /></div>
            <div className="space-y-1.5"><Label>Local</Label>
              <Input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} placeholder="Ex.: Garagem subsolo 1" /></div>
            <div className="space-y-1.5 sm:col-span-3"><Label>Defeito relatado / descrição do serviço</Label>
              <Textarea rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
          </div>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Checklist</h3>
              <div className="w-64">
                <Select value={f.modelo_id || "_"} onValueChange={(v) => v !== "_" && aplicarModelo(v)}><SelectTrigger><SelectValue placeholder="Aplicar modelo" /></SelectTrigger>
                  <SelectContent><SelectItem value="_">Aplicar modelo…</SelectItem>
                    {modelos.map((m) => <SelectItem key={text(rowId(m))} value={text(rowId(m))}>{text(m["nome"])}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            {checklist.length > 0 && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Progress value={resumo.pct} className="h-2 flex-1" />
                <span>{resumo.respondidos}/{resumo.total}</span>
                {resumo.naoConformes > 0 && <span className="font-medium text-destructive">{resumo.naoConformes} não conforme(s)</span>}
              </div>
            )}
            {checklist.map((it, i) => (
              <div key={i} className="space-y-2 rounded-md bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{i + 1}. {it.texto}</span>
                  {it.tipo === "numero" ? (
                    <div className="flex items-center gap-1">
                      <Input className="h-8 w-28" inputMode="decimal" value={it.valor ?? ""} onChange={(e) => setItem(i, { valor: e.target.value })} />
                      <span className="text-xs text-muted-foreground">{it.unidade}</span>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      {(["C", "NC", "NA"] as const).map((r) => (
                        <Button key={r} type="button" size="sm" variant={it.resposta === r ? "default" : "outline"}
                          className={cn(it.resposta === r && r === "NC" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                          onClick={() => setItem(i, { resposta: it.resposta === r ? null : r })}>{r}</Button>
                      ))}
                    </div>
                  )}
                </div>
                {(it.resposta === "NC" || it.obs) && (
                  <Input placeholder="Observação" value={it.obs ?? ""} onChange={(e) => setItem(i, { obs: e.target.value })} />
                )}
              </div>
            ))}
            {!checklist.length && <p className="text-sm text-muted-foreground">Aplique um modelo para carregar o roteiro de verificação.</p>}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1 font-semibold">Fotos e documentos <UploadInfo perfil="laudo" /></h3>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={subindo} onClick={() => escolher("antes")}><Camera className="mr-1 h-4 w-4" /> Antes</Button>
                <Button type="button" size="sm" variant="outline" disabled={subindo} onClick={() => escolher("depois")}><Camera className="mr-1 h-4 w-4" /> Depois</Button>
                <Button type="button" size="sm" variant="outline" disabled={subindo} onClick={() => escolher("documento")}><Paperclip className="mr-1 h-4 w-4" /> Documento</Button>
                {subindo && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => void enviarArquivos(e.target.files)} />
            </div>
            {(["antes", "depois", "documento"] as const).map((g) => {
              const lista = anexos.filter((a) => a.grupo === g);
              if (!lista.length) return null;
              return (
                <div key={g} className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{g === "documento" ? "Documentos" : g}</p>
                  <div className="flex flex-wrap gap-2">
                    {lista.map((a) => (
                      <div key={a.url} className="relative">
                        {/\.(jpe?g|png|webp|gif)(\?|$)/i.test(a.url) ? (
                          <img src={a.url} alt={a.nome} data-zoom className="h-20 w-20 rounded-md object-cover" />
                        ) : (
                          <a href={a.url} target="_blank" rel="noreferrer" className="flex h-20 w-32 items-center gap-1 rounded-md border p-2 text-xs">
                            <FileText className="h-4 w-4 shrink-0" /><span className="line-clamp-3">{a.nome}</span>
                          </a>
                        )}
                        <button type="button" aria-label="Remover" onClick={() => setAnexos((l) => l.filter((x) => x.url !== a.url))}
                          className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          <div className="space-y-1.5"><Label>Observações do técnico</Label>
            <Textarea rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          {record && !datas.iniciado_em && <Button variant="outline" onClick={iniciar}><Play className="mr-1 h-4 w-4" /> Iniciar</Button>}
          {record && f.status !== "concluida" && (
            <Button variant="outline" onClick={concluir} disabled={save.isPending}><CheckCircle2 className="mr-1 h-4 w-4" /> Concluir</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate({})} disabled={save.isPending || subindo}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { usuarioIdUnused };
const usuarioIdUnused = undefined;
