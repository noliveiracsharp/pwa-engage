import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import { Button } from "@/components/ui/button";
import type { Column } from "@/components/data-table/DataTable";
import type { Field } from "@/components/data-table/RecordSheet";
import { StatusBadge } from "@/components/data-table/StatusBadge";
import { rowId, text, useTableRows } from "@/lib/crud";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/itens_categorias")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Categorias de Produtos e Serviços — Atende.ai" },
      { name: "description", content: "Categorias do catálogo com centro de custo, conta gerencial e padrão fiscal preenchidos automaticamente." },
      { property: "og:title", content: "Categorias de Produtos e Serviços — Atende.ai" },
      { property: "og:description", content: "Categorias do catálogo com centro de custo, conta gerencial e padrão fiscal preenchidos automaticamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CategoriasItensPage,
});

const ORIGENS = [
  { value: "0", label: "0 — Nacional" },
  { value: "1", label: "1 — Estrangeira (importação direta)" },
  { value: "2", label: "2 — Estrangeira (mercado interno)" },
];

const opcoes = (rs: Row[], soAnaliticas = false) =>
  rs.filter((r) => r["status"] !== false && (!soAnaliticas || String(r["codigo"] ?? "").split(".").length === 3))
    .map((r) => ({ value: String(rowId(r)), label: `${text(r["codigo"])} ${text(r["descricao"])}`.trim() }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

function CategoriasItensPage() {
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: contas = [] } = useTableRows("plano_contas");
  const centroOpts = useMemo(() => opcoes(centros), [centros]);
  const contaOpts = useMemo(() => opcoes(contas, true), [contas]);
  const nome = (opts: { value: string; label: string }[], id: unknown) => opts.find((o) => o.value === String(id ?? ""))?.label ?? "—";

  const columns: Column[] = [
    { key: "descricao", header: "Categoria", fields: ["descricao"] },
    { key: "centro", header: "Centro de Custo", fields: ["centro_custo_id"], render: (r) => nome(centroOpts, r["centro_custo_id"]) },
    { key: "conta", header: "Conta Gerencial", fields: ["plano_contas_id"], render: (r) => nome(contaOpts, r["plano_contas_id"]) },
    { key: "fiscal", header: "CFOP / CSOSN", fields: ["cfop_padrao"], render: (r) => [text(r["cfop_padrao"]), text(r["csosn_cst"])].filter(Boolean).join(" / ") || "—" },
    { key: "status", header: "Status", fields: ["status"], render: (r) => <StatusBadge value={r["status"]} /> },
  ];
  const fields: Field[] = [
    { fields: ["descricao"], label: "Categoria", full: true },
    { fields: ["centro_custo_id"], label: "Centro de Custo padrão", type: "select", options: centroOpts, nullable: true },
    { fields: ["plano_contas_id"], label: "Conta gerencial padrão (Plano de Contas)", type: "select", options: contaOpts, nullable: true },
    { fields: ["cfop_padrao"], label: "CFOP padrão (produtos)", placeholder: "5102" },
    { fields: ["csosn_cst"], label: "CSOSN / CST padrão", placeholder: "102" },
    { fields: ["origem"], label: "Origem da mercadoria", type: "select", options: ORIGENS, nullable: true },
    { fields: ["status"], label: "Status", type: "boolean" },
  ];

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/itens"><ArrowLeft className="mr-2 h-4 w-4" /> Produtos e Serviços</Link>
      </Button>
      <p className="text-muted-foreground text-sm">
        Ao escolher a categoria no cadastro de um item, o sistema preenche sozinho o Centro de Custo, a Conta Gerencial e os dados fiscais definidos aqui.
      </p>
      <ApoioCrud
        table="itens_categorias"
        title="Categorias de Produtos e Serviços"
        path="/itens_categorias"
        singular="categoria"
        searchFields={["descricao"]}
        searchPlaceholder="Categoria"
        columns={columns}
        fields={fields}
      />
    </div>
  );
}
