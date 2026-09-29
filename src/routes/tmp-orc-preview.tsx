import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { OrcamentoSheet } from "@/components/orcamentos/OrcamentoSheet";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/tmp-orc-preview")({
  ssr: false,
  component: Preview,
});

const clientes: Row[] = [
  { id: "c1", razao_social: "Condomínio Jardim das Flores", documento: "12345678000199", is_cliente: true, status: true },
  { id: "c2", razao_social: "Maria da Silva", documento: "12345678909", is_cliente: true, status: true },
];
const vendedores: Row[] = [{ id: "u1", nome: "Nilton Souza", status: true }];
const unidades: Row[] = [
  { id: "un1", descricao: "UN", status: true },
  { id: "un2", descricao: "HR", status: true },
];
const itens: Row[] = [
  { id: "i1", codigo: "P001", descricao: "Câmera IP Full HD", tipo: "Produto", preco_custo: 250, imposto: 12, margem_lucro: 30, preco_venda: 431.03, unidade_medida_id: "un1", status: true },
  { id: "i2", codigo: "S001", descricao: "Instalação técnica", tipo: "Serviço", preco_custo: 40, imposto: 6, margem_lucro: 50, preco_venda: 90.91, unidade_medida_id: "un2", status: true },
];
const record: Row = {
  id: "o1", numero: "#2026-0003", situacao: "Em andamento", dt_orcamento: "2026-09-28", validade_orcamento: "2026-10-13",
  parceiro_id: "c1", usuario_id: "u1", descricao: "Sistema de monitoramento portaria", desconto_tipo: "percentual", desconto: 5, frete: 80, valores_adicionais: 0,
};
const linhas: Row[] = [
  { id: "l1", orcamento_id: "o1", ordem: 1, item_id: "i1", detalhe: "Modelo dome", quantidade: 4, unidade_medida_id: "un1", valor_unitario: 431.03, preco_custo: 250, imposto_pct: 12 },
  { id: "l2", orcamento_id: "o1", ordem: 2, item_id: "i2", detalhe: "", quantidade: 6, unidade_medida_id: "un2", valor_unitario: 90.91, preco_custo: 40, imposto_pct: 6 },
];

function Preview() {
  const [open, setOpen] = useState(true);
  const mode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mode") : null;
  if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", mode === "dark");
  const novo = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("novo") === "1";
  return (
    <div className="p-6">
      <div className="flex gap-2">
        <SituacaoBadge value="Em andamento" />
        <SituacaoBadge value="Aprovado" />
        <SituacaoBadge value="Reprovado" />
      </div>
      <button type="button" onClick={() => setOpen(true)}>abrir</button>
      <OrcamentoSheet
        open={open}
        onOpenChange={setOpen}
        record={novo ? null : record}
        linhasRecord={novo ? [] : linhas}
        clientes={clientes}
        vendedores={vendedores}
        itens={itens}
        unidades={unidades}
        vendedorPadraoId="u1"
        onSave={(input) => console.log("SAVE", JSON.stringify(input))}
      />
    </div>
  );
}
