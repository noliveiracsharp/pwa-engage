import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pedido/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pedido de Compra" },
      { name: "description", content: "Consulte o pedido de compra enviado pela empresa." },
      { property: "og:title", content: "Pedido de Compra" },
      { property: "og:description", content: "Consulte o pedido de compra enviado pela empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PedidoPublico,
});

type Item = { codigo: string | null; descricao: string | null; quantidade: number; preco_unitario: number; total: number };
type Dados = {
  encontrado: boolean;
  pedido?: { numero: string | null; status: string; total: number; condicao_pagamento: string | null; frete: string | null; prazo_entrega_dias: number | null; observacao: string | null; enviado_em: string | null; criado_em: string | null };
  fornecedor?: { nome: string | null } | null;
  empresa?: { nome: string | null; logo: string | null; telefone: string | null; cnpj: string | null } | null;
  itens?: Item[];
};

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

function PedidoPublico() {
  const { token } = Route.useParams();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    rpc("obter_pedido_compra_publico", { _token: token }).then(({ data, error }) => {
      if (error) setErro(error.message);
      else setD(data as Dados);
    });
  }, [token]);

  if (erro) return <p className="p-8 text-center text-destructive">{erro}</p>;
  if (!d) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!d.encontrado || !d.pedido) return <p className="p-8 text-center text-muted-foreground">Pedido não encontrado.</p>;
  const p = d.pedido;

  return (
    <div className="min-h-screen bg-muted/40 py-8 print:bg-background print:py-0">
      <div className="mx-auto max-w-3xl space-y-6 rounded-lg border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            {d.empresa?.logo && <img src={d.empresa.logo} alt={d.empresa.nome ?? "Logo"} className="h-12 w-auto object-contain" />}
            <div>
              <div className="font-semibold">{d.empresa?.nome ?? ""}</div>
              <div className="text-xs text-muted-foreground">{[d.empresa?.cnpj, d.empresa?.telefone].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Pedido de Compra</div>
            <div className="text-xl font-bold">{p.numero ?? ""}</div>
            <div className="text-xs text-muted-foreground">Emitido em {dt(p.enviado_em ?? p.criado_em)}</div>
          </div>
        </header>
        <div className="text-sm"><span className="text-muted-foreground">Fornecedor: </span><strong>{d.fornecedor?.nome ?? "—"}</strong></div>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Código</th><th>Descrição</th><th className="text-right">Qtd</th><th className="text-right">Unitário</th><th className="text-right">Total</th></tr>
          </thead>
          <tbody className="divide-y">
            {(d.itens ?? []).map((i, k) => (
              <tr key={k}><td className="py-2">{i.codigo ?? ""}</td><td>{i.descricao ?? ""}</td><td className="text-right tabular-nums">{Number(i.quantidade).toLocaleString("pt-BR")}</td><td className="text-right tabular-nums">{brl(i.preco_unitario)}</td><td className="text-right tabular-nums">{brl(i.total)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap justify-between gap-4 border-t pt-4 text-sm">
          <div className="space-y-1 text-muted-foreground">
            <div>Pagamento: {p.condicao_pagamento || "—"}</div>
            <div>Frete: {p.frete || "—"}</div>
            <div>Prazo de entrega: {p.prazo_entrega_dias ? `${p.prazo_entrega_dias} dias` : "—"}</div>
            {p.observacao && <div>Obs.: {p.observacao}</div>}
          </div>
          <div className="text-right"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-bold">{brl(p.total)}</div></div>
        </div>
        <div className="flex justify-end print:hidden"><Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Imprimir / PDF</Button></div>
      </div>
    </div>
  );
}
