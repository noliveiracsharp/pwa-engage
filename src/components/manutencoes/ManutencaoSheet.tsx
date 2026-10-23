import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, FileText, Loader2, Paperclip, Play, CheckCircle2, X, Eye, Link2, Printer, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnviarPropostaDialog } from "@/components/orcamentos/EnviarPropostaDialog";
import { OsDocumento } from "./OsDocumento";
import { imprimirElemento } from "@/lib/propostas";
import { useAuth } from "@/hooks/useAuth";
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
  PRIORIDADES, STATUS, TIPOS, checklistDoModelo, enviarWhatsappEmpresa, linkOs, mensagemOs, prazoSla, proximoNumeroOs, resumoChecklist, uploadAnexo,
  type Anexo, type ItemChecklist,
} from "@/lib/manutencoes";
import { confirmar } from "@/components/layout/DialogoGlobal";

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
  const { empresaId } = useAudit();
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: modelos = [] } = useTableRows("manutencao_modelos");
  const { data: ativosEq = [] } = useTableRows("manutencao_ativos");
  const { empresa } = useAuth();
  const [avisar, setAvisar] = useState(true);
  const [preview, setPreview] = useState(false);
  const [envio, setEnvio] = useState(false);
  const [f, setF] = useState({
    tipo: "corretiva", prioridade: "normal", status: "agendada", parceiro_id: "", tecnico_usuario_id: "", modelo_id: "", ativo_id: "",
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
      ativo_id: text(r["ativo_id"]),
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

  async function aplicarModelo(id: string) {
    setF((s) => ({ ...s, modelo_id: id }));
    const m = modelos.find((x) => text(rowId(x)) === id);
    if (m && (!checklist.length || await confirmar("Substituir o checklist atual pelo do modelo?"))) setChecklist(checklistDoModelo(m["itens"]));
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
        parceiro_id: f.parceiro_id || null, tecnico_usuario_id: f.tecnico_usuario_id || null, modelo_id: f.modelo_id || null, ...(f.ativo_id ? { ativo_id: f.ativo_id } : record?.["ativo_id"] ? { ativo_id: null } : {}),
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
      const evento = !record && os["data_prevista"] ? "agendada" : os["status"] === "concluida" && record?.["status"] !== "concluida" ? "concluida" : null;
      if (avisar && evento) void avisarCliente(os, evento);
      onSaved?.(os);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar a ordem."),
  });

  const nomeCliente = (id: unknown) => text(pick(parceiros.find((p) => text(rowId(p)) === text(id)) ?? {}, ["nome_fantasia", "razao_social"]));
  const foneCliente = (id: unknown) => text(pick(parceiros.find((p) => text(rowId(p)) === text(id)) ?? {}, ["whatsapp", "celular", "telefone", "telefone2"]));
  const nomeTecnico = (id: unknown) => text(pick(usuarios.find((u) => text(rowId(u)) === text(id)) ?? {}, ["nome", "nome_completo"]));
  const empresaNome = text(pick(empresa ?? {}, ["titulo", "nome"]));
  const textoPara = (os: Row, evento: "agendada" | "concluida") => {
    const r = resumoChecklist(Array.isArray(os["checklist"]) ? (os["checklist"] as ItemChecklist[]) : []);
    return mensagemOs(evento, {
      cliente: nomeCliente(os["parceiro_id"]), empresa: empresaNome, numero: text(os["numero"]), tipo: text(os["tipo"]),
      data: os["data_prevista"], tecnico: nomeTecnico(os["tecnico_usuario_id"]), link: linkOs(os["token"]), itens: r.total, naoConformes: r.naoConformes,
    });
  };
  async function avisarCliente(os: Row, evento: "agendada" | "concluida") {
    if (!os["token"]) { toast.warning("Aviso ao cliente não enviado: rode o script da Fase 2 de Manutenções."); return; }
    try {
      const motivo = await enviarWhatsappEmpresa(os["empresa_id"] ?? empresaId, foneCliente(os["parceiro_id"]), textoPara(os, evento));
      if (motivo) toast.warning(`Cliente não avisado: ${motivo}`);
      else toast.success(evento === "agendada" ? "Cliente avisado do agendamento pelo WhatsApp." : "Relatório enviado ao cliente pelo WhatsApp.");
    } catch (e) {
      toast.warning(`Cliente não avisado: ${e instanceof Error ? e.message : "falha no envio"}`);
    }
  }
  const atual: Row = { ...(record ?? {}), ...f, checklist, anexos, ...datas };

  const iniciar = () => { const agora = new Date().toISOString(); setDatas((d) => ({ ...d, iniciado_em: agora })); setF((s) => ({ ...s, status: "em_execucao" })); };
  const concluir = async () => {
    if (resumo.respondidos < resumo.total && !await confirmar("Há itens do checklist sem resposta. Concluir assim mesmo?")) return;
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
            <div className="space-y-1.5 sm:col-span-3"><Label>Equipamento cadastrado</Label>
              <SearchSelect value={f.ativo_id} placeholder="Escolha um equipamento do cliente (opcional)"
                options={ativosEq.filter((a) => !f.parceiro_id || text(a["parceiro_id"]) === f.parceiro_id).map((a) => ({ value: text(rowId(a)), label: `${text(a["nome"])}${a["local"] ? ` · ${text(a["local"])}` : ""}`, keywords: [text(a["numero_serie"])] }))}
                onChange={(v) => { const a = ativosEq.find((x) => text(rowId(x)) === v); setF((s) => ({ ...s, ativo_id: v, ...(a ? { equipamento: text(a["nome"]), local: text(a["local"]) || s.local, parceiro_id: s.parceiro_id || text(a["parceiro_id"]) } : {}) })); }} /></div>
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
              <div key={i} className="space-y-2">
              {it.equipamento && it.equipamento !== checklist[i - 1]?.equipamento && (
                <div className="mt-2 border-b pb-1 text-sm font-semibold text-primary">{it.equipamento}</div>
              )}
              <div className="space-y-2 rounded-md bg-muted/40 p-3">
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
              <h3 className="flex items-center gap-1 font-semibold">Fotos e documentos <UploadInfo perfil="laudo" arquivos /></h3>
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Switch checked={avisar} onCheckedChange={setAvisar} /> Avisar cliente pelo WhatsApp
          </label>
          {record && !!record["token"] && (
            <>
              <Button variant="outline" onClick={() => setPreview(true)}><Eye className="mr-1 h-4 w-4" /> Relatório</Button>
              <Button variant="outline" onClick={() => setEnvio(true)}><Send className="mr-1 h-4 w-4" /> Enviar</Button>
            </>
          )}
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
      {record && (
        <>
          <Dialog open={preview} onOpenChange={setPreview}>
            <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
              <DialogHeader className="sticky top-0 z-20 flex-row items-center justify-between gap-2 space-y-0 border-b bg-background px-6 py-4">
                <DialogTitle>Relatório {text(record["numero"])}</DialogTitle>
                <div className="flex gap-2 pr-8">
                  <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(linkOs(record["token"])); toast.success("Link copiado."); }}><Link2 className="mr-1 h-4 w-4" /> Copiar link</Button>
                  <Button size="sm" onClick={() => imprimirElemento("os-interna")}><Printer className="mr-1 h-4 w-4" /> PDF</Button>
                </div>
              </DialogHeader>
              <OsDocumento id="os-interna" os={atual} empresa={{ nome: empresaNome, razao_social: pick(empresa ?? {}, ["nome"]), logo: pick(empresa ?? {}, ["logo"]), cnpj: pick(empresa ?? {}, ["cnpj_cpf"]) }}
                cliente={nomeCliente(f.parceiro_id)} tecnico={nomeTecnico(f.tecnico_usuario_id)} />
            </DialogContent>
          </Dialog>
          <EnviarPropostaDialog
            open={envio} onOpenChange={setEnvio} orcamento={record} empresa={empresa}
            cliente={parceiros.find((p) => text(rowId(p)) === f.parceiro_id)} link={linkOs(record["token"])}
            antesDeEnviar={async () => true} titulo="Enviar ordem ao cliente"
            mensagemInicial={textoPara(atual, f.status === "concluida" ? "concluida" : "agendada")}
          />
        </>
      )}
    </Sheet>
  );
}

