import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, PenLine, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { PropostaDocumento } from "@/components/orcamentos/PropostaDocumento";
import { blocosDe, imprimirElemento, sha256 } from "@/lib/propostas";
import { formatCpfCnpj } from "@/lib/input-masks";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/proposta/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Proposta comercial — Atende.ai" },
      { name: "description", content: "Confira a proposta comercial e assine eletronicamente." },
      { property: "og:title", content: "Proposta comercial — Atende.ai" },
      { property: "og:description", content: "Confira a proposta comercial e assine eletronicamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropostaPublica,
});

type Dados = {
  encontrado: boolean;
  orcamento: Row;
  itens: Row[];
  empresa: Row | null;
  cliente: Row | null;
  vendedor: Row | null;
  catalogo: Row[];
  unidades: Row[];
  marcas: Row[];
};

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

function PropostaPublica() {
  const { token } = Route.useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = async () => {
    const { data, error } = await rpc("obter_proposta_publica", { _token: token });
    if (error) {
      console.error("obter_proposta_publica", error);
      return setErro(`Não foi possível abrir a proposta. ${error.message ?? ""}`.trim());
    }
    const d = data as Dados;
    if (!d?.encontrado) return setErro("Proposta não encontrada ou link inválido.");
    setDados(d);
  };
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (erro) return <div className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">{erro}</div>;
  if (!dados) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const o = dados.orcamento;
  const assinado = !!o["assinado_em"];
  const docOk = doc.replace(/\D/g, "").length === 11 || doc.replace(/\D/g, "").length === 14;
  const podeAssinar = nome.trim().split(/\s+/).length >= 2 && docOk && aceite;

  const assinar = async () => {
    setEnviando(true);
    setMsg("");
    let ip = "";
    try {
      ip = ((await (await fetch("https://api.ipify.org?format=json")).json()) as { ip: string }).ip;
    } catch {
      ip = "indisponível";
    }
    const ua = navigator.userAgent;
    const momento = new Date().toISOString();
    const hash = await sha256(
      JSON.stringify({ token, numero: o["numero"], total: o["total_liquido"], itens: dados.itens, blocos: o["blocos_selecionados"], nome, doc, ip, momento }),
    );
    const { data, error } = await rpc("assinar_proposta_publica", {
      _token: token, _nome: nome, _documento: doc.replace(/\D/g, ""), _ip: ip, _user_agent: ua, _hash: hash,
    });
    setEnviando(false);
    const r = data as { sucesso?: boolean; mensagem?: string } | null;
    if (error || !r?.sucesso) return setMsg(r?.mensagem || error?.message || "Não foi possível assinar.");
    await carregar();
  };

  return (
    <div className="min-h-screen bg-muted/50">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-2 px-4 py-3">
          <span className="truncate text-sm font-semibold">Proposta {String(o["numero"] ?? "")}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => imprimirElemento("proposta-publica")}>
              <Printer className="mr-1 h-4 w-4" /> Baixar PDF
            </Button>
            {!assinado && (
              <Button size="sm" onClick={() => document.getElementById("assinar")?.scrollIntoView({ behavior: "smooth" })}>
                <PenLine className="mr-1 h-4 w-4" /> Aprovar e assinar
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[900px] space-y-6 px-3 py-6 md:py-10">
        <PropostaDocumento
          id="proposta-publica"
          blocos={blocosDe(o["blocos_selecionados"])}
          orcamento={o}
          linhas={dados.itens}
          empresa={dados.empresa}
          cliente={dados.cliente ?? undefined}
          vendedor={dados.vendedor ?? undefined}
          itens={dados.catalogo ?? []}
          unidades={dados.unidades ?? []}
          marcas={dados.marcas ?? []}
        />

        <section id="assinar" className="rounded-xl border bg-card p-6 shadow-sm">
          {assinado ? (
            <div className="flex items-start gap-3 text-success">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
              <div>
                <p className="font-semibold">Proposta assinada e aprovada</p>
                <p className="text-muted-foreground text-sm">
                  Assinada por {String(o["assinado_nome"] ?? "")} em{" "}
                  {new Date(String(o["assinado_em"])).toLocaleString("pt-BR")}. O certificado está acima.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Assinatura eletrônica</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="nome">Nome completo do responsável</Label>
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="doc">CPF/CNPJ</Label>
                  <Input id="doc" inputMode="numeric" value={formatCpfCnpj(doc)} onChange={(e) => setDoc(e.target.value.replace(/\D/g, "").slice(0, 14))} />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                Li e aceito os termos desta proposta e reconheço esta assinatura eletrônica como válida, nos termos do art. 10, § 2º, da MP nº 2.200-2/2001 e da Lei nº 14.063/2020.
              </label>
              {msg && <p className="text-destructive text-sm">{msg}</p>}
              <Button className="w-full sm:w-auto" disabled={!podeAssinar || enviando} onClick={assinar}>
                {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                Assinar eletronicamente
              </Button>
              <p className="text-muted-foreground text-xs">
                Registramos data/hora, IP, dispositivo e um código de autenticidade (hash) do documento.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
