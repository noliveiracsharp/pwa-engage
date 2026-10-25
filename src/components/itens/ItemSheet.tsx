import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { padraoPorNatureza, usePrecificacao } from "@/components/itens/PrecificacaoDialog";
import { CATEGORIAS_ITENS } from "@/lib/itens-categorias";
import { classificarItem } from "@/lib/itens-classificacao";
import { HistoricoCompras } from "@/components/itens/HistoricoCompras";
import { NcmBusca } from "@/components/itens/NcmBusca";

const NONE = "__none__";

const ORIGENS: Array<[string, string]> = [
  ["0", "Nacional"],
  ["1", "Estrangeira - importação direta"],
  ["2", "Estrangeira - adquirida no mercado interno"],
  ["3", "Nacional, conteúdo de importação > 40% e ≤ 70%"],
  ["4", "Nacional, processos produtivos básicos"],
  ["5", "Nacional, conteúdo de importação ≤ 40%"],
  ["6", "Estrangeira - importação direta, sem similar nacional (CAMEX)"],
  ["7", "Estrangeira - mercado interno, sem similar nacional (CAMEX)"],
  ["8", "Nacional, conteúdo de importação > 70%"],
];

type Values = {
  tipo: string;
  codigo: string;
  descricao: string;
  unidade_medida_id: string;
  centro_custo_id: string;
  plano_contas_id: string;
  itens_marcas_id: string;
  preco_custo: string;
  margem_lucro: string;
  imposto: string;
  preco_venda: string;
  status: string;
  categoria: string;
  imagens: string[];
  observacoes: string;
  estoque_minimo: string;
  estoque_maximo: string;
  controla_estoque: string;
  ncm: string;
  cest: string;
  origem: string;
  cfop_padrao: string;
  csosn_cst: string;
  lc116: string;
  cod_tributacao_municipio: string;
  aliquota_iss: string;
};

const EMPTY: Values = {
  tipo: "Produto",
  codigo: "",
  descricao: "",
  unidade_medida_id: NONE,
  centro_custo_id: NONE,
  plano_contas_id: "",
  itens_marcas_id: NONE,
  preco_custo: "",
  margem_lucro: "",
  imposto: "",
  preco_venda: "",
  status: "true",
  categoria: "",
  imagens: [],
  observacoes: "",
  estoque_minimo: "",
  estoque_maximo: "",
  controla_estoque: "true",
  ncm: "",
  cest: "",
  origem: "",
  cfop_padrao: "",
  csosn_cst: "",
  lc116: "",
  cod_tributacao_municipio: "",
  aliquota_iss: "",
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
  /** Abre o record como cópia (novo cadastro). */
  duplicando?: boolean;
  canCreateApoio: boolean;
  onSave: (values: Row) => void;
};

export function ItemSheet({ open, onOpenChange, record, saving, readOnly, duplicando, canCreateApoio, onSave }: Props) {
  const [v, setV] = useState<Values>(EMPTY);
  const [quick, setQuick] = useState<null | "unidade" | "centro" | "marca">(null);
  const [aba, setAba] = useState<"geral" | "fiscal" | "compras">("geral");
  useEffect(() => { if (open) setAba("geral"); }, [open]);

  const { data: unidades = [] } = useTableRows("unidade_medida");
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: contas = [] } = useTableRows("plano_contas");
  const contaOpts = useMemo(() => contas.filter((c) => c["status"] !== false && String(c["codigo"] ?? "").split(".").length === 3)
    .map((c) => ({ value: String(rowId(c)), label: `${text(c["codigo"])} ${text(c["descricao"])}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [contas]);
  /** Ao escolher a categoria, preenche o que estiver vazio com o padrão fiscal/contábil. */
  const aplicarCategoria = (categoria: string) => setV((s) => {
    const refs = (rs: Row[]) => rs.filter((r) => r["status"] !== false).map((r) => ({ id: String(rowId(r)), codigo: String(r["codigo"] ?? "") }));
    const atual = { ...s, categoria, centro_custo_id: s.centro_custo_id === NONE ? "" : s.centro_custo_id };
    return { ...s, categoria, ...classificarItem(atual, refs(centros), refs(contas)) };
  });
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const { data: itens = [] } = useTableRows("itens");
  const { empresaId } = useAudit();
  void empresaId;
  const { data: precificacao } = usePrecificacao();
  const centroTree = useMemo(() => buildTree(centros, "centro_custo_pai_id"), [centros]);

  /** Próximo código sequencial por tipo: Produto → P00001…, Serviço → S00001… */
  const nextCodigoFor = (tipo: string) => {
    const prefixo = tipo.startsWith("Serviço") ? "S" : "P";
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
    if (!open) {
      setV(EMPTY);
      return;
    }
    if (!record) {
      const p = padraoPorNatureza(precificacao, EMPTY.tipo);
      setV({
        ...EMPTY,
        codigo: nextCodigo,
        margem_lucro: p?.margem ? String(p.margem) : "",
        imposto: p?.imposto ? String(p.imposto) : "",
      });
      return;
    }
    setV({
      tipo: text(pick(record, ["tipo"], "Produto")),
      codigo: duplicando ? nextCodigoFor(text(pick(record, ["tipo"], "Produto"))) : text(pick(record, ["codigo"], "")),
      descricao: text(pick(record, ["descricao"], "")) + (duplicando ? " (Cópia)" : ""),
      unidade_medida_id: text(pick(record, ["unidade_medida_id"], "")) || NONE,
      centro_custo_id: text(pick(record, ["centro_custo_id"], "")) || NONE,
      plano_contas_id: text(pick(record, ["plano_contas_id"], "")),
      itens_marcas_id: text(pick(record, ["itens_marcas_id"], "")) || NONE,
      preco_custo: text(pick(record, ["preco_custo"], "")),
      margem_lucro: text(pick(record, ["margem_lucro"], "")),
      imposto: text(pick(record, ["imposto"], "")),
      preco_venda: text(pick(record, ["preco_venda"], "")),
      status: record["status"] === false ? "false" : "true",
      categoria: text(pick(record, ["categoria"], "")),
      imagens: Array.isArray(record["imagens"]) ? (record["imagens"] as unknown[]).map(String).filter(Boolean) : [],
      observacoes: text(pick(record, ["observacoes"], "")),
      estoque_minimo: text(pick(record, ["estoque_minimo"], "")),
      estoque_maximo: text(pick(record, ["estoque_maximo"], "")),
      controla_estoque: record["controla_estoque"] === false ? "false" : "true",
      ncm: text(pick(record, ["ncm"], "")),
      cest: text(pick(record, ["cest"], "")),
      origem: text(pick(record, ["origem"], "")),
      cfop_padrao: text(pick(record, ["cfop_padrao"], "")),
      csosn_cst: text(pick(record, ["csosn_cst"], "")),
      lc116: text(pick(record, ["lc116"], "")),
      cod_tributacao_municipio: text(pick(record, ["cod_tributacao_municipio"], "")),
      aliquota_iss: text(pick(record, ["aliquota_iss"], "")),
    });
  }, [open, record, duplicando]);

  const options = useMemo(() => {
    const alfa = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
    return {
      unidade: unidades
        .map((r) => ({ value: String(rowId(r) ?? ""), label: String(pick(r, ["descricao"]) ?? "—") }))
        .sort(alfa),
      centro: centroTree.map((n) => {
        const parts = n.path.split(" > ");
        const label = parts[parts.length - 1] ?? n.path;
        const pai = parts.length > 1 ? parts[parts.length - 2] : undefined;
        return {
          value: String(rowId(n.row) ?? ""),
          label,
          depth: n.depth,
          hint: pai ? `em ${pai.split(" — ").pop()}` : undefined,
          keywords: [n.path],
        };
      }),
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
      plano_contas_id: v.plano_contas_id || null,
      itens_marcas_id: v.itens_marcas_id === NONE ? null : v.itens_marcas_id,
      preco_custo: v.preco_custo === "" ? null : num(v.preco_custo),
      margem_lucro: v.margem_lucro === "" ? null : num(v.margem_lucro),
      imposto: v.imposto === "" ? null : num(v.imposto),
      preco_venda: v.preco_venda === "" ? null : num(v.preco_venda),
      status: v.status === "true",
      categoria: v.categoria || null,
      imagens: v.imagens,
      observacoes: v.observacoes.trim() || null,
      ...(v.tipo === "Produto"
        ? {
            controla_estoque: v.controla_estoque === "true",
            estoque_minimo: v.estoque_minimo === "" ? 0 : num(v.estoque_minimo),
            estoque_maximo: v.estoque_maximo === "" ? null : num(v.estoque_maximo),
            ncm: v.ncm.replace(/\D/g, "") || null,
            cest: v.cest.replace(/\D/g, "") || null,
            origem: v.origem || null,
            cfop_padrao: v.cfop_padrao.replace(/\D/g, "") || null,
            csosn_cst: v.csosn_cst.trim() || null,
          }
        : {
            lc116: v.lc116.trim() || null,
            cod_tributacao_municipio: v.cod_tributacao_municipio.trim() || null,
            aliquota_iss: v.aliquota_iss === "" ? null : num(v.aliquota_iss),
          }),
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
      <SheetContent className="w-full overflow-y-auto pb-0 sm:max-w-[85vw] lg:max-w-3xl">
        <SheetHeader className="px-6 pb-4">
          <SheetTitle>{duplicando ? "Duplicar item" : record ? "Editar item" : "Novo item"}</SheetTitle>
        </SheetHeader>

        <fieldset disabled={readOnly} className="min-w-0 px-6 disabled:opacity-70">
          <div className="mb-2 inline-flex rounded-md border p-0.5" role="tablist">
            <Button type="button" role="tab" aria-selected={aba === "geral"} variant={aba === "geral" ? "secondary" : "ghost"} size="sm" onClick={() => setAba("geral")}>Geral</Button>
            <Button type="button" role="tab" aria-selected={aba === "fiscal"} variant={aba === "fiscal" ? "secondary" : "ghost"} size="sm" onClick={() => setAba("fiscal")}>Fiscal</Button>
            <Button type="button" role="tab" aria-selected={aba === "compras"} variant={aba === "compras" ? "secondary" : "ghost"} size="sm" onClick={() => setAba("compras")}>Compras</Button>
          </div>
          <div className={aba === "geral" ? "grid gap-x-4 gap-y-5 pt-2 sm:grid-cols-2" : "hidden"}>
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
                Natureza
              </Label>
              <Select
                value={v.tipo}
                onValueChange={(value) => {
                  setV((s) => {
                    const auto = /^[PS]\d{5,}$/i.test(s.codigo) || s.codigo === "";
                    const prefixo = value.startsWith("Serviço") ? "S" : "P";
                    const mudouPrefixo = !s.codigo.toUpperCase().startsWith(prefixo);
                    const trocar = auto && (!record || mudouPrefixo);
                    return { ...s, tipo: value, codigo: trocar ? nextCodigoFor(value) : s.codigo };
                  });
                  const p = padraoPorNatureza(precificacao, value);
                  if (p && (p.margem || p.imposto))
                    setPricing({ margem_lucro: String(p.margem), imposto: String(p.imposto) });
                }}
              >
                <SelectTrigger id="tipo">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Produto">Produto</SelectItem>
                  <SelectItem value="Serviço">Serviço avulso</SelectItem>
                  <SelectItem value="Serviço Recorrente">Serviço recorrente (mensal)</SelectItem>
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

            <div className="min-w-0 space-y-1.5">
              <Label className="block text-sm font-medium">Categoria</Label>
              <SearchSelect value={v.categoria} disabled={readOnly} placeholder="Escolha a categoria"
                options={CATEGORIAS_ITENS.map((c) => ({ value: c, label: c }))}
                onChange={aplicarCategoria} />
              <p className="text-xs text-muted-foreground">Ao escolher, Centro de Custo, Conta Contábil e o fiscal vazios são preenchidos sozinhos.</p>
            </div>
            {selectRow("unidade_medida_id", "Unidade de Medida", options.unidade, "unidade")}
            {selectRow("centro_custo_id", "Centro de Custo", options.centro, "centro")}
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label className="block text-sm font-medium">Conta Contábil (Plano de Contas)</Label>
              <SearchSelect value={v.plano_contas_id} disabled={readOnly} options={contaOpts} placeholder="Não informado"
                searchPlaceholder="Pesquisar…" onChange={(x) => setV((s) => ({ ...s, plano_contas_id: x }))} />
            </div>
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

            {v.tipo === "Produto" && (
              <>
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor="controla_estoque" className="block text-sm font-medium">
                    Controla estoque
                  </Label>
                  <div className="bg-background flex h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="text-muted-foreground text-sm">{v.controla_estoque === "true" ? "Sim" : "Não"}</span>
                    <Switch
                      id="controla_estoque"
                      checked={v.controla_estoque === "true"}
                      onCheckedChange={(c) => setV((s) => ({ ...s, controla_estoque: String(c) }))}
                    />
                  </div>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="estoque_minimo" className="block text-sm font-medium">Estoque mínimo</Label>
                  <Input id="estoque_minimo" type="number" step="0.001" value={v.estoque_minimo} onChange={(e) => setV((s) => ({ ...s, estoque_minimo: e.target.value }))} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="estoque_maximo" className="block text-sm font-medium">Estoque máximo</Label>
                  <Input id="estoque_maximo" type="number" step="0.001" value={v.estoque_maximo} onChange={(e) => setV((s) => ({ ...s, estoque_maximo: e.target.value }))} />
                </div>
              </>
            )}


            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="observacoes" className="block text-sm font-medium">
                Observações
              </Label>
              <Textarea
                id="observacoes"
                rows={4}
                value={v.observacoes}
                onChange={(e) => setV((s) => ({ ...s, observacoes: e.target.value }))}
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
          {aba === "compras" && (
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold">Últimas compras</h3>
              {record && !duplicando ? <HistoricoCompras itemId={String(rowId(record) ?? "")} /> : <p className="text-muted-foreground text-sm">Salve o item para ver o histórico de compras.</p>}
            </div>
          )}
          <div className={aba === "fiscal" ? "grid gap-x-4 gap-y-5 pt-2 sm:grid-cols-2" : "hidden"}>
            <div className="min-w-0 sm:col-span-2">
              <h3 className="text-sm font-semibold">Dados fiscais</h3>
              <p className="text-muted-foreground text-xs">
                {v.tipo === "Produto" ? "Usados na emissão de NF-e / NFC-e." : "Usados na emissão de NFS-e."}
              </p>
            </div>
            {v.tipo === "Produto" ? (
              <>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="ncm" className="block text-sm font-medium">NCM</Label>
                  <NcmBusca value={v.ncm} onChange={(ncm) => setV((s) => ({ ...s, ncm }))} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="cest" className="block text-sm font-medium">CEST</Label>
                  <Input id="cest" placeholder="7 dígitos (se houver ST)" maxLength={9} value={v.cest} onChange={(e) => setV((s) => ({ ...s, cest: e.target.value }))} />
                </div>
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor="origem" className="block text-sm font-medium">Origem da mercadoria</Label>
                  <Select value={v.origem} onValueChange={(val) => setV((s) => ({ ...s, origem: val }))}>
                    <SelectTrigger id="origem"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {ORIGENS.map(([c, l]) => (
                        <SelectItem key={c} value={c}>{c} - {l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="cfop_padrao" className="block text-sm font-medium">CFOP padrão de saída</Label>
                  <Input id="cfop_padrao" placeholder="Ex.: 5102" maxLength={5} value={v.cfop_padrao} onChange={(e) => setV((s) => ({ ...s, cfop_padrao: e.target.value }))} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="csosn_cst" className="block text-sm font-medium">CSOSN / CST</Label>
                  <Input id="csosn_cst" placeholder="Ex.: 102 (Simples) ou 00" maxLength={4} value={v.csosn_cst} onChange={(e) => setV((s) => ({ ...s, csosn_cst: e.target.value }))} />
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="lc116" className="block text-sm font-medium">Item da LC 116/2003</Label>
                  <Input id="lc116" placeholder="Ex.: 14.01" value={v.lc116} onChange={(e) => setV((s) => ({ ...s, lc116: e.target.value }))} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="cod_tributacao_municipio" className="block text-sm font-medium">Código de tributação municipal</Label>
                  <Input id="cod_tributacao_municipio" placeholder="Conforme a prefeitura" value={v.cod_tributacao_municipio} onChange={(e) => setV((s) => ({ ...s, cod_tributacao_municipio: e.target.value }))} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="aliquota_iss" className="block text-sm font-medium">Alíquota de ISS (%)</Label>
                  <Input id="aliquota_iss" placeholder="Ex.: 5" type="number" step="0.01" value={v.aliquota_iss} onChange={(e) => setV((s) => ({ ...s, aliquota_iss: e.target.value }))} />
                </div>
              </>
            )}
          </div>
        </fieldset>

        <div className="bg-background sticky bottom-0 z-10 mt-4 flex justify-end gap-2 border-t px-6 py-4">
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
