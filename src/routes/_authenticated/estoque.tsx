import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { RecordSheet, type Field } from "@/components/data-table/RecordSheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { useAudit } from "@/lib/audit";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { TIPOS_MOV, calcularSaldos, qtd, tipoMov } from "@/lib/estoque";

export const Route = createFileRoute("/_authenticated/estoque")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Controle de Estoque — Atende.ai" },
      { name: "description", content: "Saldos por local, movimentações (Kardex) e locais de estoque da empresa." },
      { property: "og:title", content: "Controle de Estoque — Atende.ai" },
      { property: "og:description", content: "Saldos por local, movimentações (Kardex) e locais de estoque da empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EstoquePage,
});

const LOCAL_TIPOS = ["Almoxarifado", "Veículo", "Cliente / Comodato", "Outro"].map((v) => ({ value: v, label: v }));
const localFields: Field[] = [
  { fields: ["descricao"], label: "Descrição", full: true },
  { fields: ["tipo"], label: "Tipo", type: "select", options: LOCAL_TIPOS },
  { fields: ["status"], label: "Status", type: "boolean" },
];

function EstoquePage() {
  const perms = usePagePermissions("/estoque");
  const { data: itens = [] } = useTableRows("itens");
  const { data: locais = [], isLoading: loadLocais } = useTableRows("estoque_locais");
  const { data: movs = [], isLoading: loadMovs } = useTableRows("estoque_movimentacoes");
  const saveLocal = useSaveRecord("estoque_locais");
  const removeLocal = useDeleteRecord("estoque_locais");
  const { stamp } = useAudit();

  const [localOpen, setLocalOpen] = useState(false);
  const [localRec, setLocalRec] = useState<Row | null>(null);
  const [movOpen, setMovOpen] = useState(false);
  const [fs, setFs] = useState({ busca: "", local: "todos", situacao: "todos" });
  const [fm, setFm] = useState({ busca: "", tipo: "todos" });
  const [fl, setFl] = useState("");

  const produtos = useMemo(
    () => itens.filter((i) => String(pick(i, ["tipo"]) ?? "Produto") === "Produto" && i["controla_estoque"] !== false),
    [itens],
  );
  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i)), i])), [itens]);
  const localById = useMemo(() => new Map(locais.map((l) => [String(rowId(l)), l])), [locais]);
  const saldos = useMemo(() => calcularSaldos(movs), [movs]);
  const nomeLocal = (id: unknown) => (id ? String(pick(localById.get(String(id)) ?? {}, ["descricao"]) ?? "—") : "—");

  const saldoRows = useMemo(
    () =>
      produtos
        .map((i) => {
          const id = String(rowId(i));
          const porLocal = saldos.get(id) ?? new Map<string, number>();
          const total = fs.local === "todos" ? [...porLocal.values()].reduce((a, b) => a + b, 0) : porLocal.get(fs.local) ?? 0;
          const minimo = Number(i["estoque_minimo"] ?? 0) || 0;
          const situacao = total <= 0 && minimo <= 0 ? "zerado" : total < minimo ? "abaixo" : total <= minimo * 1.2 ? "atencao" : "normal";
          return { ...i, _saldo: total, _minimo: minimo, _situacao: situacao, _locais: porLocal } as Row;
        })
        .filter(
          (r) =>
            matchesAny([pick(r, ["codigo"]), pick(r, ["descricao"])], fs.busca) &&
            (fs.situacao === "todos" || r["_situacao"] === fs.situacao),
        ),
    [produtos, saldos, fs],
  );

  const SIT: Record<string, { label: string; cls: string }> = {
    normal: { label: "Normal", cls: "bg-success/15 text-success border-success/30" },
    atencao: { label: "Atenção", cls: "bg-warning/15 text-warning border-warning/30" },
    abaixo: { label: "Abaixo do mínimo", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    zerado: { label: "Sem saldo", cls: "bg-muted text-muted-foreground" },
  };

  const saldoCols: Column[] = [
    { key: "codigo", header: "Código", fields: ["codigo"] },
    { key: "descricao", header: "Produto", fields: ["descricao"] },
    {
      key: "locais",
      header: "Por local",
      fields: ["_saldo"],
      sortable: false,
      render: (r) => {
        const m = r["_locais"] as Map<string, number>;
        const parts = [...m.entries()].filter(([, v]) => v !== 0);
        return parts.length ? (
          <div className="flex flex-wrap gap-1">
            {parts.map(([l, v]) => (
              <Badge key={l} variant="outline" className="font-normal">
                {nomeLocal(l)}: {qtd(v)}
              </Badge>
            ))}
          </div>
        ) : (
          "—"
        );
      },
    },
    { key: "saldo", header: "Saldo", fields: ["_saldo"], render: (r) => <strong>{qtd(Number(r["_saldo"]))}</strong> },
    { key: "minimo", header: "Mínimo", fields: ["_minimo"], render: (r) => qtd(Number(r["_minimo"])) },
    {
      key: "situacao",
      header: "Situação",
      fields: ["_situacao"],
      render: (r) => {
        const s = SIT[String(r["_situacao"])]!;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
  ];

  const movRows = useMemo(
    () =>
      [...movs]
        .sort((a, b) => String(b["dt_movimento"] ?? "").localeCompare(String(a["dt_movimento"] ?? "")))
        .filter((m) => {
          const it = itemById.get(String(m["item_id"]));
          return (
            matchesAny([pick(it ?? {}, ["descricao"]), pick(it ?? {}, ["codigo"]), m["documento"], m["observacoes"]], fm.busca) &&
            (fm.tipo === "todos" || m["tipo"] === fm.tipo)
          );
        }),
    [movs, itemById, fm],
  );

  const movCols: Column[] = [
    {
      key: "data",
      header: "Data",
      fields: ["dt_movimento"],
      render: (m) => (m["dt_movimento"] ? new Date(String(m["dt_movimento"])).toLocaleString("pt-BR") : "—"),
    },
    {
      key: "tipo",
      header: "Tipo",
      fields: ["tipo"],
      render: (m) => {
        const t = tipoMov(m["tipo"]);
        const Icon = t?.sinal === "entrada" ? ArrowDownLeft : t?.sinal === "saida" ? ArrowUpRight : ArrowLeftRight;
        const cls =
          t?.sinal === "entrada"
            ? "bg-success/15 text-success border-success/30"
            : t?.sinal === "saida"
              ? "bg-destructive/15 text-destructive border-destructive/30"
              : "bg-primary/10 text-primary border-primary/30";
        return (
          <Badge variant="outline" className={`gap-1 ${cls}`}>
            <Icon className="h-3 w-3" /> {t?.label ?? String(m["tipo"])}
          </Badge>
        );
      },
    },
    {
      key: "item",
      header: "Produto",
      fields: ["item_id"],
      render: (m) => String(pick(itemById.get(String(m["item_id"])) ?? {}, ["descricao"]) ?? "—"),
    },
    { key: "origem", header: "Origem", fields: ["local_origem_id"], render: (m) => nomeLocal(m["local_origem_id"]) },
    { key: "destino", header: "Destino", fields: ["local_destino_id"], render: (m) => nomeLocal(m["local_destino_id"]) },
    { key: "qtd", header: "Qtd.", fields: ["quantidade"], render: (m) => qtd(Number(m["quantidade"])) },
    { key: "doc", header: "Documento", fields: ["documento"] },
  ];

  const localCols: Column[] = [
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    { key: "tipo", header: "Tipo", fields: ["tipo"] },
    { key: "status", header: "Status", fields: ["status"], render: (r) => <StatusBadge value={r["status"]} /> },
  ];

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <Tabs defaultValue="saldos" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabsList className="h-auto flex-1 flex-wrap">
          <TabsTrigger value="saldos" className="flex-1">Saldos</TabsTrigger>
          <TabsTrigger value="kardex" className="flex-1">Movimentações (Kardex)</TabsTrigger>
          <TabsTrigger value="locais" className="flex-1">Locais de Estoque</TabsTrigger>
        </TabsList>
        {perms.canCreate && (
          <Button onClick={() => setMovOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova movimentação
          </Button>
        )}
      </div>

      <TabsContent value="saldos">
        <DataTable
          title="Saldos de estoque"
          columns={saldoCols}
          rows={saldoRows}
          loading={loadMovs}
          getValue={(r, k) => pick(r, k)}
          rowKey={(r, i) => String(rowId(r) ?? i)}
          filters={
            <>
              <FilterInput label="Buscar" value={fs.busca} onChange={(v) => setFs({ ...fs, busca: v })} placeholder="Código ou produto" />
              <FilterSelect
                label="Local"
                value={fs.local}
                onChange={(v) => setFs({ ...fs, local: v })}
                options={[{ value: "todos", label: "Todos" }, ...locais.map((l) => ({ value: String(rowId(l)), label: String(pick(l, ["descricao"]) ?? "—") }))]}
              />
              <FilterSelect
                label="Situação"
                value={fs.situacao}
                onChange={(v) => setFs({ ...fs, situacao: v })}
                options={[{ value: "todos", label: "Todas" }, ...Object.entries(SIT).map(([value, s]) => ({ value, label: s.label }))]}
              />
            </>
          }
        />
      </TabsContent>

      <TabsContent value="kardex">
        <DataTable
          title="Movimentações"
          columns={movCols}
          rows={movRows}
          loading={loadMovs}
          getValue={(r, k) => pick(r, k)}
          rowKey={(r, i) => String(rowId(r) ?? i)}
          filters={
            <>
              <FilterInput label="Buscar" value={fm.busca} onChange={(v) => setFm({ ...fm, busca: v })} placeholder="Produto, documento ou observação" />
              <FilterSelect
                label="Tipo"
                value={fm.tipo}
                onChange={(v) => setFm({ ...fm, tipo: v })}
                options={[{ value: "todos", label: "Todos" }, ...TIPOS_MOV.map((t) => ({ value: t.value, label: t.label }))]}
              />
            </>
          }
        />
      </TabsContent>

      <TabsContent value="locais">
        <DataTable
          title="Locais de estoque"
          columns={localCols}
          rows={locais.filter((l) => matchesAny([pick(l, ["descricao"]), pick(l, ["tipo"])], fl))}
          loading={loadLocais}
          getValue={(r, k) => pick(r, k)}
          rowKey={(r, i) => String(rowId(r) ?? i)}
          onAdd={perms.canCreate ? () => { setLocalRec(null); setLocalOpen(true); } : undefined}
          onEdit={(r) => { setLocalRec(r); setLocalOpen(true); }}
          editReadOnly={!perms.canUpdate}
          onDelete={perms.canDelete ? (r) => removeLocal.mutate(r) : undefined}
          filters={<FilterInput label="Buscar" value={fl} onChange={setFl} placeholder="Descrição ou tipo" />}
        />
      </TabsContent>

      <RecordSheet
        open={localOpen}
        onOpenChange={(o) => { setLocalOpen(o); if (!o) setLocalRec(null); }}
        title={localRec ? "Editar local" : "Novo local"}
        fields={localFields}
        record={localRec}
        saving={saveLocal.isPending}
        readOnly={localRec ? !perms.canUpdate : !perms.canCreate}
        onSave={(values) => {
          if (!String(values["descricao"] ?? "").trim()) return toast.error("Informe a descrição.");
          const payload = localRec ? values : { tipo: "Almoxarifado", status: true, ...values };
          saveLocal.mutate(
            { values: stamp(payload, !localRec), original: localRec },
            { onSuccess: () => { setLocalOpen(false); setLocalRec(null); } },
          );
        }}
      />

      <MovimentacaoSheet open={movOpen} onOpenChange={setMovOpen} produtos={produtos} locais={locais} saldos={saldos} />
    </Tabs>
  );
}

type MovProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  produtos: Row[];
  locais: Row[];
  saldos: Map<string, Map<string, number>>;
};

const MOV_EMPTY = { tipo: "entrada_compra", item_id: "", origem: "", destino: "", quantidade: "", custo: "", documento: "", observacoes: "" };

function MovimentacaoSheet({ open, onOpenChange, produtos, locais, saldos }: MovProps) {
  const save = useSaveRecord("estoque_movimentacoes");
  const { stamp } = useAudit();
  const [v, setV] = useState(MOV_EMPTY);
  useEffect(() => {
    if (open) setV(MOV_EMPTY);
  }, [open]);

  const t = tipoMov(v.tipo)!;
  const ativos = locais.filter((l) => l["status"] !== false);
  const localOpts = ativos.map((l) => ({ value: String(rowId(l)), label: `${String(pick(l, ["descricao"]) ?? "—")} (${String(l["tipo"] ?? "")})` }));
  const itemOpts = produtos.map((i) => ({
    value: String(rowId(i)),
    label: String(pick(i, ["descricao"]) ?? "—"),
    hint: String(pick(i, ["codigo"]) ?? ""),
  }));
  const disponivel = v.item_id && v.origem ? saldos.get(v.item_id)?.get(v.origem) ?? 0 : null;

  const submit = () => {
    const q = Number(v.quantidade.replace(",", "."));
    if (!v.item_id) return toast.error("Selecione o produto.");
    if (!(q > 0)) return toast.error("Informe uma quantidade maior que zero.");
    if (t.origem && !v.origem) return toast.error("Selecione o local de origem.");
    if (t.destino && !v.destino) return toast.error("Selecione o local de destino.");
    if (t.origem && t.destino && v.origem === v.destino) return toast.error("Origem e destino devem ser diferentes.");
    if (t.origem && disponivel !== null && q > disponivel)
      return toast.error(`Saldo insuficiente na origem (disponível: ${qtd(disponivel)}).`);
    const item = produtos.find((i) => String(rowId(i)) === v.item_id);
    const custo = v.custo ? Number(v.custo.replace(",", ".")) : Number(item?.["preco_custo"] ?? 0) || null;
    save.mutate(
      {
        values: stamp(
          {
            tipo: v.tipo,
            item_id: v.item_id,
            local_origem_id: t.origem ? v.origem : null,
            local_destino_id: t.destino ? v.destino : null,
            quantidade: q,
            custo_unitario: custo,
            documento: v.documento.trim() || null,
            observacoes: v.observacoes.trim() || null,
          },
          true,
        ),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="px-6 pb-4">
          <SheetTitle>Nova movimentação</SheetTitle>
        </SheetHeader>
        <div className="grid gap-4 px-6 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tipo de movimentação</Label>
            <Select value={v.tipo} onValueChange={(tipo) => setV((s) => ({ ...s, tipo }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_MOV.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Produto</Label>
            <SearchSelect value={v.item_id} onChange={(item_id) => setV((s) => ({ ...s, item_id }))} options={itemOpts} placeholder="Selecione o produto" searchPlaceholder="Pesquisar…" />
          </div>
          {t.origem && (
            <div className="space-y-1.5">
              <Label>Local de origem</Label>
              <SearchSelect value={v.origem} onChange={(origem) => setV((s) => ({ ...s, origem }))} options={localOpts} placeholder="Selecione" searchPlaceholder="Pesquisar…" />
              {disponivel !== null && <p className="text-muted-foreground text-xs">Disponível: {qtd(disponivel)}</p>}
            </div>
          )}
          {t.destino && (
            <div className="space-y-1.5">
              <Label>Local de destino</Label>
              <SearchSelect value={v.destino} onChange={(destino) => setV((s) => ({ ...s, destino }))} options={localOpts} placeholder="Selecione" searchPlaceholder="Pesquisar…" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input type="number" step="0.001" value={v.quantidade} onChange={(e) => setV((s) => ({ ...s, quantidade: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Custo unitário (R$)</Label>
            <Input type="number" step="0.01" placeholder="Usa o custo do item" value={v.custo} onChange={(e) => setV((s) => ({ ...s, custo: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Documento de referência</Label>
            <Input placeholder="NF, nº da oferta, projeto…" value={v.documento} onChange={(e) => setV((s) => ({ ...s, documento: e.target.value }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Textarea rows={3} value={v.observacoes} onChange={(e) => setV((s) => ({ ...s, observacoes: e.target.value }))} />
          </div>
          {ativos.length === 0 && (
            <p className="text-warning text-sm sm:col-span-2">Cadastre ao menos um local na aba "Locais de Estoque".</p>
          )}
        </div>
        <div className="bg-background sticky bottom-0 mt-4 flex justify-end gap-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
