import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { modelosContratoPublico } from "@/lib/contrato-modelos";
import type { ModelosContrato } from "@/lib/propostas";
import { MinutaDocumento } from "@/components/orcamentos/MinutaDocumento";
import { anexosDeParam, imprimirElemento } from "@/lib/propostas";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/minuta/$token")({
  staticData: { sitemap: false },
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ a: typeof s["a"] === "string" ? s["a"] : "" }),
  head: () => ({
    meta: [
      { title: "Minuta de contrato — Atende.ai" },
      { name: "description", content: "Leitura da minuta contratual para análise prévia." },
      { property: "og:title", content: "Minuta de contrato — Atende.ai" },
      { property: "og:description", content: "Leitura da minuta contratual para análise prévia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MinutaPublica,
});

type Dados = { encontrado: boolean; orcamento: Row; itens: Row[]; empresa: Row | null; cliente: Row | null; vendedor: Row | null; catalogo: Row[] };

function MinutaPublica() {
  const { token } = Route.useParams();
  const { a } = Route.useSearch();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [modelos, setModelos] = useState<ModelosContrato>({});
  useEffect(() => { void modelosContratoPublico(token).then(setModelos); }, [token]);

  useEffect(() => {
    (supabase.rpc as unknown as (f: string, x: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
      "obter_proposta_publica",
      { _token: token },
    ).then(({ data, error }) => {
      const d = data as Dados;
      if (error || !d?.encontrado) setErro("Minuta não encontrada ou link inválido.");
      else setDados(d);
    });
  }, [token]);

  if (erro) return <div className="text-muted-foreground grid min-h-screen place-items-center p-6 text-center">{erro}</div>;
  if (!dados) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="bg-muted/40 min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-[850px] space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => imprimirElemento("minuta-publica")}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir / salvar PDF
          </Button>
        </div>
        <MinutaDocumento
          id="minuta-publica"
          orcamento={dados.orcamento}
          empresa={dados.empresa}
          cliente={dados.cliente}
          vendedor={dados.vendedor}
          linhas={dados.itens ?? []}
          itens={dados.catalogo ?? []}
          anexos={anexosDeParam(a)}
          modelos={modelos}
        />
      </div>
    </div>
  );
}
