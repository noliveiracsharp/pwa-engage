import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatQtd, num } from "@/lib/orcamentos";

export const Route = createFileRoute("/cotacao/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cotação de compra — Atende.ai" },
      { name: "description", content: "Informe preços, prazos e condições para a cotação recebida." },
      { property: "og:title", content: "Cotação de compra — Atende.ai" },
      { property: "og:description", content: "Informe preços, prazos e condições para a cotação recebida." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CotacaoPublica,
});

type Item = {
  id: string; quantidade: number; unidade?: string | null; descricao: string | null; codigo: string | null;
  preco_unitario: number | null; prazo_dias: number | null; disponivel: boolean | null; marca: string | null; observacao: string | null;
};
type Dados = {
  encontrado: boolean;
  cotacao: { numero: string | null; titulo: string | null; status: string | null };
  participacao: { respondido: boolean | null; data_resposta: string | null; condicao_pagamento: string | null; frete: string | null; observacao_geral: string | null };
  fornecedor: { nome: string | null } | null;
  responsavel?: { nome: string | null; telefone: string | null } | null;
  empresa: { nome: string | null; logo: string | null; telefone: string | null } | null;
  itens: Item[];
};
type Linha = { id: string; preco: string; prazo: string; disponivel: boolean; marca: string; observacao: string };

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

const precoTxt = (v: number | null) => (v && v > 0 ? String(v).replace(".", ",") : "");

function CotacaoPublica() {
  const { token } = Route.useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [cond, setCond] = useState("");
  const [frete, setFrete] = useState("CIF");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await rpc("obter_cotacao_publica", { _token: token });
      if (error) return setErro("Não foi possível abrir a cotação. Verifique o link recebido.");
      const d = data as Dados;
      if (!d?.encontrado) return setErro("Cotação não encontrada ou link inválido.");
      setDados(d);
      setLinhas(Object.fromEntries(d.itens.map((i) => [i.id, {
        id: i.id, preco: precoTxt(i.preco_unitario), prazo: i.prazo_dias ? String(i.prazo_dias) : "",
        disponivel: i.disponivel !== false, marca: i.marca ?? "", observacao: i.observacao ?? "",
      }])));
      setCond(d.participacao.condicao_pagamento ?? "");
      setFrete(d.participacao.frete ?? "CIF");
      setObs(d.participacao.observacao_geral ?? "");
    })();
  }, [token]);

  const total = useMemo(() => (dados?.itens ?? []).reduce((s, i) => {
    const l = linhas[i.id];
    return l?.disponivel ? s + num(l.preco) * num(i.quantidade) : s;
  }, 0), [dados, linhas]);

  if (erro) return <div className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">{erro}</div>;
  if (!dados) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const encerrada = dados.cotacao.status === "aprovado" || dados.cotacao.status === "cancelado";
  const set = (id: string, p: Partial<Linha>) => setLinhas((s) => ({ ...s, [id]: { ...s[id]!, ...p } }));
  const algumPreco = Object.values(linhas).some((l) => l.disponivel && num(l.preco) > 0);

  const enviar = async () => {
    setEnviando(true);
    setMsg("");
    const itens = Object.values(linhas).map((l) => ({
      id: l.id, preco_unitario: l.disponivel ? num(l.preco) : 0, prazo_dias: Math.max(0, Math.floor(num(l.prazo))),
      disponivel: l.disponivel, marca: l.marca, observacao: l.observacao,
    }));
    const { data, error } = await rpc("salvar_cotacao_publica", { _token: token, _itens: itens, _condicao_pagamento: cond, _frete: frete, _observacao: obs });
    setEnviando(false);
    const r = data as { sucesso: boolean; mensagem?: string } | null;
    if (error || !r?.sucesso) return setMsg(r?.mensagem ?? "Não foi possível enviar. Tente novamente.");
    setEnviado(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {dados.empresa?.logo && <img src={dados.empresa.logo} alt="" className="h-9 w-9 rounded object-contain" />}
          <div className="min-w-0">
            <div className="truncate font-semibold text-primary">{dados.empresa?.nome ?? "Cotação de compra"}</div>
            <div className="text-xs text-muted-foreground">Cotação {dados.cotacao.numero ?? ""}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-28">
        {(dados.responsavel?.nome || dados.responsavel?.telefone) && (() => {
          const d = String(dados.responsavel?.telefone ?? "").replace(/\D/g, "");
          const wa = d ? (d.startsWith("55") ? d : `55${d}`) : "";
          return (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div>
                <div className="text-xs text-muted-foreground">Responsável por esta cotação</div>
                <div className="font-semibold">{dados.responsavel?.nome ?? "—"}</div>
                {d && <div className="text-sm text-muted-foreground">{dados.responsavel?.telefone}</div>}
              </div>
              {wa && (
                <Button asChild variant="outline">
                  <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Tenho uma dúvida sobre a cotação ${dados.cotacao.numero ?? ""}.`)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />Falar no WhatsApp
                  </a>
                </Button>
              )}
            </section>
          );
        })()}
        <section className="rounded-lg border bg-card p-4">
          <h1 className="text-lg font-bold">{dados.cotacao.titulo ?? "Cotação"}</h1>
          <p className="text-sm text-muted-foreground">
            Fornecedor: <span className="font-medium text-foreground">{dados.fornecedor?.nome ?? "—"}</span>
          </p>
          {dados.participacao.respondido && !enviado && (
            <p className="mt-2 text-sm text-success">Você já respondeu esta cotação. Pode ajustar e enviar novamente enquanto ela estiver aberta.</p>
          )}
        </section>

        {enviado && (
          <div className="flex items-start gap-3 rounded-lg border border-success/50 bg-success/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
            <div>
              <div className="font-semibold">Cotação enviada, obrigado!</div>
              <div className="text-sm text-muted-foreground">Total cotado: {formatBRL(total)}. Você pode reabrir este link para ajustar enquanto a cotação estiver aberta.</div>
            </div>
          </div>
        )}
        {encerrada && <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">Esta cotação já foi encerrada e não aceita novas respostas.</div>}

        <section className="space-y-3">
          <h2 className="font-semibold">Itens</h2>
          {dados.itens.map((i) => {
            const l = linhas[i.id];
            if (!l) return null;
            return (
              <div key={i.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{i.descricao ?? "Item"}</div>
                    <div className="text-xs text-muted-foreground">{i.codigo ? `Cód. ${i.codigo} · ` : ""}Quantidade: {formatQtd(i.quantidade)}{i.unidade ? ` ${i.unidade}` : ""}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={l.disponivel} disabled={encerrada} onCheckedChange={(v) => set(i.id, { disponivel: v })} /> Tenho este item
                  </label>
                </div>
                {l.disponivel && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label>Preço unitário (R$)</Label>
                      <Input inputMode="decimal" placeholder="0,00" value={l.preco} disabled={encerrada} onChange={(e) => set(i.id, { preco: e.target.value.replace(/[^\d,.]/g, "") })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Prazo de entrega (dias)</Label>
                      <Input inputMode="numeric" value={l.prazo} disabled={encerrada} onChange={(e) => set(i.id, { prazo: e.target.value.replace(/\D/g, "") })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Marca / modelo</Label>
                      <Input value={l.marca} disabled={encerrada} onChange={(e) => set(i.id, { marca: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Subtotal</Label>
                      <div className="flex h-9 items-center font-semibold tabular-nums">{formatBRL(num(l.preco) * num(i.quantidade))}</div>
                    </div>
                    <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                      <Label>Observação</Label>
                      <Input value={l.observacao} disabled={encerrada} onChange={(e) => set(i.id, { observacao: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-semibold">Condições comerciais</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Condição de pagamento</Label>
              <Input placeholder="Ex.: 28 DDL, 30/60, à vista" value={cond} disabled={encerrada} onChange={(e) => setCond(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Frete</Label>
              <Select value={frete} onValueChange={setFrete} disabled={encerrada}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CIF">CIF — por conta do fornecedor</SelectItem>
                  <SelectItem value="FOB">FOB — por conta do comprador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Observações gerais</Label>
            <Textarea rows={3} placeholder="Validade da proposta, pedido mínimo etc." value={obs} disabled={encerrada} onChange={(e) => setObs(e.target.value)} />
          </div>
        </section>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </main>

      {!encerrada && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-xs text-muted-foreground">Total cotado</div>
              <div className="text-lg font-bold tabular-nums">{formatBRL(total)}</div>
            </div>
            <Button onClick={enviar} disabled={enviando || !algumPreco}>
              {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Enviar cotação
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
