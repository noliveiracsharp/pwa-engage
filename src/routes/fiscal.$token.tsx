import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Download, Loader2, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { baixarArquivo, CAMPOS_FISCAIS, gerarCsvFiscal, lerCsvFiscal, type ItemFiscal } from "@/lib/itens-fiscal";
import { avisar } from "@/components/layout/DialogoGlobal";

export const Route = createFileRoute("/fiscal/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dados fiscais dos itens — Atende.ai" },
      { name: "description", content: "Preencha NCM, CEST, CFOP e demais dados fiscais dos itens para faturamento." },
      { property: "og:title", content: "Dados fiscais dos itens — Atende.ai" },
      { property: "og:description", content: "Preencha NCM, CEST, CFOP e demais dados fiscais dos itens para faturamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FiscalPublico,
});

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

type Dados = { encontrado: boolean; empresa: { nome: string | null; logo: string | null } | null; itens: Record<string, unknown>[] };

function FiscalPublico() {
  const { token } = Route.useParams();
  const [empresa, setEmpresa] = useState<Dados["empresa"]>(null);
  const [itens, setItens] = useState<ItemFiscal[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await rpc("obter_itens_fiscal_publico", { _token: token });
      setCarregando(false);
      const d = data as Dados | null;
      if (error || !d?.encontrado) return setErro("Link inválido ou expirado. Peça um novo link à empresa.");
      setEmpresa(d.empresa);
      setItens(d.itens.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])) as ItemFiscal));
    })();
  }, [token]);

  const set = (id: string, k: string, v: string) => setItens((l) => l.map((i) => (i.id === id ? { ...i, [k]: v } : i)));

  const importar = async (f: File) => {
    const mapa = lerCsvFiscal(await f.text());
    let n = 0;
    setItens((l) => l.map((i) => { const v = mapa.get(i.id); if (!v) return i; n++; return { ...i, ...v }; }));
    setTimeout(() => void avisar(n ? `${n} item(ns) preenchido(s) pela planilha. Confira e clique em Enviar.` : "Nenhum item da planilha corresponde a este link."), 0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const enviar = async () => {
    setEnviando(true);
    const payload = itens.map((i) => ({ ...i, aliquota_iss: i.aliquota_iss.replace(",", ".") }));
    const { data, error } = await rpc("salvar_itens_fiscal_publico", { _token: token, _itens: payload });
    setEnviando(false);
    const r = data as { sucesso?: boolean; mensagem?: string } | null;
    if (error || !r?.sucesso) return void avisar(r?.mensagem ?? "Não foi possível salvar. Verifique os valores (ex.: alíquota numérica).");
    setOk(true);
  };

  if (carregando) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (erro) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">{erro}</div>;
  if (ok) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <CheckCircle2 className="h-12 w-12 text-success" />
      <h1 className="text-xl font-semibold">Dados fiscais enviados. Obrigado!</h1>
      <p className="text-sm text-muted-foreground">Os itens de {empresa?.nome ?? "empresa"} já foram atualizados. Você pode reabrir o link para corrigir algo.</p>
      <Button variant="outline" onClick={() => setOk(false)}>Voltar aos itens</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          {empresa?.logo && <img src={empresa.logo} alt={empresa.nome ?? "Logo"} className="h-10 w-auto" />}
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Dados fiscais dos itens</h1>
            <p className="text-sm text-muted-foreground">{empresa?.nome} pede que você preencha os dados para faturamento de {itens.length} item(ns).</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => baixarArquivo("itens-fiscal.csv", gerarCsvFiscal(itens))}><Download className="mr-1 h-4 w-4" /> Baixar planilha</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && void importar(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" /> Importar planilha</Button>
        </header>
        <p className="text-xs text-muted-foreground">Produtos usam NCM, CEST, origem, CFOP e CST/CSOSN. Serviços usam LC 116, código de tributação do município e alíquota de ISS. Na planilha, não altere a coluna "id".</p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs">
              <tr>
                <th className="p-2">Código</th><th className="p-2">Descrição</th><th className="p-2">Tipo</th>
                {CAMPOS_FISCAIS.map((c) => <th key={c.key} className="p-2 whitespace-nowrap">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{i.codigo}</td>
                  <td className="p-2 min-w-48">{i.descricao}</td>
                  <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{i.tipo}</td>
                  {CAMPOS_FISCAIS.map((c) => (
                    <td key={c.key} className="p-1"><Input className="h-8 min-w-24" value={i[c.key]} onChange={(e) => set(i.id, c.key, e.target.value)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void enviar()} disabled={enviando}>{enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Enviar dados fiscais</Button>
        </div>
      </div>
    </div>
  );
}
