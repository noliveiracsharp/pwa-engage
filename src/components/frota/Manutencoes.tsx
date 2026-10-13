import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterSelect } from "@/components/data-table/FilterField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { statusManutencao } from "@/lib/frota";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
type ItemCk = { descricao: string; ok?: boolean };

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import { num as numDec } from "@/lib/orcamentos";
/** KM e dias são inteiros: aceita "10.000" ou "10000". Valores decimais usam numDec. */
const num = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(/\D/g, "")) || null);
const fmtD = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—");
const placaDe = (v: Row | undefined) => (v ? `${String(v["placa"] ?? "")} · ${String(v["modelo"] ?? "")}` : "—");
const itensDe = (v: unknown): ItemCk[] => (Array.isArray(v) ? (v as ItemCk[]) : []);
const STATUS = {
  ok: { label: "Em dia", cls: "bg-success/15 text-success" },
  proximo: { label: "Próxima", cls: "bg-warning/15 text-warning" },
  vencido: { label: "Vencida", cls: "bg-destructive/15 text-destructive" },
};

function useEmpresaGravacao() {
  const { isMaster, empresa } = useAuth();
  const { empresaId } = useAudit();
  return isMaster && empresa ? rowId(empresa) : empresaId;
}

export function ManutencoesTab({ veiculos, perms }: { veiculos: Row[]; perms: Perms }) {
  const { data: planos = [], isLoading } = useTableRows("veiculos_manutencao_planos");
  const { data: feitas = [], isLoading: l2 } = useTableRows("veiculos_manutencoes");
  const { data: modelos = [] } = useTableRows("frota_checklist_modelos");
  const removePlano = useDeleteRecord("veiculos_manutencao_planos");
  const [veic, setVeic] = useState("todos");
  const [plano, setPlano] = useState<Row | null | undefined>(undefined);
  const [registrar, setRegistrar] = useState<Row | null | undefined>(undefined);
  const [modelosAberto, setModelosAberto] = useState(false);
  const vById = useMemo(() => new Map(veiculos.map((v) => [String(rowId(v)), v])), [veiculos]);

  const linhas = useMemo(
    () =>
      planos
        .filter((p) => p["ativo"] !== false && (veic === "todos" || String(p["veiculo_id"]) === veic))
        .map((p): Row & { _st: ReturnType<typeof statusManutencao> } => ({ ...p, _st: statusManutencao(p as never, Number(vById.get(String(p["veiculo_id"]))?.["km_atual"] ?? 0)) }))
        .sort((a, b) => ["vencido", "proximo", "ok"].indexOf(a._st.status) - ["vencido", "proximo", "ok"].indexOf(b._st.status)),
    [planos, veic, vById],
  );
  const alertas = linhas.filter((l) => l._st.status !== "ok");
  const historico = feitas
    .filter((f) => veic === "todos" || String(f["veiculo_id"]) === veic)
    .sort((a, b) => String(b["realizada_em"]).localeCompare(String(a["realizada_em"])));

  const colsPlanos: Column[] = [
    { key: "veiculo", header: "Veículo", fields: [], render: (r) => placaDe(vById.get(String(r["veiculo_id"]))) },
    { key: "descricao", header: "Manutenção", fields: ["descricao"] },
    { key: "intervalo", header: "A cada", fields: [], render: (r) => [r["intervalo_km"] && `${Number(r["intervalo_km"]).toLocaleString("pt-BR")} km`, r["intervalo_dias"] && `${String(r["intervalo_dias"])} dias`].filter(Boolean).join(" ou ") || "—" },
    { key: "ultima", header: "Última", fields: [], render: (r) => `${r["ultimo_km"] != null ? `${Number(r["ultimo_km"]).toLocaleString("pt-BR")} km` : "—"} · ${fmtD(r["ultima_data"])}` },
    {
      key: "proxima", header: "Próxima", fields: [],
      render: (r) => { const s = (r as Row & { _st: ReturnType<typeof statusManutencao> })._st; return `${s.proximoKm != null ? `${s.proximoKm.toLocaleString("pt-BR")} km` : ""}${s.proximoKm != null && s.proximaData ? " · " : ""}${s.proximaData ? fmtD(s.proximaData) : ""}` || "—"; },
    },
    {
      key: "status", header: "Status", fields: [],
      render: (r) => { const s = STATUS[(r as Row & { _st: ReturnType<typeof statusManutencao> })._st.status]; return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>; },
    },
    {
      key: "acao", header: "", fields: [],
      render: (r) => perms.canCreate ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setRegistrar(r); }}><Wrench className="mr-1 size-3.5" /> Registrar</Button> : null,
    },
  ];

  const colsHist: Column[] = [
    { key: "data", header: "Data", fields: ["realizada_em"], render: (r) => fmtD(r["realizada_em"]) },
    { key: "veiculo", header: "Veículo", fields: [], render: (r) => placaDe(vById.get(String(r["veiculo_id"]))) },
    { key: "descricao", header: "Serviço", fields: ["descricao"] },
    { key: "km", header: "KM", fields: ["km"], render: (r) => Number(r["km"] ?? 0).toLocaleString("pt-BR") },
    { key: "oficina", header: "Oficina", fields: ["oficina"] },
    { key: "valor", header: "Valor", fields: ["valor"], render: (r) => brl(r["valor"]) },
    { key: "check", header: "Checklist", fields: [], render: (r) => { const it = itensDe(r["checklist"]); return it.length ? `${it.filter((i) => i.ok).length}/${it.length}` : "—"; } },
  ];

  return (
    <div className="space-y-4">
      {alertas.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warning" /> Levar para manutenção</div>
          {alertas.map((a) => (
            <div key={String(rowId(a))} className={cn(a._st.status === "vencido" && "text-destructive")}>
              <b className="font-mono">{String(vById.get(String(a["veiculo_id"]))?.["placa"] ?? "")}</b> — {String(a["descricao"])} ({STATUS[a._st.status].label.toLowerCase()})
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-60"><FilterSelect label="Veículo" value={veic} onChange={setVeic} options={[{ value: "todos", label: "Todos" }, ...veiculos.map((v) => ({ value: String(rowId(v)), label: placaDe(v) }))]} /></div>
        <Button variant="outline" onClick={() => setModelosAberto(true)}><ClipboardList className="mr-2 size-4" /> Checklists modelo</Button>
        {perms.canCreate && <Button variant="outline" onClick={() => setRegistrar(null)}><Wrench className="mr-2 size-4" /> Manutenção avulsa</Button>}
      </div>
      <DataTable
        title="Plano de manutenção"
        columns={colsPlanos}
        rows={linhas}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(r, i) => String(rowId(r) ?? i)}
        onAdd={perms.canCreate ? () => setPlano(null) : undefined}
        onEdit={(r) => setPlano(r)}
        editReadOnly={!perms.canUpdate}
        onDelete={perms.canDelete ? (r) => removePlano.mutate(r) : undefined}
      />
      <DataTable title="Histórico de manutenções" columns={colsHist} rows={historico} loading={l2} getValue={(row, keys) => pick(row, keys)} rowKey={(r, i) => String(rowId(r) ?? i)} onEdit={(r) => setRegistrar({ ...r, _ver: true })} />

      {plano !== undefined && <PlanoSheet original={plano} veiculos={veiculos} modelos={modelos} readOnly={!!plano && !perms.canUpdate} onClose={() => setPlano(undefined)} />}
      {registrar !== undefined && <RegistroSheet base={registrar} veiculos={veiculos} modelos={modelos} onClose={() => setRegistrar(undefined)} />}
      {modelosAberto && <ModelosSheet modelos={modelos} perms={perms} onClose={() => setModelosAberto(false)} />}
    </div>
  );
}

function PlanoSheet({ original, veiculos, modelos, readOnly, onClose }: { original: Row | null; veiculos: Row[]; modelos: Row[]; readOnly: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const empresaId = useEmpresaGravacao();
  const [p, setP] = useState<Row>(() => ({ ativo: true, ...(original ?? {}) }));
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const veiculo = veiculos.find((v) => String(rowId(v)) === String(p["veiculo_id"] ?? ""));

  const salvar = async () => {
    if (!p["veiculo_id"]) return void toast.error("Escolha o veículo.");
    if (!String(p["descricao"] ?? "").trim()) return void toast.error("Descreva a manutenção.");
    if (!num(p["intervalo_km"]) && !num(p["intervalo_dias"])) return void toast.error("Informe o intervalo em KM, em dias ou ambos.");
    const values = {
      veiculo_id: p["veiculo_id"], descricao: String(p["descricao"]).trim(),
      intervalo_km: num(p["intervalo_km"]), intervalo_dias: num(p["intervalo_dias"]),
      ultimo_km: num(p["ultimo_km"]) ?? Number(veiculo?.["km_atual"] ?? 0),
      ultima_data: p["ultima_data"] || new Date().toISOString().slice(0, 10),
      checklist_modelo_id: p["checklist_modelo_id"] || null, ativo: p["ativo"] !== false,
    };
    setSalvando(true);
    const { error } = original
      ? await supabase.from("veiculos_manutencao_planos").update(values as never).eq("id", String(rowId(original)))
      : await supabase.from("veiculos_manutencao_planos").insert({ ...values, empresa_id: empresaId } as never);
    setSalvando(false);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "veiculos_manutencao_planos"] });
    toast.success("Plano salvo.");
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4"><SheetTitle>{original ? "Plano de manutenção" : "Novo plano de manutenção"}</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Veículo *</Label>
              <Select value={String(p["veiculo_id"] ?? "")} onValueChange={(v) => set("veiculo_id", v)} disabled={readOnly}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>{veiculos.map((v) => <SelectItem key={String(rowId(v))} value={String(rowId(v))}>{placaDe(v)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Manutenção *</Label><Input value={String(p["descricao"] ?? "")} onChange={(e) => set("descricao", e.target.value)} placeholder="Troca de óleo e filtro" disabled={readOnly} /></div>
            <div className="space-y-1.5"><Label>A cada (km)</Label><Input inputMode="numeric" value={String(p["intervalo_km"] ?? "")} onChange={(e) => set("intervalo_km", e.target.value)} placeholder="10000" disabled={readOnly} /></div>
            <div className="space-y-1.5"><Label>Ou a cada (dias)</Label><Input inputMode="numeric" value={String(p["intervalo_dias"] ?? "")} onChange={(e) => set("intervalo_dias", e.target.value)} placeholder="180" disabled={readOnly} /></div>
            <div className="space-y-1.5"><Label>Última feita com (km)</Label><Input inputMode="numeric" value={String(p["ultimo_km"] ?? "")} onChange={(e) => set("ultimo_km", e.target.value)} placeholder={String(veiculo?.["km_atual"] ?? "")} disabled={readOnly} /></div>
            <div className="space-y-1.5"><Label>Última feita em</Label><Input type="date" value={String(p["ultima_data"] ?? "").slice(0, 10)} onChange={(e) => set("ultima_data", e.target.value)} disabled={readOnly} /></div>
            <div className="space-y-1.5">
              <Label>Checklist modelo</Label>
              <Select value={String(p["checklist_modelo_id"] ?? "nenhum")} onValueChange={(v) => set("checklist_modelo_id", v === "nenhum" ? null : v)} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="nenhum">Nenhum</SelectItem>{modelos.map((m) => <SelectItem key={String(rowId(m))} value={String(rowId(m))}>{String(m["nome"])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3"><Label>Ativo</Label><Switch checked={p["ativo"] !== false} onCheckedChange={(v) => set("ativo", v)} disabled={readOnly} /></div>
          </div>
          <p className="text-muted-foreground text-xs">Vale o que vencer primeiro. O aviso aparece 500 km ou 15 dias antes.</p>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RegistroSheet({ base, veiculos, modelos, onClose }: { base: Row | null; veiculos: Row[]; modelos: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const empresaId = useEmpresaGravacao();
  const { usuario } = useAuth();
  const ver = !!base?.["_ver"];
  const planoId = ver ? base?.["plano_id"] : base ? rowId(base) : null;
  const modelo = !ver && base ? modelos.find((m) => String(rowId(m)) === String(base["checklist_modelo_id"] ?? "")) : undefined;
  const [veiculoId, setVeiculoId] = useState(String(base?.["veiculo_id"] ?? ""));
  const veiculo = veiculos.find((v) => String(rowId(v)) === veiculoId);
  const [descricao, setDescricao] = useState(String(base?.["descricao"] ?? ""));
  const [data, setData] = useState(String(base?.["realizada_em"] ?? new Date().toISOString()).slice(0, 10));
  const [km, setKm] = useState(String(ver ? base?.["km"] ?? "" : veiculo?.["km_atual"] ?? ""));
  const [oficina, setOficina] = useState(String(base?.["oficina"] ?? ""));
  const [valor, setValor] = useState(ver ? String(base?.["valor"] ?? "") : "");
  const [obs, setObs] = useState(String(ver ? base?.["observacao"] ?? "" : ""));
  const [itens, setItens] = useState<ItemCk[]>(() => (ver ? itensDe(base?.["checklist"]) : itensDe(modelo?.["itens"]).map((i) => ({ descricao: i.descricao, ok: false }))));
  const [modeloSel, setModeloSel] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!veiculoId) return void toast.error("Escolha o veículo.");
    if (!descricao.trim()) return void toast.error("Descreva o serviço.");
    if (!num(km)) return void toast.error("Informe o KM.");
    setSalvando(true);
    const { error } = await supabase.from("veiculos_manutencoes").insert({
      empresa_id: empresaId, veiculo_id: veiculoId, plano_id: planoId ?? null, descricao: descricao.trim(),
      realizada_em: data, km: num(km), oficina: oficina || null, valor: valor === "" || valor == null ? null : numDec(valor) || null, checklist: itens,
      observacao: obs || null, responsavel_nome: String(pick(usuario ?? {}, ["nome", "name", "email"]) ?? ""),
    } as never);
    setSalvando(false);
    if (error) return void toast.error(error.message);
    for (const t of ["veiculos", "veiculos_manutencoes", "veiculos_manutencao_planos"]) qc.invalidateQueries({ queryKey: ["table", t] });
    toast.success("Manutenção registrada. Próximo vencimento recalculado.");
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4"><SheetTitle className="flex items-center gap-2"><Wrench className="size-5" /> {ver ? "Manutenção realizada" : "Registrar manutenção"}</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Veículo *</Label>
              <Select value={veiculoId} onValueChange={setVeiculoId} disabled={ver || !!base}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>{veiculos.map((v) => <SelectItem key={String(rowId(v))} value={String(rowId(v))}>{placaDe(v)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Serviço *</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={ver} /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} disabled={ver} /></div>
            <div className="space-y-1.5"><Label>KM *</Label><Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} disabled={ver} /></div>
            <div className="space-y-1.5"><Label>Oficina</Label><Input value={oficina} onChange={(e) => setOficina(e.target.value)} disabled={ver} /></div>
            <div className="space-y-1.5"><Label>Valor (R$)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} disabled={ver} /></div>
          </div>
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Checklist {itens.length > 0 && `(${itens.filter((i) => i.ok).length}/${itens.length})`}</h3>
              {!ver && (
                <Select value={modeloSel} onValueChange={(v) => { setModeloSel(v); const m = modelos.find((x) => String(rowId(x)) === v); setItens(itensDe(m?.["itens"]).map((i) => ({ descricao: i.descricao, ok: false }))); }}>
                  <SelectTrigger className="h-8 w-52"><SelectValue placeholder="Usar checklist modelo" /></SelectTrigger>
                  <SelectContent>{modelos.map((m) => <SelectItem key={String(rowId(m))} value={String(rowId(m))}>{String(m["nome"])}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            {itens.length === 0 && <p className="text-muted-foreground text-xs">Sem checklist. Escolha um modelo para listar os itens.</p>}
            {itens.map((it, i) => (
              <label key={i} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                <Checkbox checked={!!it.ok} disabled={ver} onCheckedChange={(v) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ok: !!v } : x)))} />
                <span className={cn(it.ok && "text-muted-foreground line-through")}>{it.descricao}</span>
              </label>
            ))}
          </section>
          <div className="space-y-1.5"><Label>Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} disabled={ver} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>{ver ? "Fechar" : "Cancelar"}</Button>
          {!ver && <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ModelosSheet({ modelos, perms, onClose }: { modelos: Row[]; perms: Perms; onClose: () => void }) {
  const qc = useQueryClient();
  const empresaId = useEmpresaGravacao();
  const [edit, setEdit] = useState<Row | null>(null);
  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const abrir = (m: Row | null) => { setEdit(m ?? {}); setNome(String(m?.["nome"] ?? "")); setItens(m ? itensDe(m["itens"]).map((i) => i.descricao) : [""]); };
  const salvar = async () => {
    const lista = itens.map((s) => s.trim()).filter(Boolean).map((descricao) => ({ descricao }));
    if (!nome.trim() || !lista.length) return void toast.error("Informe o nome e ao menos um item.");
    setSalvando(true);
    const id = edit ? rowId(edit) : null;
    const { error } = id
      ? await supabase.from("frota_checklist_modelos").update({ nome: nome.trim(), itens: lista } as never).eq("id", String(id))
      : await supabase.from("frota_checklist_modelos").insert({ empresa_id: empresaId, nome: nome.trim(), itens: lista } as never);
    setSalvando(false);
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "frota_checklist_modelos"] });
    toast.success("Checklist salvo.");
    setEdit(null);
  };
  const excluir = async (m: Row) => {
    if (!confirm(`Excluir o checklist "${String(m["nome"])}"?`)) return;
    const { error } = await supabase.from("frota_checklist_modelos").delete().eq("id", String(rowId(m)));
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "frota_checklist_modelos"] });
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4"><SheetTitle className="flex items-center gap-2"><ClipboardList className="size-5" /> Checklists modelo</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {edit ? (
            <>
              <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Revisão 10.000 km" /></div>
              {itens.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={s} onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Ex.: Óleo do motor" />
                  <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => setItens((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setItens((l) => [...l, ""])}><Plus className="mr-1 size-4" /> Adicionar item</Button>
            </>
          ) : (
            <>
              {modelos.length === 0 && <p className="text-muted-foreground text-sm">Nenhum checklist cadastrado.</p>}
              {modelos.map((m) => (
                <div key={String(rowId(m))} className="flex items-center gap-2 rounded-md border p-2">
                  <button type="button" className="flex-1 text-left text-sm" onClick={() => abrir(m)}>{String(m["nome"])} <span className="text-muted-foreground text-xs">· {itensDe(m["itens"]).length} itens</span></button>
                  {perms.canDelete && <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(m)}><Trash2 className="size-4" /></Button>}
                </div>
              ))}
              {perms.canCreate && <Button onClick={() => abrir(null)}><Plus className="mr-1 size-4" /> Novo checklist</Button>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={() => (edit ? setEdit(null) : onClose())}>{edit ? "Cancelar" : "Fechar"}</Button>
          {edit && <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
