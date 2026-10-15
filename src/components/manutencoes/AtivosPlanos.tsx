import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import { CalendarClock, Printer, QrCode, RefreshCw } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput } from "@/components/data-table/FilterField";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { rowId, text, useDeleteRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { imprimirElemento } from "@/lib/propostas";
import { pick, type Row } from "@/lib/row";
import {
  FREQUENCIAS, checklistDoModelo, linkAtivo, prazoSla, preventivasAGerar, proximoNumeroOs, type PlanoPreventiva,
} from "@/lib/manutencoes";

const fmtData = (v: unknown) => (v ? new Date(`${text(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const useClientes = () => {
  const { data: parceiros = [] } = useTableRows("parceiros");
  return useMemo(() => {
    const c = parceiros.filter((p) => p["is_cliente"] === true);
    const lista = (c.length ? c : parceiros).map((p) => ({ value: text(rowId(p)), label: text(pick(p, ["nome_fantasia", "razao_social"])) || "—" }));
    return { lista, nome: new Map(lista.map((o) => [o.value, o.label])) };
  }, [parceiros]);
};
const Campo = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className ?? ""}`}><Label>{label}</Label>{children}</div>
);

/* ------------------------------- Equipamentos ------------------------------- */

const VAZIO_ATIVO = { parceiro_id: "", nome: "", categoria: "", marca: "", modelo: "", numero_serie: "", local: "", instalado_em: "", garantia_ate: "", observacoes: "", ativo: true };

export function Ativos({ podeEditar, podeExcluir }: { podeEditar: boolean; podeExcluir: boolean }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { data: ativos = [], isLoading } = useTableRows("manutencao_ativos");
  const remove = useDeleteRecord("manutencao_ativos");
  const clientes = useClientes();
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<Row | null | undefined>(undefined);
  const [f, setF] = useState(VAZIO_ATIVO);
  const [etiquetas, setEtiquetas] = useState<Row[] | null>(null);

  const abrir = (r: Row | null) => {
    setEdit(r);
    setF(r ? Object.fromEntries(Object.keys(VAZIO_ATIVO).map((k) => [k, k === "ativo" ? r[k] !== false : text(r[k]).slice(0, k.endsWith("_em") || k.endsWith("_ate") ? 10 : undefined)])) as typeof VAZIO_ATIVO : VAZIO_ATIVO);
  };
  const rows = useMemo(() => ativos.filter((r) => matchesAny([r["nome"], r["marca"], r["modelo"], r["numero_serie"], r["local"], clientes.nome.get(text(r["parceiro_id"]))], busca)), [ativos, busca, clientes]);

  const save = useMutation({
    mutationFn: async () => {
      if (!f.nome.trim()) throw new Error("Informe o nome do equipamento.");
      if (!f.parceiro_id) throw new Error("Selecione o cliente.");
      const payload = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]));
      const { error } = edit
        ? await supabase.from("manutencao_ativos" as never).update(payload as never).eq("id", text(rowId(edit)))
        : await supabase.from("manutencao_ativos" as never).insert({ ...payload, empresa_id: empresaId } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["table", "manutencao_ativos"] }); toast.success("Equipamento salvo."); setEdit(undefined); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  const columns: Column[] = [
    { key: "nome", header: "Equipamento", fields: ["nome"], render: (r) => <span className="font-medium">{text(r["nome"])}</span> },
    { key: "cliente", header: "Cliente", fields: ["parceiro_id"], render: (r) => <div className="max-w-56 truncate">{clientes.nome.get(text(r["parceiro_id"])) || "—"}</div> },
    { key: "local", header: "Local", fields: ["local"], render: (r) => text(r["local"]) || "—" },
    { key: "marca", header: "Marca / modelo", fields: ["marca"], render: (r) => [text(r["marca"]), text(r["modelo"])].filter(Boolean).join(" · ") || "—" },
    { key: "serie", header: "Nº série", fields: ["numero_serie"], render: (r) => text(r["numero_serie"]) || "—" },
    { key: "qr", header: "QR Code", fields: ["token"], render: (r) => (
      <Button size="icon" variant="ghost" aria-label="Etiqueta QR Code" disabled={!r["token"]} onClick={(e) => { e.stopPropagation(); setEtiquetas([r]); }}><QrCode className="h-4 w-4" /></Button>
    ) },
  ];

  return (
    <div className="space-y-3">
      <DataTable title="Equipamentos dos clientes" columns={columns} rows={rows} loading={isLoading}
        getValue={(r, fl) => r[fl[0]!]} rowKey={(r) => text(rowId(r))}
        onAdd={podeEditar ? () => abrir(null) : undefined} onEdit={podeEditar ? abrir : undefined}
        onDelete={podeExcluir ? (r) => remove.mutate(r) : undefined}
        filters={<>
          <FilterInput label="Busca" value={busca} onChange={setBusca} placeholder="Equipamento, cliente, série…" />
          <div className="flex items-end"><Button variant="outline" size="sm" disabled={!rows.length} onClick={() => setEtiquetas(rows)}><Printer className="mr-1 h-4 w-4" /> Etiquetas da lista</Button></div>
        </>}
      />
      <Sheet open={edit !== undefined} onOpenChange={(o) => !o && setEdit(undefined)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-4"><SheetTitle>{edit ? "Editar equipamento" : "Novo equipamento"}</SheetTitle></SheetHeader>
          <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-2">
            <Campo label="Cliente *" className="sm:col-span-2"><SearchSelect value={f.parceiro_id} onChange={(v) => setF({ ...f, parceiro_id: v })} options={clientes.lista} placeholder="Selecione o cliente" /></Campo>
            <Campo label="Nome do equipamento *"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Motor portão garagem" /></Campo>
            <Campo label="Categoria"><Input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Ex.: Portões, CFTV" /></Campo>
            <Campo label="Marca"><Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} /></Campo>
            <Campo label="Modelo"><Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></Campo>
            <Campo label="Número de série"><Input value={f.numero_serie} onChange={(e) => setF({ ...f, numero_serie: e.target.value })} /></Campo>
            <Campo label="Local no cliente"><Input value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} placeholder="Ex.: Bloco A — subsolo" /></Campo>
            <Campo label="Instalado em"><Input type="date" value={f.instalado_em} onChange={(e) => setF({ ...f, instalado_em: e.target.value })} /></Campo>
            <Campo label="Garantia até"><Input type="date" value={f.garantia_ate} onChange={(e) => setF({ ...f, garantia_ate: e.target.value })} /></Campo>
            <Campo label="Observações" className="sm:col-span-2"><Textarea rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 text-sm"><Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} /> Equipamento ativo</label>
          </div>
          <div className="flex justify-end gap-2 border-t p-4">
            <Button variant="outline" onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </div>
        </SheetContent>
      </Sheet>
      <EtiquetasDialog ativos={etiquetas} clientes={clientes.nome} onClose={() => setEtiquetas(null)} />
    </div>
  );
}

function EtiquetasDialog({ ativos, clientes, onClose }: { ativos: Row[] | null; clientes: Map<string, string>; onClose: () => void }) {
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ativos) return;
    let vivo = true;
    void Promise.all(ativos.filter((a) => a["token"]).map(async (a) => [text(rowId(a)), await QRCode.toDataURL(linkAtivo(a["token"]), { margin: 1, width: 240 })] as const))
      .then((l) => vivo && setQrs(Object.fromEntries(l)));
    return () => { vivo = false; };
  }, [ativos]);
  return (
    <Dialog open={!!ativos} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Etiquetas com QR Code</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Imprima e cole no equipamento. Ao apontar a câmera, o cliente vê a ficha, o histórico e pode abrir um chamado.</p>
        <div ref={ref} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(ativos ?? []).map((a) => (
            <div key={text(rowId(a))} className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center" style={{ breakInside: "avoid" }}>
              {qrs[text(rowId(a))] ? <img data-no-zoom src={qrs[text(rowId(a))]} alt="QR Code do equipamento" className="h-32 w-32" /> : <div className="h-32 w-32 animate-pulse rounded bg-muted" />}
              <div className="text-sm font-semibold leading-tight">{text(a["nome"])}</div>
              <div className="text-xs text-muted-foreground">{[clientes.get(text(a["parceiro_id"])), text(a["local"])].filter(Boolean).join(" · ")}</div>
              {a["numero_serie"] ? <div className="text-[10px] text-muted-foreground">S/N {text(a["numero_serie"])}</div> : null}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => ref.current && imprimirElemento(ref.current, "Etiquetas QR Code")}><Printer className="mr-1 h-4 w-4" /> Imprimir</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Preventivas recorrentes -------------------------- */

const VAZIO_PLANO = { nome: "", parceiro_id: "", ativo_id: "", modelo_id: "", tecnico_usuario_id: "", frequencia_meses: "1", proxima_data: "", hora: "09:00", antecedencia_dias: "7", ativo: true };

/** Cria as OS preventivas que já chegaram na antecedência e avança cada plano. */
export async function gerarPreventivas(empresaId: unknown): Promise<number> {
  const { data: planos, error } = await supabase.from("manutencao_planos" as never).select("*").eq("ativo", true);
  if (error) throw error;
  const lista = (planos ?? []) as Row[];
  const pendentes = preventivasAGerar(lista.map((p) => ({
    id: text(p["id"]), ativo: p["ativo"] !== false, proxima_data: text(p["proxima_data"]),
    frequencia_meses: Number(p["frequencia_meses"]), antecedencia_dias: Number(p["antecedencia_dias"]),
  }) satisfies PlanoPreventiva), new Date().toLocaleDateString("sv-SE"));
  if (!pendentes.length) return 0;
  const [{ data: modelos }, { data: ativos }] = await Promise.all([
    supabase.from("manutencao_modelos").select("id,itens"),
    supabase.from("manutencao_ativos" as never).select("id,nome,local"),
  ]);
  let criadas = 0;
  for (const pend of pendentes) {
    const p = lista.find((x) => text(x["id"]) === pend.id)!;
    const modelo = ((modelos ?? []) as Row[]).find((m) => text(m["id"]) === text(p["modelo_id"]));
    const ativo = ((ativos ?? []) as Row[]).find((a) => text(a["id"]) === text(p["ativo_id"]));
    for (const dia of pend.datas) {
      const quando = new Date(`${dia}T${text(p["hora"]) || "09:00"}:00`);
      const { error: e } = await supabase.from("manutencao_os").insert({
        empresa_id: p["empresa_id"] ?? empresaId, numero: await proximoNumeroOs(text(p["empresa_id"] ?? empresaId)),
        tipo: "preventiva", prioridade: "normal", status: "agendada", plano_id: pend.id,
        parceiro_id: p["parceiro_id"] || null, ativo_id: p["ativo_id"] || null, modelo_id: p["modelo_id"] || null,
        tecnico_usuario_id: p["tecnico_usuario_id"] || null,
        equipamento: ativo ? text(ativo["nome"]) : null, local: ativo ? text(ativo["local"]) || null : null,
        descricao: `Preventiva programada: ${text(p["nome"])}`,
        data_prevista: quando.toISOString(), prazo_sla: prazoSla(quando, "normal").toISOString(),
        checklist: modelo ? checklistDoModelo(modelo["itens"]) : [],
      } as never);
      if (!e) criadas++;
      else if (e.code !== "23505") throw e; // 23505 = já gerada para essa data
    }
    await supabase.from("manutencao_planos" as never).update({ proxima_data: pend.proxima } as never).eq("id", pend.id);
  }
  return criadas;
}

export function Planos({ podeEditar, podeExcluir }: { podeEditar: boolean; podeExcluir: boolean }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { data: planos = [], isLoading } = useTableRows("manutencao_planos");
  const { data: ativos = [] } = useTableRows("manutencao_ativos");
  const { data: modelos = [] } = useTableRows("manutencao_modelos");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const remove = useDeleteRecord("manutencao_planos");
  const clientes = useClientes();
  const [edit, setEdit] = useState<Row | null | undefined>(undefined);
  const [f, setF] = useState(VAZIO_PLANO);
  const nomeAtivo = useMemo(() => new Map(ativos.map((a) => [text(rowId(a)), text(a["nome"])])), [ativos]);
  const ativosDoCliente = ativos.filter((a) => !f.parceiro_id || text(a["parceiro_id"]) === f.parceiro_id).map((a) => ({ value: text(rowId(a)), label: `${text(a["nome"])}${a["local"] ? ` · ${text(a["local"])}` : ""}` }));

  const abrir = (r: Row | null) => {
    setEdit(r);
    setF(r ? Object.fromEntries(Object.keys(VAZIO_PLANO).map((k) => [k, k === "ativo" ? r[k] !== false : text(r[k])])) as typeof VAZIO_PLANO
      : { ...VAZIO_PLANO, proxima_data: new Date().toLocaleDateString("sv-SE") });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!f.nome.trim()) throw new Error("Informe o nome do plano.");
      if (!f.parceiro_id) throw new Error("Selecione o cliente.");
      if (!f.proxima_data) throw new Error("Informe a data da próxima preventiva.");
      const payload = {
        nome: f.nome.trim(), parceiro_id: f.parceiro_id, ativo_id: f.ativo_id || null, modelo_id: f.modelo_id || null,
        tecnico_usuario_id: f.tecnico_usuario_id || null, frequencia_meses: Number(f.frequencia_meses) || 1,
        proxima_data: f.proxima_data, hora: f.hora || "09:00", antecedencia_dias: Math.max(0, Number(f.antecedencia_dias) || 0), ativo: f.ativo,
      };
      const { error } = edit
        ? await supabase.from("manutencao_planos" as never).update(payload as never).eq("id", text(rowId(edit)))
        : await supabase.from("manutencao_planos" as never).insert({ ...payload, empresa_id: empresaId } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["table", "manutencao_planos"] }); toast.success("Plano salvo."); setEdit(undefined); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  const gerar = useMutation({
    mutationFn: () => gerarPreventivas(empresaId),
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["table", "manutencao_os"] }); qc.invalidateQueries({ queryKey: ["table", "manutencao_planos"] });
      toast.success(n ? `${n} ordem(ns) preventiva(s) criada(s).` : "Nenhuma preventiva para gerar agora.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao gerar."),
  });

  const columns: Column[] = [
    { key: "nome", header: "Plano", fields: ["nome"], render: (r) => <span className="font-medium">{text(r["nome"])}</span> },
    { key: "cliente", header: "Cliente", fields: ["parceiro_id"], render: (r) => <div className="max-w-56 truncate">{clientes.nome.get(text(r["parceiro_id"])) || "—"}</div> },
    { key: "ativo", header: "Equipamento", fields: ["ativo_id"], render: (r) => nomeAtivo.get(text(r["ativo_id"])) || "Geral" },
    { key: "freq", header: "Frequência", fields: ["frequencia_meses"], render: (r) => FREQUENCIAS.find((x) => x.value === text(r["frequencia_meses"]))?.label ?? `A cada ${text(r["frequencia_meses"])} meses` },
    { key: "prox", header: "Próxima", fields: ["proxima_data"], render: (r) => `${fmtData(r["proxima_data"])} ${text(r["hora"])}` },
    { key: "sit", header: "Situação", fields: ["ativo"], render: (r) => r["ativo"] === false ? <span className="text-muted-foreground">Pausado</span> : <span className="text-success">Ativo</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /> As ordens preventivas são criadas sozinhas quando falta o número de dias de antecedência do plano, sempre que alguém abre Manutenções.</span>
        {podeEditar && <Button size="sm" variant="outline" onClick={() => gerar.mutate()} disabled={gerar.isPending}><RefreshCw className="mr-1 h-4 w-4" /> Gerar agora</Button>}
      </div>
      <DataTable title="Planos de preventiva" columns={columns} rows={planos} loading={isLoading}
        getValue={(r, fl) => r[fl[0]!]} rowKey={(r) => text(rowId(r))}
        onAdd={podeEditar ? () => abrir(null) : undefined} onEdit={podeEditar ? abrir : undefined}
        onDelete={podeExcluir ? (r) => remove.mutate(r) : undefined} />
      <Sheet open={edit !== undefined} onOpenChange={(o) => !o && setEdit(undefined)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-4"><SheetTitle>{edit ? "Editar plano" : "Novo plano de preventiva"}</SheetTitle></SheetHeader>
          <div className="grid flex-1 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-2">
            <Campo label="Nome do plano *" className="sm:col-span-2"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Preventiva mensal CFTV" /></Campo>
            <Campo label="Cliente *" className="sm:col-span-2"><SearchSelect value={f.parceiro_id} onChange={(v) => setF({ ...f, parceiro_id: v, ativo_id: "" })} options={clientes.lista} placeholder="Selecione o cliente" /></Campo>
            <Campo label="Equipamento (opcional)"><SearchSelect value={f.ativo_id} onChange={(v) => setF({ ...f, ativo_id: v })} options={ativosDoCliente} placeholder="Todos / geral" /></Campo>
            <Campo label="Modelo de checklist">
              <Select value={f.modelo_id || "_"} onValueChange={(v) => setF({ ...f, modelo_id: v === "_" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_">Sem checklist</SelectItem>{modelos.map((m) => <SelectItem key={text(rowId(m))} value={text(rowId(m))}>{text(m["nome"])}</SelectItem>)}</SelectContent></Select>
            </Campo>
            <Campo label="Frequência">
              <Select value={f.frequencia_meses} onValueChange={(v) => setF({ ...f, frequencia_meses: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FREQUENCIAS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent></Select>
            </Campo>
            <Campo label="Técnico responsável">
              <Select value={f.tecnico_usuario_id || "_"} onValueChange={(v) => setF({ ...f, tecnico_usuario_id: v === "_" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="_">Não definido</SelectItem>{usuarios.map((u) => <SelectItem key={text(rowId(u))} value={text(rowId(u))}>{text(pick(u, ["nome", "nome_completo", "email"]))}</SelectItem>)}</SelectContent></Select>
            </Campo>
            <Campo label="Próxima preventiva *"><Input type="date" value={f.proxima_data} onChange={(e) => setF({ ...f, proxima_data: e.target.value })} /></Campo>
            <Campo label="Horário"><Input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></Campo>
            <Campo label="Criar a ordem quantos dias antes"><Input type="number" min={0} value={f.antecedencia_dias} onChange={(e) => setF({ ...f, antecedencia_dias: e.target.value })} /></Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} /> Plano ativo</label>
          </div>
          <div className="flex justify-end gap-2 border-t p-4">
            <Button variant="outline" onClick={() => setEdit(undefined)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
