import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Package, Rocket, ShoppingCart, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { ESPACOS } from "@/components/projetos/EspacosSidebar";
import { titulosDaOferta, titulosDoPedido } from "@/lib/financeiro";
import { contarTitulosDaOrigem, erroFinanceiro, fontesDaOferta, fontesDoPedido, inserirTitulos, itensDaOferta } from "@/lib/financeiro-db";
import { documentoEstoqueOferta, movimentosEstoqueDaOferta, nomeProjetoDaOferta } from "@/lib/oferta-ativacao";
import { aplicarFornecedorAoGrupo, pedidosPorFornecedor, vencedoresPorItem, type LinhaCompra } from "@/lib/ativacao-compras";
import { notificarEquipe } from "@/lib/avisos-equipe";
import { proximoNumero } from "@/lib/laudos";
import { COMPRA_MODOS, condicaoCompraFromValue, formatBRL, formatDate, num, parcelasFromValue, round2 } from "@/lib/orcamentos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oferta: Row | null;
  cliente: string;
  empresaId: string;
};

function Bloco({ icon: Icon, titulo, id: bid, on, set, children }: { icon: typeof Rocket; titulo: string; id: string; on: boolean; set: (v: boolean) => void; children?: ReactNode }) {
return (
  <section className="space-y-3 rounded-lg border p-4">
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={bid} className="flex items-center gap-2 text-base font-semibold"><Icon className="h-4 w-4 text-primary" />{titulo}</Label>
      <Switch id={bid} checked={on} onCheckedChange={set} />
    </div>
    {on && children}
  </section>
);
}

const FILA = "__fila__";
const chaveResp = (emp: string) => `ativacao-responsaveis:${emp}`;

export function AtivacaoOfertaDialog({ open, onOpenChange, oferta, cliente, empresaId }: Props) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const { data: espacos = [] } = useTableRows(ESPACOS, open);
  const { data: locais = [] } = useTableRows("estoque_locais", open);
  const { data: usuarios = [] } = useTableRows("usuarios", open);
  const { data: parceiros = [] } = useTableRows("parceiros", open);
  const { data: catalogo = [] } = useTableRows("itens", open);

  const [gerarPedidos, setGerarPedidos] = useState(true);
  const [linhas, setLinhas] = useState<LinhaCompra[]>([]);
  const [pedidosExistentes, setPedidosExistentes] = useState(0);
  const [respCompras, setRespCompras] = useState("");
  const [criarProjeto, setCriarProjeto] = useState(true);
  const [nome, setNome] = useState("");
  const [espaco, setEspaco] = useState(FILA);
  const [gestora, setGestora] = useState("");
  const [gerarFin, setGerarFin] = useState(true);
  const [baixarEstoque, setBaixarEstoque] = useState(true);
  const [local, setLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const id = oferta ? String(rowId(oferta) ?? "") : "";
  const emp = String(oferta?.["empresa_id"] ?? empresaId);

  // Carrega itens de produto e o vencedor de cada item nas cotações de origem.
  useEffect(() => {
    if (!open || !oferta || !id) return;
    setNome(nomeProjetoDaOferta(oferta["numero"], cliente));
    setCriarProjeto(true); setGerarFin(true); setBaixarEstoque(true); setGerarPedidos(true); setEspaco(FILA);
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveResp(emp)) ?? "{}") as { compras?: string; gestora?: string };
      setRespCompras(salvo.compras ?? ""); setGestora(salvo.gestora ?? "");
    } catch { /* sem preferência */ }
    let vivo = true;
    setCarregando(true);
    void (async () => {
      try {
        const itens = await itensDaOferta(id);
        const cots = await supabase.from("cotacoes").select("id").eq("orcamento_id", id);
        const cotIds = ((cots.data ?? []) as Row[]).map((c) => String(c["id"]));
        let vencedores = new Map<string, { fornecedorId: string; preco: number }>();
        const grupoPorItem = new Map<string, string>();
        if (cotIds.length) {
          const [ic, pr] = await Promise.all([
            supabase.from("cotacoes_itens").select("*").in("cotacao_id", cotIds),
            supabase.from("cotacoes_precos").select("*").in("cotacao_id", cotIds),
          ]);
          const itensCot = (ic.data ?? []) as Row[];
          vencedores = vencedoresPorItem(itensCot, (pr.data ?? []) as Row[]);
          for (const it of itensCot) if (it["grupo"]) grupoPorItem.set(String(it["item_id"]), String(it["grupo"]));
        }
        let q = supabase.from("pedidos_compra").select("id", { count: "exact", head: true });
        q = cotIds.length ? q.or(`orcamento_id.eq.${id},cotacao_id.in.(${cotIds.join(",")})`) : q.eq("orcamento_id", id);
        const ped = await q;
        if (!vivo) return;
        setPedidosExistentes(ped.count ?? 0);
        if ((ped.count ?? 0) > 0) setGerarPedidos(false);
        setLinhas(itens
          .filter((l) => String(l["natureza"] ?? "produto") === "produto" && num(l["quantidade"]) > 0)
          .map((l, i) => {
            const itemId = String(l["item_id"] ?? "");
            const v = vencedores.get(itemId);
            return {
              chave: String(rowId(l) ?? i), itemId, descricao: text(l["descricao"]),
              qtd: num(l["quantidade"]), custo: v?.preco ?? num(l["preco_custo"]),
              fornecedorId: v?.fornecedorId ?? String(l["fornecedor_id"] ?? ""), grupo: grupoPorItem.get(itemId),
            };
          }));
      } catch (e) {
        if (vivo) toast.error(e instanceof Error ? e.message : "Falha ao carregar itens da Oferta.");
      } finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemById = useMemo(() => new Map(catalogo.map((i) => [String(rowId(i)), i])), [catalogo]);
  const ordenar = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "pt-BR");
  const fornOpts = useMemo(() => parceiros.filter((p) => p["is_fornecedor"] === true)
    .map((p) => ({ value: String(rowId(p)), label: text(p["nome_fantasia"]) || text(p["razao_social"]) || "—" })).sort(ordenar), [parceiros]);
  const userOpts = useMemo(() => usuarios.filter((u) => u["status"] !== false)
    .map((u) => ({ value: String(rowId(u)), label: text(pick(u, ["nome", "nome_completo", "email"])) || "Usuário" })).sort(ordenar), [usuarios]);
  const espOpts = useMemo(() => [
    { value: FILA, label: "Aguardando início (fila de Projetos)" },
    ...espacos.filter((e) => !e["empresa_id"] || String(e["empresa_id"]) === emp)
      .map((e) => ({ value: String(rowId(e)), label: text(e["nome"]) || text(e["descricao"]) || "Espaço" })).sort(ordenar),
  ], [espacos, emp]);
  const locOpts = useMemo(() => locais
    .filter((l) => l["status"] !== false && String(l["empresa_id"] ?? "") === emp && l["tipo"] !== "Cliente / Comodato")
    .map((l) => ({ value: String(rowId(l)), label: text(l["descricao"]) || "Local" })).sort(ordenar), [locais, emp]);
  useEffect(() => { if (open && !local && locOpts.length) setLocal(locOpts[0]!.value); }, [open, locOpts, local]);

  const grupos = useMemo(() => [...new Set(linhas.map((l) => l.grupo ?? "").filter(Boolean))].sort(), [linhas]);
  const pedidos = useMemo(() => pedidosPorFornecedor(linhas), [linhas]);
  const faltaFornecedor = gerarPedidos && pedidos.has("");
  const nomeForn = (fid: string) => fornOpts.find((f) => f.value === fid)?.label ?? "Fornecedor";
  const nomeItem = (l: LinhaCompra) => l.descricao || text(itemById.get(l.itemId)?.["descricao"]) || "Item";

  const cond = condicaoCompraFromValue(oferta?.["compra_condicao"]);
  const cronograma = parcelasFromValue(oferta?.["compra_parcelas"]);
  const condTexto = [COMPRA_MODOS.find((m) => m.value === cond.modo)?.label,
    cronograma.length ? `${cronograma.length}x (1º venc. ${formatDate(cronograma[0]?.vencimento)})` : "", cond.obs].filter(Boolean).join(" — ");

  /** Saída do estoque dos produtos que controlam estoque; comodato vira remessa para o local do cliente. */
  async function baixarEstoqueDaOferta(): Promise<string> {
    const documento = documentoEstoqueOferta(oferta!["numero"], id);
    const ja = await supabase.from("estoque_movimentacoes").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("documento", documento);
    if (ja.error) throw ja.error;
    if ((ja.count ?? 0) > 0) return "estoque já tinha sido baixado";
    const itens = await itensDaOferta(id);
    const ids = [...new Set(itens.map((i) => String(i["item_id"] ?? "")).filter(Boolean))];
    if (!ids.length) return "";
    const cad = await supabase.from("itens").select("id, controla_estoque").in("id", ids);
    if (cad.error) throw cad.error;
    const controla = new Set((cad.data ?? []).filter((c) => c.controla_estoque !== false).map((c) => String(c.id)));
    const movs = movimentosEstoqueDaOferta(itens, controla);
    if (!movs.length) return "";
    if (!local) throw new Error("Escolha de qual local sai o estoque.");
    const comodato = oferta!["modalidade"] === "comodato";
    let destino: string | null = null;
    if (comodato) {
      const parceiro = String(oferta!["parceiro_id"] ?? "");
      const existente = locais.find((l) => l["tipo"] === "Cliente / Comodato" && String(l["parceiro_id"] ?? "") === parceiro && String(l["empresa_id"] ?? "") === emp);
      if (existente) destino = String(rowId(existente));
      else {
        const novo = await supabase.from("estoque_locais").insert({ empresa_id: emp, descricao: `Comodato — ${cliente || "Cliente"}`, tipo: "Cliente / Comodato", parceiro_id: parceiro || null } as never).select("id").single();
        if (novo.error) throw novo.error;
        destino = String((novo.data as { id: string }).id);
      }
    }
    const { error } = await supabase.from("estoque_movimentacoes").insert(movs.map((m) => ({
      ...m, empresa_id: emp, tipo: comodato ? "remessa_comodato" : "saida_venda",
      local_origem_id: local, local_destino_id: destino, documento,
      observacoes: `Baixa automática na ativação da ${documento}`,
    })) as never);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["table", "estoque_movimentacoes"] });
    return `${movs.length} produto(s) ${comodato ? "enviados em comodato" : "baixados do estoque"}`;
  }

  async function confirmar() {
    if (!oferta) return;
    if (gerarPedidos && faltaFornecedor) { toast.error("Defina o fornecedor de todos os itens de compra."); return; }
    if (gerarPedidos && linhas.length && !respCompras) { toast.error("Escolha quem de Compras será avisado."); return; }
    if (criarProjeto && !gestora) { toast.error("Escolha a gestora do projeto."); return; }
    setBusy(true);
    const msgs: string[] = [];
    const autor = usuario?.["id"] ?? null;
    const numero = text(oferta["numero"]);
    try { localStorage.setItem(chaveResp(emp), JSON.stringify({ compras: respCompras, gestora })); } catch { /* opcional */ }
    try {
      // 1) Compras: um pedido por fornecedor vencedor.
      const pedidosGerados: { pid: string; numero: string; fid: string; total: number }[] = [];
      if (gerarPedidos && pedidos.size) {
        for (const [fid, g] of pedidos) {
          const num_ = await proximoNumero("pedidos_compra", "PC", emp);
          const { data, error } = await supabase.from("pedidos_compra").insert({
            empresa_id: emp, orcamento_id: id, fornecedor_id: fid, numero: num_, status: "rascunho",
            condicao_pagamento: condTexto || null, total: g.total,
            observacao: `Gerado na ativação da Oferta ${numero}`.trim(),
          } as never).select("id").single();
          if (error) throw error;
          const pid = String((data as Row)["id"]);
          const { error: e2 } = await supabase.from("pedidos_compra_itens").insert(g.linhas.map((l) => ({
            pedido_id: pid, item_id: l.itemId || null, quantidade: l.qtd, preco_unitario: l.custo, total: round2(l.qtd * l.custo),
          })) as never);
          if (e2) throw e2;
          pedidosGerados.push({ pid, numero: num_, fid, total: g.total });
        }
        msgs.push(`${pedidosGerados.length} pedido(s) de compra`);
        qc.invalidateQueries({ queryKey: ["table", "pedidos_compra"] });
        const lista = pedidosGerados.map((p) => `• ${p.numero} — ${nomeForn(p.fid)}: ${formatBRL(p.total)}`).join("\n");
        await notificarEquipe({ empresaId: emp, autorId: autor, usuarioIds: [respCompras], link: "/cotacoes",
          titulo: `Pedidos de compra da Oferta ${numero} para enviar`,
          texto: `Cliente: ${cliente || "—"}\n${lista}\nRevise e envie aos fornecedores.` });
      }

      // 2) Projeto: direto no espaço escolhido ou na fila "Aguardando início".
      if (criarProjeto) {
        const naFila = espaco === FILA;
        const base: Row = {
          nome, parceiro_id: oferta["parceiro_id"] ?? null, gestor_id: gestora, espaco_id: naFila ? null : espaco,
          empresa_id: emp, dt_inicio: new Date().toISOString().slice(0, 10), orcamento_id: id, aguardando_inicio: naFila,
        };
        let { error } = await supabase.from("projetos").insert(base as never);
        if (error && /aguardando_inicio|orcamento_id|dt_inicio|column/i.test(error.message)) {
          const { orcamento_id: _o, dt_inicio: _d, aguardando_inicio: _a, ...resto } = base;
          ({ error } = await supabase.from("projetos").insert(resto as never));
        }
        if (error) throw error;
        msgs.push(naFila ? "projeto na fila de início" : "projeto criado");
        qc.invalidateQueries({ queryKey: ["table", "projetos"] });
        await notificarEquipe({ empresaId: emp, autorId: autor, usuarioIds: [gestora], link: "/projetos",
          titulo: `Novo projeto: ${nome}`,
          texto: `Oferta ${numero} ativada para ${cliente || "o cliente"}. ${naFila ? "Está aguardando início na fila de Projetos." : "Já está no espaço escolhido."}` });
      }

      // Cotações de origem: com pedidos gerados, o ciclo de Compras fecha em "Pedido gerado".
      if (pedidosGerados.length) {
        await supabase.from("cotacoes").update({ status: "pedido_gerado" } as never).eq("orcamento_id", id);
        qc.invalidateQueries({ queryKey: ["table", "cotacoes"] });
      }

      // 3) Financeiro: só contas a receber. O pagar fica com Compras/Financeiro,
      // pois o pagamento ao fornecedor pode ser boleto, PIX ou cartão de crédito (lançado na fatura do cartão).
      if (gerarFin) {
        const ja = await contarTitulosDaOrigem([id], ["oferta"]);
        if (ja > 0) msgs.push(`financeiro já tinha ${ja} conta(s)`);
        else {
          const itensOf = await itensDaOferta(id);
          const titulos = titulosDaOferta({ ...oferta, id }, itensOf).filter((t) => t.tipo === "receber");
          const n = await inserirTitulos(emp, titulos,
            { fontes: await fontesDaOferta(itensOf), clienteId: (oferta["parceiro_id"] ?? oferta["parceiros_id"] ?? null) as string | null });
          msgs.push(`${n} conta(s) a receber`);
          qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
        }
      }
      if (baixarEstoque) {
        const r = await baixarEstoqueDaOferta();
        if (r) msgs.push(r);
      }
      await supabase.from("orcamentos").update({ ativacao_concluida_em: new Date().toISOString() } as never).eq("id", id);
      qc.invalidateQueries({ queryKey: ["table", "orcamentos"] });
      toast.success(msgs.length ? `Ativação concluída: ${msgs.join(", ")}.` : "Ativação concluída.");
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      toast.error(/pedidos_compra|orcamento_id/.test(m) ? "Rode o script atendeai-ativacao-oferta.sql no banco." : erroFinanceiro(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /> Atividades de ativação</SheetTitle>
          <SheetDescription>Oferta {text(oferta?.["numero"])} · contrato fechado com {cliente || "o cliente"}. Confira e confirme o que será gerado.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Bloco icon={ShoppingCart} titulo="Pedidos de compra" id="at-ped" on={gerarPedidos} set={setGerarPedidos}>
            {pedidosExistentes > 0 && <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">Já existem {pedidosExistentes} pedido(s) para esta Oferta/cotação. Gerar de novo cria pedidos duplicados.</p>}
            {carregando ? <p className="text-muted-foreground text-sm">Carregando itens…</p> : !linhas.length ? (
              <p className="text-muted-foreground text-sm">Esta Oferta não tem produtos para comprar.</p>
            ) : (<>
              {grupos.length > 0 && (
                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <p className="text-xs font-medium">Fornecedor por grupo</p>
                  {grupos.map((g) => (
                    <div key={g} className="grid items-center gap-2 sm:grid-cols-[160px_1fr]">
                      <span className="truncate text-sm">{g}</span>
                      <SearchSelect value="" options={fornOpts} placeholder="Aplicar a todo o grupo"
                        onChange={(v) => setLinhas((ls) => aplicarFornecedorAoGrupo(ls, g, v))} />
                    </div>
                  ))}
                </div>
              )}
              <div className="divide-y rounded-md border">
                {linhas.map((l) => (
                  <div key={l.chave} className="grid gap-2 p-3 sm:grid-cols-[1fr_16rem] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{nomeItem(l)}</p>
                      <p className="text-muted-foreground text-xs">{l.grupo ? `${l.grupo} · ` : ""}{l.qtd} × {formatBRL(l.custo)} = {formatBRL(l.qtd * l.custo)}</p>
                    </div>
                    <SearchSelect value={l.fornecedorId} options={fornOpts} placeholder="Fornecedor"
                      onChange={(v) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, fornecedorId: v } : x)))} />
                  </div>
                ))}
              </div>
              <p className="text-xs">
                {[...pedidos.keys()].filter(Boolean).length} pedido(s): {[...pedidos.entries()].filter(([f]) => f).map(([f, g]) => `${nomeForn(f)} ${formatBRL(g.total)}`).join(" · ") || "—"}
                {faltaFornecedor && <span className="text-destructive ml-2">Há itens sem fornecedor.</span>}
              </p>
              <div className="space-y-1">
                <Label>Avisar de Compras (WhatsApp + sininho)</Label>
                <SearchSelect value={respCompras} onChange={setRespCompras} options={userOpts} placeholder="Responsável de Compras" />
              </div>
            </>)}
          </Bloco>

          <Bloco icon={FolderKanban} titulo="Projeto" id="at-proj" on={criarProjeto} set={setCriarProjeto}>
            <div className="space-y-1"><Label>Nome do projeto</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="space-y-1"><Label>Onde abrir</Label>
              <SearchSelect value={espaco} onChange={setEspaco} options={espOpts} placeholder="Escolha o espaço" />
              <p className="text-muted-foreground text-xs">"Aguardando início" deixa o projeto numa fila em Projetos até a gestora escolher o espaço.</p>
            </div>
            <div className="space-y-1"><Label>Gestora do projeto (WhatsApp + sininho)</Label>
              <SearchSelect value={gestora} onChange={setGestora} options={userOpts} placeholder="Escolha a gestora" />
            </div>
          </Bloco>

          <Bloco icon={Wallet} titulo="Contas a receber" id="at-fin" on={gerarFin} set={setGerarFin}>
            {oferta && (
              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
                {Number(oferta["total_liquido"]) > 0 && <li>Receber — implantação: {formatBRL(oferta["total_liquido"])}, conforme o parcelamento da Oferta.</li>}
                {Number(oferta["total_recorrente"]) > 0 && <li>Receber — mensalidades: {Math.max(1, Math.floor(Number(oferta["vigencia_meses"])) || 12)} × {formatBRL(oferta["total_recorrente"])}.</li>}
                <li>Contas a pagar não são lançadas aqui: Compras lança ao pagar o fornecedor (boleto, PIX ou cartão de crédito na fatura).</li>
              </ul>
            )}
          </Bloco>

          <Bloco icon={Package} titulo="Baixa no estoque" id="at-est" on={baixarEstoque} set={setBaixarEstoque}>
            <SearchSelect value={local} onChange={setLocal} options={locOpts} placeholder="Escolha o local de estoque" />
            <p className="text-muted-foreground text-xs">Só produtos com "controla estoque" ligado. {oferta?.["modalidade"] === "comodato" ? "Como é comodato, os equipamentos vão para o local do cliente." : "Registra saída por venda."}</p>
          </Bloco>
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fazer depois</Button>
          <Button onClick={() => void confirmar()} disabled={busy || carregando || (!criarProjeto && !gerarFin && !baixarEstoque && !gerarPedidos)}>
            {busy ? "Gerando…" : "Confirmar ativação"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

