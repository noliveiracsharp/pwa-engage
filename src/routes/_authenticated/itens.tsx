import { useMemo, useState } from "react";
import { RelatorioLista } from "@/components/relatorios/RelatorioLista";
import { Ban, CheckCircle2, ChevronDown, FileText, ImageIcon, Landmark, Package, Settings2, Trash2, Wand2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BarraAcoesLote, useAcoesComuns } from "@/components/data-table/AcoesLote";
import { Button } from "@/components/ui/button";
import { PrecificacaoDialog } from "@/components/itens/PrecificacaoDialog";
import { FiscalContadorDialog } from "@/components/itens/FiscalContadorDialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Tags } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { ItemSheet } from "@/components/itens/ItemSheet";
import { ReajusteOfertasDialog } from "@/components/itens/ReajusteOfertasDialog";
import type { NovoPreco } from "@/lib/reajuste-itens";
import { ImagensCarrosselDialog } from "@/components/itens/ImagensCarrosselDialog";
import { rowId, useDeleteRecord, useSaveRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { useAudit } from "@/lib/audit";
import { pick, type Row } from "@/lib/row";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useCategoriasItens } from "@/lib/itens-categorias";
import { classificarItem } from "@/lib/itens-classificacao";

export const Route = createFileRoute("/_authenticated/itens")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Produtos e Serviços — Atende.ai" },
      { name: "description", content: "Cadastro de produtos e serviços com formação automática de preço de venda." },
      { property: "og:title", content: "Produtos e Serviços — Atende.ai" },
      {
        property: "og:description",
        content: "Cadastro de produtos e serviços com formação automática de preço de venda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ItensPage,
});

const brl = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || value === null || value === undefined || value === "") return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

const TIPO_OPTIONS = [
  { value: "Produto", label: "Produto" },
  { value: "Serviço", label: "Serviço avulso" },
  { value: "Serviço Recorrente", label: "Serviço recorrente" },
];

const SEM_CATEGORIA = "__sem_categoria__";

function FilterMulti({ label, value, onChange, options }: { label: string; value: string[]; onChange: (v: string[]) => void; options: { value: string; label: string }[] }) {
  const resumo = value.length === 0 || value.length === options.length ? "Todas" : options.filter((o) => value.includes(o.value)).map((o) => o.label).join(", ");
  return (
    <div>
      <Label className="text-muted-foreground mb-1.5 block text-xs tracking-wide uppercase">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className="truncate">{resumo}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          {options.map((o) => (
            <label key={o.value} className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
              <Checkbox
                checked={value.includes(o.value)}
                onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((x) => x !== o.value))}
              />
              {o.label}
            </label>
          ))}
          {value.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>
              Limpar
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ItensPage() {
  const perms = usePagePermissions("/itens");
  const { data: rows = [], isLoading } = useTableRows("itens");
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const save = useSaveRecord("itens");
  const remove = useDeleteRecord("itens");
  const { stamp } = useAudit();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const lote = useAcoesComuns("itens");
  const { data: centrosCC = [] } = useTableRows("centro_custo");
  const { data: contasPC = [] } = useTableRows("plano_contas");
  const refs = (rs: Row[]) => rs.filter((r) => r["status"] !== false).map((r) => ({ id: String(rowId(r)), codigo: String(r["codigo"] ?? "") }));
  const categoriasItens = useCategoriasItens();
  const classificar = (sobrescrever: boolean) => async (row: Row) => {
    const mud = classificarItem(row, refs(centrosCC), refs(contasPC), sobrescrever, categoriasItens.cadastradas);
    if (!Object.keys(mud).length) return { ok: true, mensagem: row["categoria"] ? "Já classificado" : "Sem categoria" };
    return lote.atualizar(row, mud);
  };
  const [duplicando, setDuplicando] = useState(false);
  const [f, setF] = useState<{ busca: string; tipos: string[]; categoria: string; status: string }>({ busca: "", tipos: [], categoria: "todos", status: "todos" });
  const [precOpen, setPrecOpen] = useState(false);
  const [reajuste, setReajuste] = useState<{ itemId: string; nome: string; novo: NovoPreco } | null>(null);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [galeria, setGaleria] = useState<{ titulo: string; imagens: string[] } | null>(null);

  const marcaById = useMemo(() => {
    const map = new Map<string, Row>();
    for (const m of marcas) map.set(String(rowId(m) ?? ""), m);
    return map;
  }, [marcas]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const marca = marcaById.get(String(pick(row, ["itens_marcas_id"]) ?? ""));
        return (
          matchesAny(
            [pick(row, ["codigo"]), pick(row, ["descricao"]), pick(row, ["modelo"]), pick(row, ["tipo"]), pick(row, ["categoria"]), pick(marca ?? {}, ["descricao"])],
            f.busca,
          ) &&
          (f.tipos.length === 0 || f.tipos.includes(String(pick(row, ["tipo"]) ?? ""))) &&
          (f.categoria === "todos" ||
            (f.categoria === SEM_CATEGORIA ? !String(row["categoria"] ?? "").trim() : String(row["categoria"] ?? "") === f.categoria)) &&
          (f.status === "todos" || (f.status === "ativo" ? row["status"] === true : row["status"] === false))
        );
      }),
    [rows, f, marcaById],
  );

  const columns: Column[] = [
    {
      key: "imagem",
      header: "Imagem",
      fields: ["imagens"],
      sortable: false,
      render: (row) => {
        const imgs = row["imagens"];
        const lista = Array.isArray(imgs) ? imgs.map(String).filter(Boolean) : [];
        const first = lista[0] ?? "";
        return first ? (
          <button
            type="button"
            title="Ver imagens"
            className="relative block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={(e) => {
              e.stopPropagation();
              setGaleria({ titulo: String(pick(row, ["descricao"]) ?? "Imagens"), imagens: lista });
            }}
          >
            <img src={first} alt="" className="border-border h-10 w-10 cursor-pointer rounded-md border object-cover transition hover:opacity-80" />
            {lista.length > 1 && (
              <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 rounded-full px-1.5 text-[10px] font-semibold">
                {lista.length}
              </span>
            )}
          </button>
        ) : (
          <span className="bg-muted text-muted-foreground border-border flex h-10 w-10 items-center justify-center rounded-md border">
            <ImageIcon className="h-4 w-4" />
          </span>
        );
      },
    },
    { key: "codigo", header: "Código", fields: ["codigo"] },
    {
      key: "descricao",
      header: "Descrição",
      fields: ["descricao"],
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="flex flex-col">
            <span>{String(pick(row, ["descricao"]) ?? "—")}</span>
            {pick(row, ["modelo"]) ? <span className="text-muted-foreground text-xs">Modelo: {String(pick(row, ["modelo"]))}</span> : null}
          </span>
          {row["pendente_compras"] === true && (
            <span className="bg-warning/15 text-warning rounded-full px-2 py-0.5 text-[10px] font-semibold" title="Cadastrado em campo pelo técnico">Pendente de Compras</span>
          )}
        </span>
      ),
    },
    { key: "tipo", header: "Natureza", fields: ["tipo"] },
    { key: "categoria", header: "Categoria", fields: ["categoria"], render: (row) => String(row["categoria"] ?? "—") },
    {
      key: "marca",
      header: "Marca",
      fields: ["itens_marcas_id"],
      render: (row) => {
        const marca = marcaById.get(String(pick(row, ["itens_marcas_id"]) ?? ""));
        if (!marca) return "—";
        const foto = pick(marca, ["foto"]);
        const nome = String(pick(marca, ["descricao"]) ?? "—");
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            {foto ? (
              <img src={foto} alt={nome} className="border-border h-7 w-7 shrink-0 rounded-full border object-cover" />
            ) : (
              <span className="bg-muted text-muted-foreground border-border flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
                <Package className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="max-w-[120px] truncate">{nome}</span>
          </div>
        );
      },
    },
    {
      key: "preco_venda",
      header: "Preço de Venda",
      fields: ["preco_venda"],
      render: (row) => brl(pick(row, ["preco_venda"])),
    },
    {
      key: "status",
      header: "Status",
      fields: ["status"],
      render: (row) => <StatusBadge value={row["status"]} />,
    },
  ];

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setRelOpen(true)}>
            <FileText className="mr-2 h-4 w-4" /> Relatório
          </Button>
        {perms.canUpdate && (
          <>
            <Button variant="outline" size="sm" onClick={() => setFiscalOpen(true)}>
              <Landmark className="mr-2 h-4 w-4" /> Dados fiscais (contador)
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPrecOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" /> Parâmetros de Precificação
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/itens_categorias"><Tags className="mr-2 h-4 w-4" /> Categorias</Link>
            </Button>
          </>
        )}
        </div>
        <DataTable
          title="Produtos e Serviços"
          columns={columns}
          rows={filtered}
          loading={isLoading}
          getValue={(row, keys) => pick(row, keys)}
          rowKey={(row, i) => String(rowId(row) ?? i)}
          onAdd={
            perms.canCreate
              ? () => {
                  setRecord(null);
                  setDuplicando(false);
                  setOpen(true);
                }
              : undefined
          }
          onDuplicate={
            perms.canCreate
              ? (row) => {
                  setRecord(row);
                  setDuplicando(true);
                  setOpen(true);
                }
              : undefined
          }
          onEdit={(row) => {
            setDuplicando(false);
            setRecord(row);
            setOpen(true);
          }}
          editReadOnly={!perms.canUpdate}
          onDelete={perms.canDelete ? (row) => remove.mutate(row) : undefined}
          selection={{ selected: sel, onChange: setSel }}
          bulkBar={
            <BarraAcoesLote
              tabela="itens"
              selecionados={filtered.filter((r, i) => sel.has(String(rowId(r) ?? i)))}
              totalFiltrado={filtered.length}
              rotulo={(r) => String(pick(r, ["nome", "descricao"], "—"))}
              onSelecionarTodos={() => setSel(new Set(filtered.map((r, i) => String(rowId(r) ?? i))))}
              onLimpar={() => setSel(new Set())}
              acoes={[
                ...(perms.canUpdate ? [
                  { label: "Ativar", icon: <CheckCircle2 className="h-4 w-4" />, executar: lote.definirStatus(true) },
                  { label: "Inativar", icon: <Ban className="h-4 w-4" />, confirmacao: "Inativar {n} item(ns)?", executar: lote.definirStatus(false) },
                  { label: "Classificar automaticamente (preencher vazios)", icon: <Wand2 className="h-4 w-4" />, executar: classificar(false) },
                  { label: "Reclassificar tudo pela categoria", icon: <Wand2 className="h-4 w-4" />, confirmacao: "Substituir Centro de Custo, Conta Contábil, CFOP, CSOSN e Origem de {n} item(ns) pelo padrão da categoria?", executar: classificar(true) },
                ] : []),
                ...(perms.canDelete ? [{ label: "Excluir", icon: <Trash2 className="h-4 w-4" />, destrutiva: true, confirmacao: "Excluir permanentemente {n} item(ns)? Os usados em ofertas serão mantidos.", executar: lote.excluir }] : []),
              ]}
            />
          }
          filters={
            <>
              <FilterInput
                label="Buscar"
                value={f.busca}
                onChange={(v) => setF({ ...f, busca: v })}
                placeholder="Código, descrição, marca ou modelo"
              />
              <FilterMulti
                label="Natureza"
                value={f.tipos}
                onChange={(v) => setF({ ...f, tipos: v })}
                options={TIPO_OPTIONS}
              />
              <FilterSelect
                label="Categoria"
                value={f.categoria}
                onChange={(v) => setF({ ...f, categoria: v })}
                options={[
                  { value: "todos", label: "Todas" },
                  { value: SEM_CATEGORIA, label: "Sem categoria" },
                  ...categoriasItens.nomes.map((c) => ({ value: c, label: c })),
                ]}
              />
              <FilterSelect
                label="Status"
                value={f.status}
                onChange={(v) => setF({ ...f, status: v })}
                options={STATUS_OPTIONS}
              />
            </>
          }
        />
      </div>


      <ItemSheet
        open={open}
        onOpenChange={setOpen}
        record={record}
        saving={save.isPending}
        readOnly={record && !duplicando ? !perms.canUpdate : !perms.canCreate}
        duplicando={duplicando}
        canCreateApoio={perms.canCreate}
        onSave={(values) => {
          const original = duplicando ? null : record;
          const n = (x: unknown) => (x === null || x === undefined || x === "" ? null : Number(x));
          const mudou =
            original &&
            (n(original["preco_custo"]) !== n(values["preco_custo"]) ||
              n(original["preco_venda"]) !== n(values["preco_venda"]) ||
              n(original["imposto"]) !== n(values["imposto"]));
          // Ao Compras salvar o item completo, sai da pendência criada em campo.
          const vals = original?.["pendente_compras"] === true ? { ...values, pendente_compras: false } : values;
          save.mutate(
            { values: stamp(vals, !original), original },
            {
              onSuccess: () => {
                setOpen(false);
                setRecord(null);
                setDuplicando(false);
                if (mudou && original) {
                  setReajuste({
                    itemId: String(rowId(original)),
                    nome: String(values["descricao"] ?? original["descricao"] ?? ""),
                    novo: { preco_custo: n(values["preco_custo"]) ?? 0, preco_venda: n(values["preco_venda"]), imposto: n(values["imposto"]) ?? 0 },
                  });
                }
              },
            },
          );
        }}
      />
      {reajuste && (
        <ReajusteOfertasDialog
          open
          onOpenChange={(o) => !o && setReajuste(null)}
          itemId={reajuste.itemId}
          itemNome={reajuste.nome}
          novo={reajuste.novo}
        />
      )}
      {relOpen && (
        <RelatorioLista
          titulo="Relatório de Produtos e Serviços"
          rotulo="Cadastro de itens"
          rows={filtered}
          filtros={[
            f.busca && `Busca: ${f.busca}`,
            f.tipos.length > 0 && `Natureza: ${TIPO_OPTIONS.filter((o) => f.tipos.includes(o.value)).map((o) => o.label).join(", ")}`,
            f.categoria !== "todos" && `Categoria: ${f.categoria === SEM_CATEGORIA ? "Sem categoria" : f.categoria}`,
            f.status !== "todos" && `Status: ${f.status === "ativo" ? "Ativo" : "Inativo"}`,
          ].filter((x): x is string => Boolean(x))}
          kpis={[
            { label: "Total de itens", valor: filtered.length },
            { label: "Custo em catálogo", valor: brl(filtered.reduce((s, r) => s + (Number(r["preco_custo"]) || 0), 0)) },
            { label: "Venda média", valor: brl(filtered.length ? filtered.reduce((s, r) => s + (Number(r["preco_venda"]) || 0), 0) / filtered.length : 0) },
            { label: "Margem média", valor: (() => { const m = filtered.map((r) => Number(r["margem_lucro"])).filter((x) => x > 0); return m.length ? `${(m.reduce((a, b) => a + b, 0) / m.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"; })() },
          ]}
          colunas={[
            { header: "Código", cell: (r) => String(r["codigo"] ?? "—") },
            { header: "Descrição", cell: (r) => String(r["descricao"] ?? "—") },
            { header: "Categoria", cell: (r) => String(r["categoria"] ?? "—") },
            { header: "Natureza", cell: (r) => String(r["tipo"] ?? "—") },
            { header: "Marca", cell: (r) => String(marcaById.get(String(r["itens_marcas_id"] ?? ""))?.["descricao"] ?? "—") },
            { header: "Un.", cell: (r) => String(r["unidade"] ?? "—") },
            { header: "NCM", cell: (r) => String(r["ncm"] ?? "—") },
            { header: "Custo (R$)", right: true, cell: (r) => brl(r["preco_custo"]) },
            { header: "Venda (R$)", right: true, cell: (r) => brl(r["preco_venda"]) },
            { header: "Status", cell: (r) => (r["status"] === false ? "Inativo" : "Ativo") },
          ]}
          chave={(r, i) => String(rowId(r) ?? i)}
          onClose={() => setRelOpen(false)}
        />
      )}
      <PrecificacaoDialog open={precOpen} onOpenChange={setPrecOpen} />
      <FiscalContadorDialog open={fiscalOpen} onOpenChange={setFiscalOpen} itens={rows as Row[]} />
      <ImagensCarrosselDialog
        open={galeria !== null}
        onOpenChange={(o) => !o && setGaleria(null)}
        titulo={galeria?.titulo ?? ""}
        imagens={galeria?.imagens ?? []}
      />
    </div>
  );
}
