import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2, Download } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { ManutencaoSheet } from "@/components/manutencoes/ManutencaoSheet";
import { Ativos, Planos, gerarPreventivas } from "@/components/manutencoes/AtivosPlanos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { rowId, text, useDeleteRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { MODELOS_PADRAO, PRIORIDADES, STATUS, TIPOS, meta, resumoChecklist, type ItemChecklist, type ItemModelo } from "@/lib/manutencoes";

export const Route = createFileRoute("/_authenticated/manutencoes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Manutenções — Atende.ai" },
      { name: "description", content: "Ordens de manutenção preventiva, corretiva e preditiva com checklist, fotos e calendário." },
      { property: "og:title", content: "Manutenções — Atende.ai" },
      { property: "og:description", content: "Ordens de manutenção com checklist, fotos e calendário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManutencoesPage,
});

const Pill = ({ m }: { m: { label: string; cls: string } }) => <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>;
const fmt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function ManutencoesPage() {
  const perms = usePagePermissions("/manutencoes");
  const { data: os = [], isLoading } = useTableRows("manutencao_os");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const remove = useDeleteRecord("manutencao_os");
  const [aberto, setAberto] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", tipo: "todos", status: "todos" });

  const nomeP = useMemo(() => new Map(parceiros.map((p) => [text(rowId(p)), text(pick(p, ["nome_fantasia", "razao_social"]))])), [parceiros]);
  const nomeU = useMemo(() => new Map(usuarios.map((u) => [text(rowId(u)), text(pick(u, ["nome", "nome_completo", "email"]))])), [usuarios]);
  const rows = useMemo(
    () => os
      .filter((r) => matchesAny([r["numero"], nomeP.get(text(r["parceiro_id"])), r["equipamento"], r["descricao"]], f.busca)
        && (f.tipo === "todos" || r["tipo"] === f.tipo) && (f.status === "todos" || r["status"] === f.status))
      .sort((a, b) => text(b["created_at"]).localeCompare(text(a["created_at"]))),
    [os, f, nomeP],
  );
  const abrir = (r: Row | null) => { setRecord(r); setAberto(true); };
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const gerou = useRef(false);
  useEffect(() => {
    if (gerou.current || !perms.canCreate || !empresaId) return;
    gerou.current = true;
    gerarPreventivas(empresaId).then((n) => {
      if (!n) return;
      qc.invalidateQueries({ queryKey: ["table", "manutencao_os"] }); qc.invalidateQueries({ queryKey: ["table", "manutencao_planos"] });
      toast.success(`${n} ordem(ns) preventiva(s) criada(s) pelos planos.`);
    }).catch(() => { /* tabelas da Fase 3 ainda não criadas */ });
  }, [perms.canCreate, empresaId, qc]);

  const columns: Column[] = [
    { key: "numero", header: "OS", fields: ["numero"], render: (r) => <span className="font-semibold tabular-nums">{text(r["numero"]) || "—"}</span> },
    { key: "tipo", header: "Tipo", fields: ["tipo"], render: (r) => <Pill m={meta(TIPOS, r["tipo"])} /> },
    { key: "cliente", header: "Cliente", fields: ["parceiro_id"], render: (r) => <div className="max-w-56 truncate">{nomeP.get(text(r["parceiro_id"])) || "—"}</div> },
    { key: "equip", header: "Equipamento", fields: ["equipamento"], render: (r) => <div className="max-w-48 truncate">{text(r["equipamento"]) || "—"}</div> },
    { key: "data", header: "Previsto", fields: ["data_prevista"], render: (r) => fmt(r["data_prevista"]) },
    { key: "prio", header: "Prioridade", fields: ["prioridade"], render: (r) => {
      const atrasada = r["prazo_sla"] && r["status"] !== "concluida" && new Date(text(r["prazo_sla"])) < new Date();
      return <span className={cn(!!atrasada && "font-semibold text-destructive")}>{meta(PRIORIDADES, r["prioridade"]).label}{atrasada ? " · SLA vencido" : ""}</span>;
    } },
    { key: "tec", header: "Técnico", fields: ["tecnico_usuario_id"], render: (r) => nomeU.get(text(r["tecnico_usuario_id"])) || "—" },
    { key: "check", header: "Checklist", fields: ["checklist"], render: (r) => {
      const s = resumoChecklist(Array.isArray(r["checklist"]) ? (r["checklist"] as ItemChecklist[]) : []);
      return s.total ? <span className="tabular-nums">{s.pct}%{s.naoConformes ? <span className="text-destructive"> · {s.naoConformes} NC</span> : null}</span> : "—";
    } },
    { key: "status", header: "Situação", fields: ["status"], render: (r) => <Pill m={meta(STATUS, r["status"])} /> },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Tabs defaultValue="ordens">
        <TabsList className="h-auto flex-wrap"><TabsTrigger value="ordens">Ordens de serviço</TabsTrigger><TabsTrigger value="calendario">Calendário</TabsTrigger><TabsTrigger value="equipamentos">Equipamentos</TabsTrigger><TabsTrigger value="planos">Preventivas</TabsTrigger><TabsTrigger value="modelos">Modelos de checklist</TabsTrigger></TabsList>
        <TabsContent value="ordens">
          <DataTable
            title="Ordens de manutenção" columns={columns} rows={rows} loading={isLoading}
            getValue={(r, fl) => r[fl[0]!]} rowKey={(r) => text(rowId(r))}
            onAdd={perms.canCreate ? () => abrir(null) : undefined}
            onEdit={perms.canUpdate ? (r) => abrir(r) : undefined}
            onDelete={perms.canDelete ? (r) => remove.mutate(r) : undefined}
            filters={<>
              <FilterInput label="Busca" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="OS, cliente, equipamento…" />
              <FilterSelect label="Tipo" value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={[{ value: "todos", label: "Todos" }, ...TIPOS]} />
              <FilterSelect label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "todos", label: "Todas" }, ...STATUS]} />
            </>}
          />
        </TabsContent>
        <TabsContent value="calendario"><Calendario os={os} nomeP={nomeP} onOpen={abrir} /></TabsContent>
        <TabsContent value="equipamentos"><Ativos podeEditar={perms.canCreate || perms.canUpdate} podeExcluir={perms.canDelete} /></TabsContent>
        <TabsContent value="planos"><Planos podeEditar={perms.canCreate || perms.canUpdate} podeExcluir={perms.canDelete} /></TabsContent>
        <TabsContent value="modelos"><Modelos podeEditar={perms.canCreate || perms.canUpdate} /></TabsContent>
      </Tabs>
      <ManutencaoSheet open={aberto} onOpenChange={setAberto} record={record} />
    </div>
  );
}

function Calendario({ os, nomeP, onOpen }: { os: Row[]; nomeP: Map<string, string>; onOpen: (r: Row) => void }) {
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const inicio = new Date(mes); inicio.setDate(1 - mes.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  const porDia = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of os) if (r["data_prevista"]) {
      const k = new Date(text(r["data_prevista"])).toDateString();
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [os]);
  const hoje = new Date().toDateString();
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <h2 className="min-w-44 text-center font-semibold capitalize">{mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
        <Button size="icon" variant="outline" aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="bg-muted p-2 text-center font-semibold">{d}</div>)}
        {dias.map((d) => (
          <div key={d.toISOString()} className={cn("min-h-24 space-y-1 bg-background p-1", d.getMonth() !== mes.getMonth() && "opacity-40")}>
            <div className={cn("text-right", d.toDateString() === hoje && "font-bold text-primary")}>{d.getDate()}</div>
            {(porDia.get(d.toDateString()) ?? []).map((r) => (
              <button key={text(rowId(r))} type="button" onClick={() => onOpen(r)}
                className={cn("block w-full truncate rounded px-1 py-0.5 text-left", meta(TIPOS, r["tipo"]).cls)}>
                {new Date(text(r["data_prevista"])).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {nomeP.get(text(r["parceiro_id"])) || text(r["numero"])}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Modelos({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient();
  const { empresaId } = useAudit();
  const { data: modelos = [], isLoading } = useTableRows("manutencao_modelos");
  const remove = useDeleteRecord("manutencao_modelos");
  const [edit, setEdit] = useState<Row | null | undefined>(undefined);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [itens, setItens] = useState<ItemModelo[]>([]);

  const abrir = (r: Row | null) => {
    setEdit(r); setNome(text(r?.["nome"])); setCategoria(text(r?.["categoria"]));
    setItens(Array.isArray(r?.["itens"]) ? (r!["itens"] as ItemModelo[]) : [{ texto: "", tipo: "cnc" }]);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome do modelo.");
      const payload = { nome: nome.trim(), categoria: categoria.trim() || null, itens: itens.filter((i) => i.texto.trim()) };
      const { error } = edit
        ? await supabase.from("manutencao_modelos").update(payload).eq("id", text(rowId(edit)))
        : await supabase.from("manutencao_modelos").insert({ ...payload, empresa_id: empresaId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["table", "manutencao_modelos"] }); toast.success("Modelo salvo."); setEdit(undefined); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  const importar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("manutencao_modelos").insert(MODELOS_PADRAO.map((m) => ({ ...m, empresa_id: empresaId, padrao: true })));
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["table", "manutencao_modelos"] }); toast.success("Modelos padrão carregados."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao importar."),
  });

  const columns: Column[] = [
    { key: "nome", header: "Modelo", fields: ["nome"], render: (r) => <span className="font-medium">{text(r["nome"])}</span> },
    { key: "cat", header: "Categoria", fields: ["categoria"], render: (r) => text(r["categoria"]) || "—" },
    { key: "itens", header: "Itens", fields: ["itens"], render: (r) => (Array.isArray(r["itens"]) ? r["itens"].length : 0) },
  ];
  return (
    <div className="space-y-3">
      {podeEditar && !isLoading && modelos.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-4 text-sm">
          <span>Nenhum modelo ainda. Carregue os modelos padrão (Portões, CFTV, Alarme, Corretiva) e ajuste como quiser.</span>
          <Button size="sm" onClick={() => importar.mutate()} disabled={importar.isPending}><Download className="mr-1 h-4 w-4" /> Carregar modelos padrão</Button>
        </div>
      )}
      <DataTable title="Modelos de checklist" columns={columns} rows={modelos} loading={isLoading}
        getValue={(r, fl) => r[fl[0]!]} rowKey={(r) => text(rowId(r))}
        onAdd={podeEditar ? () => abrir(null) : undefined} onEdit={podeEditar ? abrir : undefined}
        onDelete={podeEditar ? (r) => remove.mutate(r) : undefined} />
      <Sheet open={edit !== undefined} onOpenChange={(o) => !o && setEdit(undefined)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="border-b p-4"><SheetTitle>{edit ? "Editar modelo" : "Novo modelo"}</SheetTitle></SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Categoria</Label><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: CFTV" /></div>
            </div>
            <Label>Itens do checklist</Label>
            {itens.map((it, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input className="min-w-48 flex-1" value={it.texto} placeholder={`Item ${i + 1}`} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
                <Select value={it.tipo} onValueChange={(v) => setItens(itens.map((x, j) => (j === i ? { ...x, tipo: v as ItemModelo["tipo"] } : x)))}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cnc">C / NC / NA</SelectItem><SelectItem value="numero">Valor medido</SelectItem></SelectContent>
                </Select>
                {it.tipo === "numero" && <Input className="w-20" placeholder="Unid." value={it.unidade ?? ""} onChange={(e) => setItens(itens.map((x, j) => (j === i ? { ...x, unidade: e.target.value } : x)))} />}
                <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => setItens(itens.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setItens([...itens, { texto: "", tipo: "cnc" }])}><Plus className="mr-1 h-4 w-4" /> Adicionar item</Button>
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
