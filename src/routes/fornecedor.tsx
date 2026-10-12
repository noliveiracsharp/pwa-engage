import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, LogOut, Package, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/fornecedor")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Portal do Fornecedor — Atende.ai" },
      { name: "description", content: "Consulte suas cotações e os pedidos de compra recebidos." },
      { property: "og:title", content: "Portal do Fornecedor — Atende.ai" },
      { property: "og:description", content: "Consulte suas cotações e os pedidos de compra recebidos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalFornecedor,
});

type Acesso = { documento: string; telefone: string };
type Cotacao = { token: string; numero: string | null; titulo: string | null; status_cotacao: string | null; respondido: boolean; empresa: string | null; criado_em: string | null };
type PedidoItem = { descricao: string; quantidade: number; preco_unitario: number; total: number };
type Pedido = { id: string; numero: string | null; status: string; total: number; condicao_pagamento: string | null; frete: string | null; prazo_entrega_dias: number | null; enviado_em: string | null; empresa: string | null; itens: PedidoItem[] };
type Dados = { nome: string | null; cotacoes: Cotacao[]; pedidos: Pedido[] };

const KEY = "atendeai-portal-fornecedor";
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const brl = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const fechada = (s: string | null) => ["aprovado", "aprovada", "cancelado", "cancelada"].includes((s ?? "").toLowerCase());

async function buscar(a: Acesso) {
  const r = await rpc("portal_fornecedor", { p_documento: a.documento, p_telefone: a.telefone });
  if (r.error) throw new Error(r.error.message);
  return r.data as Dados | null;
}

function PortalFornecedor() {
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  useEffect(() => {
    const s = sessionStorage.getItem(KEY);
    if (s) setAcesso(JSON.parse(s) as Acesso);
  }, []);
  const sair = () => { sessionStorage.removeItem(KEY); setAcesso(null); };

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="font-semibold text-primary">Atende.ai · Portal do Fornecedor</span>
          {acesso && <Button variant="ghost" size="sm" onClick={sair}><LogOut className="mr-1 h-4 w-4" /> Sair</Button>}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        {acesso ? <Painel acesso={acesso} onSair={sair} /> : (
          <Login onEntrar={(a) => { sessionStorage.setItem(KEY, JSON.stringify(a)); setAcesso(a); }} />
        )}
      </main>
    </div>
  );
}

function Login({ onEntrar }: { onEntrar: (a: Acesso) => void }) {
  const [doc, setDoc] = useState("");
  const [tel, setTel] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (doc.replace(/\D/g, "").length < 11) { setErro("Informe o CNPJ ou CPF."); return; }
    if (tel.replace(/\D/g, "").length < 10) { setErro("Informe o telefone com DDD."); return; }
    setCarregando(true);
    try {
      const d = await buscar({ documento: doc, telefone: tel });
      if (!d) { setErro("Não encontramos um fornecedor com esses dados."); return; }
      onEntrar({ documento: doc, telefone: tel });
    } catch {
      setErro("Não foi possível entrar agora. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }
  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader><h1 className="text-2xl font-semibold text-foreground">Acesse suas cotações</h1></CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="doc">CNPJ ou CPF</Label>
            <Input id="doc" inputMode="numeric" placeholder="00.000.000/0000-00" value={doc} onChange={(e) => setDoc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tel">Telefone cadastrado (com DDD)</Label>
            <Input id="tel" inputMode="tel" placeholder="(11) 99999-9999" value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Painel({ acesso, onSair }: { acesso: Acesso; onSair: () => void }) {
  const { data: d, isLoading, error } = useQuery({ queryKey: ["portal-fornecedor", acesso.documento], queryFn: () => buscar(acesso) });
  useEffect(() => { if (d === null) onSair(); }, [d, onSair]);
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  if (error || !d) return <p className="text-sm text-destructive">Não foi possível carregar seus dados.</p>;
  const abertas = d.cotacoes.filter((c) => !fechada(c.status_cotacao));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Olá{d.nome ? `, ${d.nome}` : ""}</h1>
        <p className="text-sm text-muted-foreground">{abertas.length} cotação(ões) aberta(s) · {d.pedidos.length} pedido(s)</p>
      </div>
      <Tabs defaultValue="cotacoes">
        <TabsList>
          <TabsTrigger value="cotacoes"><FileSpreadsheet className="mr-1 h-4 w-4" /> Cotações</TabsTrigger>
          <TabsTrigger value="pedidos"><Package className="mr-1 h-4 w-4" /> Pedidos</TabsTrigger>
        </TabsList>
        <TabsContent value="cotacoes" className="space-y-3">
          {d.cotacoes.length === 0 && <p className="text-muted-foreground">Nenhuma cotação recebida.</p>}
          {d.cotacoes.map((c) => {
            const fim = fechada(c.status_cotacao);
            return (
              <Card key={c.token}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{c.numero ?? "Cotação"}{c.titulo ? ` · ${c.titulo}` : ""}</p>
                    <p className="text-xs text-muted-foreground">{c.empresa ?? ""} · {data(c.criado_em)}</p>
                    <div className="mt-2 flex gap-2">
                      <Badge variant={c.respondido ? "default" : "outline"}>{c.respondido ? "Respondida" : "Aguardando sua resposta"}</Badge>
                      {fim && <Badge variant="secondary">Encerrada</Badge>}
                    </div>
                  </div>
                  <Button asChild size="sm" variant={fim ? "outline" : "default"}>
                    <a href={`/cotacao/${c.token}`}><ExternalLink className="mr-1 h-4 w-4" /> {fim ? "Ver" : c.respondido ? "Revisar" : "Responder"}</a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="pedidos" className="space-y-3">
          {d.pedidos.length === 0 && <p className="text-muted-foreground">Nenhum pedido de compra ainda.</p>}
          {d.pedidos.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{p.numero}</p>
                    <p className="text-xs text-muted-foreground">{p.empresa ?? ""} · enviado em {data(p.enviado_em)}</p>
                  </div>
                  <Badge variant={p.status === "recebido" ? "default" : "outline"}>
                    {p.status === "recebido" ? "Recebido" : p.status === "cancelado" ? "Cancelado" : "Enviado"}
                  </Badge>
                </div>
                <div className="divide-y divide-border rounded-md border border-border text-sm">
                  {p.itens.map((i, k) => (
                    <div key={k} className="flex justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 truncate">{i.quantidade}× {i.descricao}</span>
                      <span className="shrink-0">{brl(i.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                  <span>Pagamento: {p.condicao_pagamento || "—"} · Frete: {p.frete || "—"} · Prazo: {p.prazo_entrega_dias ?? "—"} dias</span>
                  <span className="font-semibold text-foreground">{brl(p.total)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
