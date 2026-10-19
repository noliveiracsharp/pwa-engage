import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, FileText, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/orcamentos";
import { abrirPdfBase64 } from "@/lib/banco-api";

export const Route = createFileRoute("/cobranca/$token")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Sua fatura — boleto, Pix e nota fiscal" },
      { name: "description", content: "Veja sua fatura, copie o Pix, baixe o boleto e a nota fiscal." },
      { property: "og:title", content: "Sua fatura — boleto, Pix e nota fiscal" },
      { property: "og:description", content: "Veja sua fatura, copie o Pix, baixe o boleto e a nota fiscal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FaturaPublica,
});

type Dados = {
  empresa: { nome: string; logo: string | null };
  titulo: { descricao: string; valor: number; vencimento: string; pago: boolean; linha_digitavel: string | null; pix: string | null; tem_boleto: boolean; tem_nota: boolean; nota_numero: string | null };
};

function FaturaPublica() {
  const { token } = Route.useParams();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState("");

  useEffect(() => {
    void supabase.functions.invoke("cobranca-regua", { body: { acao: "ver", token } }).then(({ data, error }) => {
      if (error || (data as { erro?: string })?.erro) setErro("Link inválido ou expirado.");
      else setD(data as Dados);
    });
  }, [token]);

  const copiar = (v: string, o: string) => { void navigator.clipboard.writeText(v); toast.success(`${o} copiado.`); };
  const baixar = async (doc: "boleto" | "nota") => {
    setBaixando(doc);
    const { data } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "doc", token, doc } });
    setBaixando("");
    const r = data as { pdf?: string; url?: string } | null;
    if (r?.pdf) abrirPdfBase64(r.pdf);
    else if (r?.url) window.open(r.url, "_blank");
    else toast.error("Documento ainda não disponível.");
  };

  if (erro) return <main className="flex min-h-screen items-center justify-center p-6"><p className="text-muted-foreground">{erro}</p></main>;
  if (!d) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></main>;
  const t = d.titulo;

  return (
    <main className="bg-muted/40 flex min-h-screen items-start justify-center p-4 sm:p-10">
      <div className="bg-card w-full max-w-lg space-y-6 rounded-2xl border p-6 shadow-sm">
        <header className="flex items-center gap-3">
          {d.empresa.logo ? <img src={d.empresa.logo} alt={d.empresa.nome} className="h-10 max-w-40 object-contain" /> : <h1 className="text-lg font-semibold">{d.empresa.nome}</h1>}
        </header>
        <section className="bg-muted/50 rounded-xl p-4">
          <p className="text-muted-foreground text-sm">{t.descricao}</p>
          <p className="text-3xl font-bold">{formatBRL(t.valor)}</p>
          <p className="text-sm">Vencimento: {formatDate(t.vencimento)}</p>
          {t.pago && <p className="text-success mt-2 font-medium">Pagamento confirmado. Obrigado!</p>}
        </section>
        {!t.pago && t.pix && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Pix copia e cola</p>
            <p className="bg-muted break-all rounded p-2 font-mono text-xs">{t.pix}</p>
            <Button className="w-full" onClick={() => copiar(t.pix!, "Pix")}><Copy className="mr-1 h-4 w-4" />Copiar Pix</Button>
          </div>
        )}
        {!t.pago && t.linha_digitavel && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Linha digitável</p>
            <p className="bg-muted break-all rounded p-2 font-mono text-xs">{t.linha_digitavel}</p>
            <Button variant="outline" className="w-full" onClick={() => copiar(t.linha_digitavel!, "Código")}><Copy className="mr-1 h-4 w-4" />Copiar código</Button>
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {t.tem_boleto && <Button variant="outline" disabled={!!baixando} onClick={() => baixar("boleto")}>{baixando === "boleto" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Receipt className="mr-1 h-4 w-4" />}Baixar boleto</Button>}
          {t.tem_nota && <Button variant="outline" disabled={!!baixando} onClick={() => baixar("nota")}>{baixando === "nota" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}Nota fiscal{t.nota_numero ? ` nº ${t.nota_numero}` : ""}</Button>}
        </div>
      </div>
    </main>
  );
}
