import { useMemo, useState } from "react";
import { ImageIcon, Landmark, Package, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrecificacaoDialog } from "@/components/itens/PrecificacaoDialog";
import { FiscalContadorDialog } from "@/components/itens/FiscalContadorDialog";
import { createFileRoute } from "@tanstack/react-router";
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
  { value: "todos", label: "Todos" },
  { value: "Produto", label: "Produto" },
  { value: "Serviço", label: "Serviço avulso" },
  { value: "Serviço Recorrente", label: "Serviço recorrente" },
];

function ItensPage() {
  const perms = usePagePermissions("/itens");
  const { data: rows = [], isLoading } = useTableRows("itens");
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const save = useSaveRecord("itens");
  const remove = useDeleteRecord("itens");
  const { stamp } = useAudit();
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const [f, setF] = useState({ busca: "", tipo: "todos", status: "todos" });
  const [precOpen, setPrecOpen] = useState(false);
  const [reajuste, setReajuste] = useState<{ itemId: string; nome: string; novo: NovoPreco } | null>(null);
  const [fiscalOpen, setFiscalOpen] = useState(false);
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
            [pick(row, ["codigo"]), pick(row, ["descricao"]), pick(row, ["tipo"]), pick(marca ?? {}, ["descricao"])],
            f.busca,
          ) &&
          (f.tipo === "todos" || String(pick(row, ["tipo"]) ?? "") === f.tipo) &&
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
    { key: "descricao", header: "Descrição", fields: ["descricao"] },
    { key: "tipo", header: "Natureza", fields: ["tipo"] },
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
        {perms.canUpdate && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setFiscalOpen(true)}>
              <Landmark className="mr-2 h-4 w-4" /> Dados fiscais (contador)
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPrecOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" /> Parâmetros de Precificação
            </Button>
          </div>
        )}
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
          filters={
            <>
              <FilterInput
                label="Buscar"
                value={f.busca}
                onChange={(v) => setF({ ...f, busca: v })}
                placeholder="Código, descrição ou marca"
              />
              <FilterSelect
                label="Natureza"
                value={f.tipo}
                onChange={(v) => setF({ ...f, tipo: v })}
                options={TIPO_OPTIONS}
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
          save.mutate(
            { values: stamp(values, !original), original },
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
