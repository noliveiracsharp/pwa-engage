import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuickCreateDialog, type QuickField } from "@/components/itens/QuickCreateDialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { buildTree } from "@/lib/hierarchy";
import { useAudit } from "@/lib/audit";
import { ImageGallery } from "@/components/itens/ImageGallery";

const NONE = "__none__";

type Values = {
  tipo: string;
  codigo: string;
  descricao: string;
  unidade_medida_id: string;
  centro_custo_id: string;
  itens_marcas_id: string;
  preco_custo: string;
  margem_lucro: string;
  imposto: string;
  preco_venda: string;
  status: string;
  imagens: string[];
};

const EMPTY: Values = {
  tipo: "Produto",
  codigo: "",
  descricao: "",
  unidade_medida_id: NONE,
  centro_custo_id: NONE,
  itens_marcas_id: NONE,
  preco_custo: "",
  margem_lucro: "",
  imposto: "",
  preco_venda: "",
  status: "true",
  imagens: [],
};

const num = (v: string) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => String(Math.round(n * 100) / 100);

export function calcVenda(custo: number, margem: number, imposto: number): number | null {
  const divisor = 1 - margem / 100 - imposto / 100;
  if (custo <= 0 || divisor <= 0) return null;
  return custo / divisor;
}

export function calcMargem(custo: number, venda: number, imposto: number): number | null {
  if (venda <= 0) return null;
  return (1 - custo / venda - imposto / 100) * 100;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: Row | null;
  saving?: boolean;
  readOnly?: boolean;
  canCreateApoio: boolean;
  onSave: (values: Row) => void;
};

export function ItemSheet({ open, onOpenChange, record, saving, readOnly, canCreateApoio, onSave }: Props) {
  const [v, setV] = useState<Values>(EMPTY);
  const [quick, setQuick] = useState<null | "unidade" | "centro" | "marca">(null);

  const { data: unidades = [] } = useTableRows("unidade_medida");
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const { data: itens = [] } = useTableRows("itens");
  const { empresaId } = useAudit();
  void empresaId;
  const centroTree = useMemo(() => buildTree(centros, "centro_custo_pai_id"), [centros]);

  /** Próximo código sequencial por tipo: Produto → P00001…, Serviço → S00001… */
  const nextCodigoFor = (tipo: string) => {
    const prefixo = tipo === "Serviço" ? "S" : "P";
    let max = 0;
    for (const r of itens) {
      const c = String(pick(r, ["codigo"]) ?? "");
      const m = new RegExp(`^${prefixo}(\\d{5,})$`, "i").exec(c);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefixo}${String(max + 1).padStart(5, "0")}`;
  };
  const nextCodigo = useMemo(() => nextCodigoFor(v.tipo), [itens, v.tipo]);

  useEffect(() => {
    if (!open) return;
    if (!record) {
      setV({ ...EMPTY, codigo: nextCodigo });
      return;
    }
    setV({
      tipo: text(pick(record, ["tipo"], "Produto")),
      codigo: text(pick(record, ["codigo"], "")),
      descricao: text(pick(record, ["descricao"], "")),
      unidade_medida_id: text(pick(record, ["unidade_medida_id"], "")) || NONE,
      centro_custo_id: text(pick(record, ["centro_custo_id"], "")) || NONE,
      itens_marcas_id: text(pick(record, ["itens_marcas_id"], "")) || NONE,
      preco_custo: text(pick(record, ["preco_custo"], "")),
      margem_lucro: text(pick(record, ["margem_lucro"], "")),
      imposto: text(pick(record, ["imposto"], "")),
      preco_venda: text(pick(record, ["preco_venda"], "")),
      status: record["status"] === false ? "false" : "true",
      imagens: Array.isArray(record["imagens"]) ? (record["imagens"] as unknown[]).map(String).filter(Boolean) : [],
    });
  }, [open, record]);

  const options = useMemo(() => {
    const alfa = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
    return {
      unidade: unidades
        .map((r) => ({ value: String(rowId(r) ?? ""), label: String(pick(r, ["descricao"]) ?? "—") }))
        .sort(alfa),
      centro: centroTree.map((n) => ({ value: String(rowId(n.row) ?? ""), label: n.path })),
      marca: marcas
        .map((r) => ({ value: String(rowId(r) ?? ""), label: String(pick(r, ["descricao"]) ?? "—") }))
        .sort(alfa),
    };
  }, [unidades, centroTree, marcas]);

  /** Recalcula o preço de venda a partir de custo, margem e imposto. */
  const setPricing = (patch: Partial<Values>) => {
    setV((current) => {
      const next = { ...current, ...patch };
      const venda = calcVenda(num(next.preco_custo), num(next.margem_lucro), num(next.imposto));
      if (venda !== null) next.preco_venda = round2(venda);
      return next;
    });
  };

  /** Cálculo reverso: o usuário digitou o preço de venda final. */
  const setVenda = (value: string) => {
    setV((current) => {
      const next = { ...current, preco_venda: value };
      const margem = calcMargem(num(next.preco_custo), num(value), num(next.imposto));
      if (margem !== null) next.margem_lucro = round2(margem);
      return next;
    });
  };

  const submit = () => {
    const payload: Row = {
      tipo: v.tipo,
      codigo: v.codigo,
      descricao: v.descricao,
      unidade_medida_id: v.unidade_medida_id === NONE ? null : v.unidade_medida_id,
      centro_custo_id: v.centro_custo_id === NONE ? null : v.centro_custo_id,
      itens_marcas_id: v.itens_marcas_id === NONE ? null : v.itens_marcas_id,
      preco_custo: v.preco_custo === "" ? null : num(v.preco_custo),
      margem_lucro: v.margem_lucro === "" ? null : num(v.margem_lucro),
      imposto: v.imposto === "" ? null : num(v.imposto),
      preco_venda: v.preco_venda === "" ? null : num(v.preco_venda),
      status: v.status === "true",
      imagens: v.imagens,
    };
    onSave(payload);
  };

  const selectRow = (
    id: "unidade_medida_id" | "centro_custo_id" | "itens_marcas_id",
    label: string,
    list: Array<{ value: string; label: string }>,
    quickKey: "unidade" | "centro" | "marca",
  ) => (
    <div className="min-w-0 space-y-1.5 sm:col-span-2">
      <Label htmlFor={id} className="block text-sm font-medium">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <SearchSelect
          id={id}
          className="min-w-0 flex-1"
          value={v[id] === NONE ? "" : v[id]}
          onChange={(value) => setV((s) => ({ ...s, [id]: value || NONE }))}
          options={list}
          placeholder="Não informado"
          searchPlaceholder="Pesquisar…"
          disabled={readOnly}
        />
        {canCreateApoio && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Cadastrar ${label.toLowerCase()}`}
            title={`Cadastrar ${label.toLowerCase()}`}
            onClick={() => setQuick(quickKey)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  const quickConfig: Record<string, { title: string; table: string; fields: QuickField[]; field: keyof Values }> = {
    unidade: {
      title: "Nova unidade de medida",
      table: "unidade_medida",
      field: "unidade_medida_id",
      fields: [
        { key: "descricao", label: "Descrição" },
        { key: "status", label: "Status", type: "boolean" },
      ],
    },
    centro: {
      title: "Novo centro de custo",
      table: "centro_custo",
      field: "centro_custo_id",
      fields: [
        { key: "centro_custo_pai_id", label: "Centro de Custo Pai", type: "select", options: options.centro },
        { key: "codigo", label: "Código" },
        { key: "descricao", label: "Descrição" },
        { key: "status", label: "Status", type: "boolean" },
      ],
    },
    marca: {
      title: "Nova marca",
      table: "itens_marcas",
      field: "itens_marcas_id",
      fields: [
        { key: "foto", label: "Foto", type: "photo" },
        { key: "descricao", label: "Descrição" },
        { key: "status", label: "Status", type: "boolean" },
      ],
    },
  };
  const activeQuick = quick ? quickConfig[quick]! : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="px-6 pb-4">
          <SheetTitle>{record ? "Editar item" : "Novo item"}</SheetTitle>
        </SheetHeader>

        <fieldset disabled={readOnly} className="min-w-0 px-6 disabled:opacity-70">
          <div className="grid gap-x-4 gap-y-5 pt-2 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label className="block text-sm font-medium">Galeria de imagens</Label>
              <ImageGallery
                value={v.imagens}
                disabled={readOnly}
                onChange={(imagens) => setV((s) => ({ ...s, imagens }))}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="tipo" className="block text-sm font-medium">
                Tipo
              </Label>
              <Select
                value={v.tipo}
                onValueChange={(value) =>
                  setV((s) => {
                    const auto = /^[PS]\d{5,}$/i.test(s.codigo) || s.codigo === "";
                    return { ...s, tipo: value, codigo: !record && auto ? nextCodigoFor(value) : s.codigo };
                  })
                }
              >
                <SelectTrigger id="tipo">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Produto">Produto</SelectItem>
                  <SelectItem value="Serviço">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="codigo" className="block text-sm font-medium">
                Código
              </Label>
              <Input id="codigo" value={v.codigo} onChange={(e) => setV((s) => ({ ...s, codigo: e.target.value }))} />
            </div>

            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="descricao" className="block text-sm font-medium">
                Descrição
              </Label>
              <Input
                id="descricao"
                value={v.descricao}
                onChange={(e) => setV((s) => ({ ...s, descricao: e.target.value }))}
              />
            </div>

            {selectRow("unidade_medida_id", "Unidade de Medida", options.unidade, "unidade")}
            {selectRow("centro_custo_id", "Centro de Custo", options.centro, "centro")}
            {selectRow("itens_marcas_id", "Marca", options.marca, "marca")}

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="preco_custo" className="block text-sm font-medium">
                Preço de Custo (R$)
              </Label>
              <Input
                id="preco_custo"
                type="number"
                step="0.01"
                value={v.preco_custo}
                onChange={(e) => setPricing({ preco_custo: e.target.value })}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="margem_lucro" className="block text-sm font-medium">
                Margem de Lucro (%)
              </Label>
              <Input
                id="margem_lucro"
                type="number"
                step="0.01"
                value={v.margem_lucro}
                onChange={(e) => setPricing({ margem_lucro: e.target.value })}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="imposto" className="block text-sm font-medium">
                Imposto (%)
              </Label>
              <Input
                id="imposto"
                type="number"
                step="0.01"
                value={v.imposto}
                onChange={(e) => setPricing({ imposto: e.target.value })}
              />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="preco_venda" className="block text-sm font-medium">
                Preço de Venda (R$)
              </Label>
              <Input
                id="preco_venda"
                type="number"
                step="0.01"
                value={v.preco_venda}
                onChange={(e) => setVenda(e.target.value)}
              />
            </div>

            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="status" className="block text-sm font-medium">
                Status
              </Label>
              <div className="bg-background flex h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                <span className="text-muted-foreground text-sm">{v.status === "true" ? "Ativo" : "Inativo"}</span>
                <Switch
                  id="status"
                  checked={v.status === "true"}
                  onCheckedChange={(checked) => setV((s) => ({ ...s, status: String(checked) }))}
                />
              </div>
            </div>
          </div>
        </fieldset>

        <div className="bg-background sticky bottom-0 mt-4 flex justify-end gap-2 px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || readOnly}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>

        {activeQuick && (
          <QuickCreateDialog
            open
            onOpenChange={(o) => !o && setQuick(null)}
            title={activeQuick.title}
            table={activeQuick.table}
            fields={activeQuick.fields}
            onCreated={(id) => setV((s) => ({ ...s, [activeQuick.field]: id }))}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
