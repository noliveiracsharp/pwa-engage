import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, FileSignature, FileText } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrcamentoSheet } from "@/components/orcamentos/OrcamentoSheet";
import { OrcamentoPDF } from "@/components/orcamentos/OrcamentoPDF";
import { PropostaDialog } from "@/components/orcamentos/PropostaDialog";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import { useAlterarSituacao, useSaveOrcamento } from "@/hooks/useSaveOrcamento";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAuth } from "@/hooks/useAuth";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { matchesAny } from "@/lib/input-masks";
import { daysUntil, formatBRL, formatDate, situacaoOf, SITUACOES, yearOf } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orcamentos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Ofertas — Atende.ai" },
      {
        name: "description",
        content:
          "Ofertas de produtos e serviços com numeração automática, situação e memória de cálculo de lucratividade.",
      },
      { property: "og:title", content: "Ofertas — Atende.ai" },
      {
        property: "og:description",
        content:
          "Ofertas de produtos e serviços com numeração automática, situação e memória de cálculo de lucratividade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrcamentosPage,
});

const SITUACAO_FILTRO = [
  { value: "todos", label: "Todas" },
  ...SITUACOES.map((s) => ({ value: s.value, label: s.label })),
];

function mesmaEmpresa(row: Row, empresaId: string | number | undefined) {
  return (
    empresaId === undefined || !row["empresa_id"] || String(row["empresa_id"]) === String(empresaId)
  );
}

function OrcamentosPage() {
  const perms = usePagePermissions("/orcamentos");
  const { empresaId, usuarioId } = useAudit();
  const { empresa } = useAuth();
  const { data: todos = [], isLoading } = useTableRows("orcamentos");
  const { data: todasLinhas = [] } = useTableRows("orcamento_itens");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: itens = [] } = useTableRows("itens");
  const { data: unidades = [] } = useTableRows("unidade_medida");
  const { data: marcas = [] } = useTableRows("itens_marcas");
  const { data: empresas = [] } = useTableRows("empresas");
  const save = useSaveOrcamento();
  const alterarSituacao = useAlterarSituacao();
  const remove = useDeleteRecord("orcamentos");

  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Row | null>(null);
  const [propostaOpen, setPropostaOpen] = useState(false);
  const [f, setF] = useState({ busca: "", situacao: "todos", vendedor: "todos", ano: "todos" });

  const escopo = useMemo(() => todos.filter((r) => mesmaEmpresa(r, empresaId)), [todos, empresaId]);
  const clientes = useMemo(
    () => parceiros.filter((p) => mesmaEmpresa(p, empresaId) && p["is_cliente"] === true),
    [parceiros, empresaId],
  );
  const vendedores = useMemo(
    () => usuarios.filter((u) => mesmaEmpresa(u, empresaId)),
    [usuarios, empresaId],
  );
  const itensEmpresa = useMemo(
    () => itens.filter((i) => mesmaEmpresa(i, empresaId)),
    [itens, empresaId],
  );
  // Unidades e marcas são catálogos compartilhados: nunca filtrar por empresa.
  const unidadesEmpresa = unidades;
  const marcasEmpresa = marcas;

  const parceiroById = useMemo(
    () => new Map(parceiros.map((p) => [String(rowId(p) ?? ""), p])),
    [parceiros],
  );
  const usuarioById = useMemo(
    () => new Map(usuarios.map((u) => [String(rowId(u) ?? ""), u])),
    [usuarios],
  );
  const qtdItensPorOrcamento = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of todasLinhas) {
      const k = String(l["orcamento_id"] ?? "");
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [todasLinhas]);

  const linhasRecord = useMemo(() => {
    if (!record) return [] as Row[];
    const id = String(rowId(record) ?? "");
    return todasLinhas.filter((l) => String(l["orcamento_id"] ?? "") === id);
  }, [todasLinhas, record]);

  const linhasPreview = useMemo(() => {
    if (!preview) return [] as Row[];
    const id = String(rowId(preview) ?? "");
    return todasLinhas.filter((l) => String(l["orcamento_id"] ?? "") === id);
  }, [todasLinhas, preview]);

  const nomeCliente = (r: Row) => {
    const p = parceiroById.get(String(pick(r, ["parceiro_id", "parceiros_id"]) ?? ""));
    return p ? String(p["razao_social"] ?? p["nome_fantasia"] ?? "—") : "";
  };
  const nomeVendedor = (r: Row) => {
    const u = usuarioById.get(String(pick(r, ["usuario_id", "vendedor_id"]) ?? ""));
    return u ? String(pick(u, ["nome", "email"]) ?? "—") : "";
  };

  const anos = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const r of escopo) {
      const y = yearOf(r["dt_orcamento"]);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [escopo]);

  const rows = useMemo(
    () =>
      escopo
        .filter(
          (r) =>
            matchesAny([r["numero"], nomeCliente(r), nomeVendedor(r), r["descricao"]], f.busca) &&
            (f.situacao === "todos" || situacaoOf(r["situacao"]) === f.situacao) &&
            (f.vendedor === "todos" ||
              String(pick(r, ["usuario_id", "vendedor_id"]) ?? "") === f.vendedor) &&
            (f.ano === "todos" || String(yearOf(r["dt_orcamento"]) ?? "") === f.ano),
        )
        .sort((a, b) => {
          const da = String(a["dt_orcamento"] ?? "");
          const db = String(b["dt_orcamento"] ?? "");
          if (da !== db) return db.localeCompare(da);
          return Number(b["sequencia"] ?? 0) - Number(a["sequencia"] ?? 0);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escopo, f, parceiroById, usuarioById],
  );

  const columns: Column[] = [
    {
      key: "numero",
      header: "Número",
      fields: ["numero"],
      render: (r) => (
        <div>
          <div className="font-semibold tabular-nums">{String(r["numero"] ?? "—")}</div>
          <div className="text-muted-foreground text-xs">
            {qtdItensPorOrcamento.get(String(rowId(r) ?? "")) ?? 0}{" "}
            {qtdItensPorOrcamento.get(String(rowId(r) ?? "")) === 1 ? "item" : "itens"}
          </div>
        </div>
      ),
    },
    {
      key: "dt_orcamento",
      header: "Data",
      fields: ["dt_orcamento"],
      render: (r) => formatDate(r["dt_orcamento"]),
    },
    {
      key: "cliente",
      header: "Cliente",
      fields: ["parceiro_id"],
      render: (r) => {
        const nome = nomeCliente(r);
        return (
          <div className="max-w-64 truncate" title={nome || undefined}>
            {nome || <span className="text-muted-foreground">—</span>}
            {r["descricao"] ? (
              <div className="text-muted-foreground truncate text-xs">{String(r["descricao"])}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "vendedor",
      header: "Vendedor",
      fields: ["usuario_id"],
      render: (r) => nomeVendedor(r) || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "validade_orcamento",
      header: "Validade",
      fields: ["validade_orcamento"],
      render: (r) => {
        const dias = daysUntil(r["validade_orcamento"]);
        const emAndamento = situacaoOf(r["situacao"]) === "Em andamento";
        return (
          <div>
            <div>{formatDate(r["validade_orcamento"])}</div>
            {emAndamento && dias !== null && (
              <div
                className={cn(
                  "text-xs",
                  dias < 0
                    ? "text-destructive font-medium"
                    : dias <= 3
                      ? "text-warning-foreground"
                      : "text-muted-foreground",
                )}
              >
                {dias < 0
                  ? `Vencido há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`
                  : dias === 0
                    ? "Vence hoje"
                    : `Vence em ${dias} ${dias === 1 ? "dia" : "dias"}`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "total_liquido",
      header: "Total líquido",
      fields: ["total_liquido"],
      className: "text-right",
      render: (r) => (
        <span className="font-semibold tabular-nums">{formatBRL(r["total_liquido"])}</span>
      ),
    },
    {
      key: "situacao",
      header: "Situação",
      fields: ["situacao"],
      render: (r) =>
        perms.canUpdate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Alterar situação"
                title="Alterar situação"
              >
                <SituacaoBadge value={r["situacao"]} />
                <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {SITUACOES.map((s) => (
                <DropdownMenuItem
                  key={s.value}
                  disabled={situacaoOf(r["situacao"]) === s.value || alterarSituacao.isPending}
                  onClick={() => alterarSituacao.mutate({ row: r, situacao: s.value })}
                >
                  <span className={cn("mr-2 h-2.5 w-2.5 rounded-full", s.dot)} />
                  {s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SituacaoBadge value={r["situacao"]} />
        ),
    },
    {
      key: "pdf",
      header: "Proposta",
      fields: [],
      render: (r) => (
        <div className="flex">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Visualizar proposta em PDF"
          title="Visualizar proposta em PDF"
          onClick={() => {
            setPreview(r);
            setPreviewOpen(true);
          }}
        >
          <FileText className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Proposta digital e contrato"
          title="Proposta digital e contrato"
          onClick={() => {
            setPreview(r);
            setPropostaOpen(true);
          }}
        >
          <FileSignature className="h-4 w-4" />
        </Button>
        </div>
      ),
    },
  ];

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <>
      <DataTable
        title="Ofertas"
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={
          perms.canCreate
            ? () => {
                setRecord(null);
                setOpen(true);
              }
            : undefined
        }
        onEdit={(row) => {
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
              placeholder="Número, cliente, vendedor ou descrição"
            />
            <FilterSelect
              label="Situação"
              value={f.situacao}
              onChange={(v) => setF({ ...f, situacao: v })}
              options={SITUACAO_FILTRO}
            />
            <FilterSelect
              label="Vendedor"
              value={f.vendedor}
              onChange={(v) => setF({ ...f, vendedor: v })}
              options={[
                { value: "todos", label: "Todos" },
                ...vendedores
                  .map((u) => ({
                    value: String(rowId(u) ?? ""),
                    label: String(pick(u, ["nome", "email"]) ?? "—"),
                  }))
                  .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
              ]}
            />
            <FilterSelect
              label="Ano"
              value={f.ano}
              onChange={(v) => setF({ ...f, ano: v })}
              options={[
                { value: "todos", label: "Todos" },
                ...anos.map((y) => ({ value: String(y), label: String(y) })),
              ]}
            />
          </>
        }
      />

      <OrcamentoSheet
        open={open}
        onOpenChange={setOpen}
        record={record}
        linhasRecord={linhasRecord}
        saving={save.isPending}
        readOnly={record ? !perms.canUpdate : !perms.canCreate}
        clientes={clientes}
        vendedores={vendedores}
        itens={itensEmpresa}
        unidades={unidadesEmpresa}
        marcas={marcasEmpresa}
        vendedorPadraoId={usuarioId !== undefined ? String(usuarioId) : undefined}
        onPreview={
          record
            ? () => {
                setPreview(record);
                setPreviewOpen(true);
              }
            : undefined
        }
        onSave={({ header, linhas }) =>
          save.mutate({ header, linhas, original: record }, { onSuccess: () => setOpen(false) })
        }
      />

      <OrcamentoPDF
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        orcamento={preview}
        linhas={linhasPreview}
        empresa={empresas.find((e) => String(rowId(e) ?? "") === String(preview?.["empresa_id"] ?? empresaId ?? "")) ?? empresa}
        cliente={parceiroById.get(
          String(preview ? (pick(preview, ["parceiro_id", "parceiros_id"]) ?? "") : ""),
        )}
        vendedor={usuarioById.get(
          String(preview ? (pick(preview, ["usuario_id", "vendedor_id"]) ?? "") : ""),
        )}
        itens={itens}
        unidades={unidades}
        marcas={marcas}
      />

      <PropostaDialog
        open={propostaOpen}
        onOpenChange={setPropostaOpen}
        orcamento={preview ? (todos.find((t) => rowId(t) === rowId(preview)) ?? preview) : null}
        linhas={linhasPreview}
        empresa={empresas.find((e) => String(rowId(e) ?? "") === String(preview?.["empresa_id"] ?? empresaId ?? "")) ?? empresa}
        cliente={parceiroById.get(
          String(preview ? (pick(preview, ["parceiro_id", "parceiros_id"]) ?? "") : ""),
        )}
        vendedor={usuarioById.get(
          String(preview ? (pick(preview, ["usuario_id", "vendedor_id"]) ?? "") : ""),
        )}
        itens={itens}
        unidades={unidades}
        marcas={marcas}
      />
    </>
  );
}
