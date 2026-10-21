import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, CircleDot, Download, Link2, Loader2, MessageCircle, PencilLine, Plus, ShoppingCart, Trash2, Trophy, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PreencherCotacaoDialog } from "@/components/cotacoes/PreencherCotacaoDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { rowId } from "@/lib/crud";
import { baixarArquivo, cotacaoStatusMeta, parseCsv, proximoNumero, toCsv } from "@/lib/laudos";
import { formatBRL, formatQtd, num, round2 } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/input-masks";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { QuickCreateDialog } from "@/components/itens/QuickCreateDialog";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows } from "@/lib/crud";
const ITEM_RAPIDO = [{ key: "descricao", label: "Descrição" }, { key: "codigo", label: "Código / referência" }];
import { PainelAprovacaoCotacao } from "@/components/cotacoes/AprovacaoCompras";
import { podeGerarPedido } from "@/lib/aprovacao-compras";
import { ReceberPedidoDialog } from "@/components/cotacoes/ReceberPedidoDialog";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cotacao: Row | null;
  itensCot: Row[];
  fornCot: Row[];
  precos: Row[];
  parceiros: Row[];
  itens: Row[];
  pedidos: Row[];
  empresaId: string | number | undefined;
  canUpdate: boolean;
  aprovando: boolean;
  onAprovar: (melhores: Array<{ cotacaoItem: Row; preco: number; fornecedorId: string }>) => void;
};

const nomeParc = (p: Row | undefined) => String(pick(p ?? {}, ["nome_fantasia", "razao_social"]) ?? "—");

export function CotacaoSheet({ open, onOpenChange, cotacao, itensCot, fornCot, precos, parceiros, itens, pedidos, empresaId, canUpdate, aprovando, onAprovar }: Props) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const { data: unidadesRows = [] } = useTableRows("unidade_medida");
  const unidadeOpts = useMemo(() => unidadesRows
    .map((u) => { const sig = String(pick(u, ["sigla", "abreviacao", "codigo", "descricao"]) ?? ""); const d = String(pick(u, ["descricao"]) ?? sig); return { value: sig, label: sig === d ? d : `${sig} — ${d}`, keywords: [d] }; })
    .filter((o) => o.value).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [unidadesRows]);
  const unidadeDoItem = (itemId: string) => {
    const it = itens.find((i) => String(rowId(i)) === itemId);
    const u = unidadesRows.find((r) => String(rowId(r)) === String(it?.["unidade_medida_id"] ?? ""));
    return u ? String(pick(u, ["sigla", "abreviacao", "codigo", "descricao"]) ?? "") || null : null;
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [novoForn, setNovoForn] = useState("");
  const [novoParc, setNovoParc] = useState<{ nome: string; doc: string; tel: string } | null>(null);
  const [novoItem, setNovoItem] = useState("");
  const [receber, setReceber] = useState<Row | null>(null);
  const [criarItem, setCriarItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [criterio, setCriterio] = useState<"preco" | "prazo">("preco");
  const [gerando, setGerando] = useState(false);
  const [preencher, setPreencher] = useState<Row | null>(null);
  const cid = cotacao ? String(rowId(cotacao)) : "";
  const aprovada = cotacao?.["status"] === "aprovado";
  const editavel = canUpdate && !aprovada;

  const parceiroById = useMemo(() => new Map(parceiros.map((p) => [String(rowId(p)), p])), [parceiros]);
  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i)), i])), [itens]);
  const fornecedoresOpts = useMemo(() => {
    const f = parceiros.filter((p) => p["is_fornecedor"] === true);
    const usados = new Set(fornCot.map((x) => String(x["fornecedor_id"])));
    return (f.length ? f : parceiros)
      .filter((p) => !usados.has(String(rowId(p))))
      .map((p) => ({ value: String(rowId(p)), label: nomeParc(p), keywords: [String(p["razao_social"] ?? "")] }));
  }, [parceiros, fornCot]);

  const itemOpts = useMemo(
    () => itens.map((i) => ({ value: String(rowId(i)), label: String(i["descricao"] ?? "Item"), hint: i["codigo"] ? String(i["codigo"]) : undefined, keywords: [String(i["codigo"] ?? "")] })),
    [itens],
  );

  const invalidar = () => {
    for (const t of ["cotacoes", "cotacoes_itens", "cotacoes_fornecedores", "cotacoes_precos", "pedidos_compra"]) qc.invalidateQueries({ queryKey: ["table", t] });
  };
  const precoDe = (itemCotId: string, fornId: string) =>
    precos.find((p) => String(p["cotacao_item_id"]) === itemCotId && String(p["fornecedor_id"]) === fornId);

  /* ---- comparativo ---- */
  const analise = useMemo(() => {
    const totais = new Map<string, { total: number; completo: boolean }>();
    for (const f of fornCot) totais.set(String(f["fornecedor_id"]), { total: 0, completo: true });
    const melhores: Array<{ cotacaoItem: Row; preco: number; fornecedorId: string }> = [];
    for (const it of itensCot) {
      const qtd = num(it["quantidade"]);
      let best: { preco: number; fornecedorId: string } | null = null;
      for (const f of fornCot) {
        const fid = String(f["fornecedor_id"]);
        const p = precoDe(String(it["id"]), fid);
        const v = num(p?.["preco_unitario"]);
        const t = totais.get(fid)!;
        if (!p || p["disponivel"] === false || v <= 0) { t.completo = false; continue; }
        t.total += v * qtd;
        if (!best || v < best.preco) best = { preco: v, fornecedorId: fid };
      }
      if (best) melhores.push({ cotacaoItem: it, ...best });
    }
    const split = melhores.reduce((s, m) => s + m.preco * num(m.cotacaoItem["quantidade"]), 0);
    let vencedor: string | null = null;
    for (const [fid, t] of totais) if (t.completo && t.total > 0 && (!vencedor || t.total < totais.get(vencedor)!.total)) vencedor = fid;
    // escolha por item: manual (fornecedor_escolhido_id) ou automática pelo critério
    const escolhas: Array<{ cotacaoItem: Row; preco: number; prazo: number; fornecedorId: string; manual: boolean }> = [];
    for (const it of itensCot) {
      const ofertas = fornCot
        .map((f) => {
          const fid = String(f["fornecedor_id"]);
          const p = precoDe(String(it["id"]), fid);
          return { fid, p, v: num(p?.["preco_unitario"]), d: num(p?.["prazo_dias"]) };
        })
        .filter((o) => o.p && o.p["disponivel"] !== false && o.v > 0);
      if (!ofertas.length) continue;
      const manualId = it["fornecedor_escolhido_id"] ? String(it["fornecedor_escolhido_id"]) : "";
      let o = ofertas.find((x) => x.fid === manualId);
      const manual = !!o;
      if (!o) o = [...ofertas].sort((a, b) => (criterio === "prazo" ? a.d - b.d || a.v - b.v : a.v - b.v || a.d - b.d))[0]!;
      escolhas.push({ cotacaoItem: it, preco: o.v, prazo: o.d, fornecedorId: o.fid, manual });
    }
    const porForn = new Map<string, { itens: typeof escolhas; total: number; prazo: number }>();
    for (const e of escolhas) {
      const g = porForn.get(e.fornecedorId) ?? { itens: [], total: 0, prazo: 0 };
      g.itens.push(e);
      g.total = round2(g.total + e.preco * num(e.cotacaoItem["quantidade"]));
      g.prazo = Math.max(g.prazo, e.prazo);
      porForn.set(e.fornecedorId, g);
    }
    return { totais, melhores, split: round2(split), vencedor, escolhas, porForn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itensCot, fornCot, precos, criterio]);

  if (!cotacao) return null;

  const escolher = async (it: Row, fid: string | null) => {
    const { error } = await supabase.from("cotacoes_itens").update({ fornecedor_escolhido_id: fid } as never).eq("id", String(it["id"]));
    if (error) return void toast.error(error.message.includes("fornecedor_escolhido_id") ? "Rode o script atendeai-pedidos-compra.sql no banco." : error.message);
    invalidar();
  };
  const usarCriterioEmTudo = async () => {
    const { error } = await supabase.from("cotacoes_itens").update({ fornecedor_escolhido_id: null } as never).eq("cotacao_id", cid);
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const pedidosCot = pedidos.filter((p) => String(p["cotacao_id"]) === cid);
  const gerarPedidos = async () => {
    if (pedidosCot.length && !await confirmar("Já existem pedidos desta cotação. Gerar novamente substituirá os pedidos em aberto. Continuar?")) return;
    setGerando(true);
    try {
      const abertos = pedidosCot.filter((p) => p["status"] !== "enviado" && p["status"] !== "recebido").map((p) => String(p["id"]));
      if (abertos.length) await supabase.from("pedidos_compra").delete().in("id", abertos);
      const jaEnviados = new Set(pedidosCot.filter((p) => !abertos.includes(String(p["id"]))).map((p) => String(p["fornecedor_id"])));
      let n = 0;
      for (const [fid, g] of analise.porForn) {
        if (jaEnviados.has(fid)) continue;
        const fc = fornCot.find((x) => String(x["fornecedor_id"]) === fid);
        const numero = await proximoNumero("pedidos_compra", "PC", empresaId);
        const { data, error } = await supabase
          .from("pedidos_compra")
          .insert({
            empresa_id: empresaId, cotacao_id: cid, fornecedor_id: fid, numero, status: "rascunho",
            condicao_pagamento: fc?.["condicao_pagamento"] ?? null, frete: fc?.["frete"] ?? null,
            prazo_entrega_dias: g.prazo, total: g.total,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const pid = String((data as Row)["id"]);
        const { error: e2 } = await supabase.from("pedidos_compra_itens").insert(
          g.itens.map((e) => ({
            pedido_id: pid, cotacao_item_id: String(e.cotacaoItem["id"]), item_id: e.cotacaoItem["item_id"] ?? null,
            quantidade: num(e.cotacaoItem["quantidade"]), preco_unitario: e.preco, prazo_dias: e.prazo,
            total: round2(e.preco * num(e.cotacaoItem["quantidade"])),
          })) as never,
        );
        if (e2) throw e2;
        n++;
      }
      toast.success(n === 1 ? "1 pedido de compra gerado." : `${n} pedidos de compra gerados.`);
      invalidar();
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      toast.error(m.includes("pedidos_compra") ? "Rode o script atendeai-pedidos-compra.sql no banco." : m || "Falha ao gerar pedidos.");
    } finally {
      setGerando(false);
    }
  };
  const enviarPedido = async (p: Row) => {
    const parc = parceiroById.get(String(p["fornecedor_id"]));
    const g = analise.porForn.get(String(p["fornecedor_id"]));
    const linhas = (g?.itens ?? []).map((e) => {
      const item = itemById.get(String(e.cotacaoItem["item_id"]));
      return `• ${formatQtd(e.cotacaoItem["quantidade"])}${e.cotacaoItem["unidade"] ? ` ${String(e.cotacaoItem["unidade"])}` : ""} x ${String(item?.["descricao"] ?? "Item")} — ${formatBRL(e.preco)}`;
    });
    const texto = [
      `Olá, ${nomeParc(parc)}! Segue o pedido de compra ${String(p["numero"] ?? "")} (cotação ${String(cotacao["numero"] ?? "")}):`,
      ...linhas,
      `Total: ${formatBRL(p["total"])}`,
      p["condicao_pagamento"] ? `Pagamento: ${String(p["condicao_pagamento"])}` : "",
      p["frete"] ? `Frete: ${String(p["frete"])}` : "",
      num(p["prazo_entrega_dias"]) > 0 ? `Prazo de entrega: ${num(p["prazo_entrega_dias"])} dias` : "",
    ].filter(Boolean).join("\n");
    const fone = String(pick(parc ?? {}, ["whatsapp", "celular", "telefone"]) ?? "").replace(/\D/g, "");
    const numero = fone && !fone.startsWith("55") ? `55${fone}` : fone;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    if (p["status"] === "rascunho") {
      await supabase.from("pedidos_compra").update({ status: "enviado", enviado_em: new Date().toISOString() } as never).eq("id", String(p["id"]));
      invalidar();
    }
  };
  const marcarRecebido = (p: Row) => setReceber(p);

  const addFornecedor = async (fid: string) => {
    if (!fid) return;
    const codigo = `${String(cotacao["numero"] ?? "COT")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { error } = await supabase.from("cotacoes_fornecedores").insert({ cotacao_id: cid, fornecedor_id: fid, codigo_envio: codigo });
    if (error) return void toast.error(error.message);
    if (cotacao["status"] === "pendente") await supabase.from("cotacoes").update({ status: "em_cotacao" }).eq("id", cid);
    setNovoForn("");
    invalidar();
  };

  const salvarTitulo = async (v: string) => {
    const t = v.trim();
    if (!t || t === String(cotacao["titulo"] ?? "")) return;
    const { error } = await supabase.from("cotacoes").update({ titulo: t }).eq("id", cid);
    if (error) return void toast.error(error.message);
    toast.success("Título atualizado.");
    invalidar();
  };

  const criarFornecedor = async () => {
    if (!novoParc) return;
    const nome = novoParc.nome.trim();
    if (!nome) return void toast.error("Informe o nome do fornecedor.");
    const doc = novoParc.doc.replace(/\D/g, "");
    const tel = novoParc.tel.replace(/\D/g, "");
    const { data, error } = await supabase
      .from("parceiros")
      .insert({
        empresa_id: empresaId, razao_social: nome, nome_fantasia: nome,
        documento: doc || null, telefone: tel ? (tel.startsWith("55") ? `+${tel}` : `+55${tel}`) : null,
        tipo_pessoa: doc.length === 11 ? "Física" : "Jurídica", is_fornecedor: true, status: true,
      } as never)
      .select("id")
      .single();
    if (error) return void toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "parceiros"] });
    setNovoParc(null);
    toast.success("Fornecedor cadastrado.");
    await addFornecedor(String((data as { id: string }).id));
  };

  const addItem = async (itemId: string) => {
    if (!itemId) return;
    setNovoItem("");
    const { error } = await supabase.from("cotacoes_itens").insert({ cotacao_id: cid, item_id: itemId, quantidade: 1 });
    if (error) return void toast.error(error.message);
    const un = unidadeDoItem(itemId);
    if (un) await supabase.from("cotacoes_itens").update({ unidade: un } as never).eq("cotacao_id", cid).eq("item_id", itemId).is("unidade" as never, null);
    invalidar();
  };
  const salvarQtd = async (it: Row, valor: string) => {
    const q = num(valor);
    if (q <= 0 || q === num(it["quantidade"])) return;
    const { error } = await supabase.from("cotacoes_itens").update({ quantidade: q }).eq("id", String(it["id"]));
    if (error) return void toast.error(error.message);
    invalidar();
  };
  const salvarUnidade = async (it: Row, un: string) => {
    const { error } = await supabase.from("cotacoes_itens").update({ unidade: un || null } as never).eq("id", String(it["id"]));
    if (error) return void toast.error(error.message.includes("unidade") ? "Rode o script atendeai-cotacao-vendedor-unidade.sql no banco." : error.message);
    invalidar();
  };
  const removerItem = async (it: Row) => {
    const { error } = await supabase.from("cotacoes_itens").delete().eq("id", String(it["id"]));
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const removerForn = async (f: Row) => {
    await supabase.from("cotacoes_precos").delete().eq("cotacao_id", cid).eq("fornecedor_id", String(f["fornecedor_id"]));
    const { error } = await supabase.from("cotacoes_fornecedores").delete().eq("id", String(f["id"]));
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const origemPublica = () => (/localhost|127\.0\.0\.1|id-preview--/.test(window.location.host) ? "https://pwa-engage.lovable.app" : window.location.origin);
  const linkDe = (f: Row) => (f["token_publico"] ? `${origemPublica()}/cotacao/${String(f["token_publico"])}` : null);
  const semToken = () => toast.error("Link indisponível: rode o script atendeai-cotacao-online.sql no banco.");
  const respNome = String(pick(usuario ?? {}, ["nome", "name"]) ?? "").trim();
  const respFone = String(pick(usuario ?? {}, ["whatsapp", "celular", "telefone"]) ?? "").trim();
  const gravarResponsavel = async () => {
    if (!respNome && !respFone) return;
    if (cotacao["responsavel_nome"] === respNome && cotacao["responsavel_telefone"] === respFone) return;
    await supabase.from("cotacoes").update({ responsavel_nome: respNome || null, responsavel_telefone: respFone || null } as never).eq("id", cid);
  };
  const copiarLink = async (f: Row) => {
    const url = linkDe(f);
    if (!url) { semToken(); return; }
    await gravarResponsavel();
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  };
  const enviarWhats = (f: Row) => {
    const url = linkDe(f);
    if (!url) { semToken(); return; }
    const p = parceiroById.get(String(f["fornecedor_id"]));
    const fone = String(pick(p ?? {}, ["whatsapp", "celular", "telefone"]) ?? "").replace(/\D/g, "");
    const numero = fone && !fone.startsWith("55") ? `55${fone}` : fone;
    void gravarResponsavel();
    const assinatura = respNome ? `\n\n${respNome}${respFone ? ` — WhatsApp ${formatPhoneDisplay(respFone)}` : ""}` : "";
    const texto = `Olá, ${nomeParc(p)}!\n\nSegue a solicitação da cotação ${String(cotacao["numero"] ?? "")}${cotacao["titulo"] ? ` — ${String(cotacao["titulo"])}` : ""}.\n\nPara informar seus preços, prazos e condições, acesse o link abaixo:\n\n${url}\n\nQualquer dúvida, ficamos à disposição.${assinatura}`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const exportar = (f: Row) => {
    const linhas: Array<Array<string | number>> = [
      ["codigo_envio", "fornecedor", "cotacao_item_id", "codigo_item", "descricao", "quantidade", "preco_unitario", "prazo_dias", "observacao"],
      ...itensCot.map((it) => {
        const item = itemById.get(String(it["item_id"]));
        return [String(f["codigo_envio"]), nomeParc(parceiroById.get(String(f["fornecedor_id"]))), String(it["id"]), String(item?.["codigo"] ?? ""), String(item?.["descricao"] ?? ""), formatQtd(it["quantidade"]), "", "", ""];
      }),
    ];
    baixarArquivo(`cotacao-${cotacao["numero"] ?? cid}-${f["codigo_envio"]}.csv`, toCsv(linhas));
  };

  const importar = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
      const col = (n: string) => head.indexOf(n);
      const [cCod, cItem, cPreco, cPrazo, cObs] = ["codigo_envio", "cotacao_item_id", "preco_unitario", "prazo_dias", "observacao"].map(col);
      if (cCod! < 0 || cItem! < 0 || cPreco! < 0) throw new Error("Arquivo fora do modelo: use o CSV exportado pela cotação.");
      const codigo = rows[1]?.[cCod!]?.trim();
      const forn = fornCot.find((f) => String(f["codigo_envio"]) === codigo);
      if (!forn) throw new Error("O código do fornecedor no arquivo não pertence a esta cotação.");
      const idsValidos = new Set(itensCot.map((i) => String(i["id"])));
      const payload = rows.slice(1).filter((r) => idsValidos.has(r[cItem!]?.trim() ?? "")).map((r) => {
        const preco = num(r[cPreco!]);
        return {
          cotacao_id: cid,
          cotacao_item_id: r[cItem!]!.trim(),
          fornecedor_id: String(forn["fornecedor_id"]),
          preco_unitario: preco,
          prazo_dias: cPrazo! >= 0 ? Math.floor(num(r[cPrazo!])) : 0,
          disponivel: preco > 0,
          observacao: cObs! >= 0 ? r[cObs!]?.trim() || null : null,
        };
      });
      if (!payload.length) throw new Error("Nenhum item reconhecido no arquivo.");
      const { error } = await supabase.from("cotacoes_precos").upsert(payload, { onConflict: "cotacao_item_id,fornecedor_id" });
      if (error) throw error;
      const total = payload.reduce((s, p) => s + p.preco_unitario * num(itensCot.find((i) => String(i["id"]) === p.cotacao_item_id)?.["quantidade"]), 0);
      await supabase.from("cotacoes_fornecedores").update({ respondido: true, data_resposta: new Date().toISOString(), total_cotado: round2(total) }).eq("id", String(forn["id"]));
      toast.success(`Preços de ${nomeParc(parceiroById.get(String(forn["fornecedor_id"])))} importados (${payload.length} itens).`);
      invalidar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar o arquivo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const salvarPreco = async (it: Row, f: Row, valor: string) => {
    const preco = num(valor);
    const atual = precoDe(String(it["id"]), String(f["fornecedor_id"]));
    if (num(atual?.["preco_unitario"]) === preco) return;
    const { error } = await supabase.from("cotacoes_precos").upsert(
      { cotacao_id: cid, cotacao_item_id: String(it["id"]), fornecedor_id: String(f["fornecedor_id"]), preco_unitario: preco, disponivel: preco > 0 },
      { onConflict: "cotacao_item_id,fornecedor_id" },
    );
    if (error) return void toast.error(error.message);
    invalidar();
  };

  const st = cotacaoStatusMeta(cotacao["status"]);
  const vencedorNome = analise.vencedor ? nomeParc(parceiroById.get(analise.vencedor)) : null;

  return (
    <>
    {receber && <ReceberPedidoDialog pedido={receber} empresaId={String(empresaId ?? "")} onClose={() => setReceber(null)} onDone={invalidar} />}
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-panel-full="" className="flex w-full flex-col gap-0 p-0 sm:max-w-none">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">
            Cotação {String(cotacao["numero"] ?? "")}
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", st.badge)}>{st.label}</span>
          </SheetTitle>
          {canUpdate ? (
            <Input
              key={cid + String(cotacao["titulo"] ?? "")}
              aria-label="Título da cotação"
              defaultValue={String(cotacao["titulo"] ?? "")}
              className="h-8 max-w-xl text-sm"
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => void salvarTitulo(e.target.value)}
            />
          ) : (
            <p className="text-muted-foreground text-sm">{String(cotacao["titulo"] ?? "")}</p>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Fornecedores participantes</h3>
              {editavel && (
                <Button variant="outline" size="sm" disabled={busy || !fornCot.length} onClick={() => fileRef.current?.click()}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Importar CSV respondido
                </Button>
              )}
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importar(e.target.files?.[0])} />
            </div>
            {editavel && (
              <div className="flex gap-2">
                <div className="flex-1"><SearchSelect value={novoForn} onChange={addFornecedor} options={fornecedoresOpts} placeholder="Adicionar fornecedor" /></div>
                <Button variant="outline" onClick={() => setNovoParc({ nome: "", doc: "", tel: "" })}><Plus className="mr-1 h-4 w-4" /> Novo fornecedor</Button>
              </div>
            )}
            <Dialog open={!!novoParc} onOpenChange={(o) => !o && setNovoParc(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo fornecedor</DialogTitle></DialogHeader>
                {novoParc && (
                  <div className="space-y-3">
                    <div className="space-y-1"><Label>Nome / Razão social</Label><Input autoFocus value={novoParc.nome} onChange={(e) => setNovoParc({ ...novoParc, nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>CNPJ / CPF</Label><Input value={novoParc.doc} onChange={(e) => setNovoParc({ ...novoParc, doc: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Telefone / WhatsApp</Label><Input value={novoParc.tel} onChange={(e) => setNovoParc({ ...novoParc, tel: e.target.value })} /></div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNovoParc(null)}>Cancelar</Button>
                  <Button onClick={criarFornecedor}>Salvar e adicionar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {fornCot.length === 0 && <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">Adicione fornecedores para gerar os arquivos de cotação.</p>}
            <div className="grid gap-2 md:grid-cols-2">
              {fornCot.map((f) => (
                <div key={String(f["id"])} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{nomeParc(parceiroById.get(String(f["fornecedor_id"])))}</div>
                      <div className="text-muted-foreground text-xs">
                        Código {String(f["codigo_envio"] ?? "—")} ·{" "}
                        {f["respondido"] ? (
                          <span className="text-success font-medium">respondido{f["data_resposta"] ? ` em ${new Date(String(f["data_resposta"])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
                        ) : f["visualizado_em"] ? "link aberto, aguardando" : "aguardando"}
                      </div>
                    </div>
                    {editavel && <Button size="icon" variant="ghost" aria-label="Remover fornecedor" onClick={() => removerForn(f)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  {Boolean(f["condicao_pagamento"] || f["frete"]) && (
                    <div className="text-muted-foreground text-xs">
                      {f["condicao_pagamento"] ? `Pagamento: ${String(f["condicao_pagamento"])}` : ""}
                      {f["condicao_pagamento"] && f["frete"] ? " · " : ""}
                      {f["frete"] ? `Frete: ${String(f["frete"])}` : ""}
                      {f["observacao_geral"] ? ` · ${String(f["observacao_geral"])}` : ""}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {editavel && <Button size="sm" onClick={() => setPreencher(f)}><PencilLine className="mr-1 h-4 w-4" />Preencher</Button>}
                    <Button size="sm" variant="outline" onClick={() => copiarLink(f)}><Link2 className="mr-1 h-4 w-4" />Copiar link</Button>
                    <Button size="sm" variant="outline" onClick={() => enviarWhats(f)}><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</Button>
                    <Button size="sm" variant="ghost" onClick={() => exportar(f)}><Download className="mr-1 h-4 w-4" />CSV</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Comparativo e escolha por item</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Escolher automaticamente por</span>
                <div className="inline-flex rounded-md border p-0.5">
                  {(["preco", "prazo"] as const).map((c) => (
                    <button key={c} type="button" onClick={() => setCriterio(c)} className={cn("rounded px-2.5 py-1 text-xs font-medium", criterio === c ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                      {c === "preco" ? "Menor preço" : "Menor prazo"}
                    </button>
                  ))}
                </div>
                {editavel && analise.escolhas.some((e) => e.manual) && <Button size="sm" variant="ghost" onClick={usarCriterioEmTudo}>Limpar escolhas manuais</Button>}
              </div>
            </div>
            <p className="text-muted-foreground text-xs">Clique no círculo ao lado do preço para escolher de qual fornecedor comprar cada item.</p>
            {editavel && (
              <div className="flex gap-2">
                <div className="flex-1"><SearchSelect value={novoItem} onChange={addItem} options={itemOpts} placeholder="Adicionar item à cotação" /></div>
                <Button variant="outline" onClick={() => setCriarItem(true)}><Plus className="mr-1 h-4 w-4" /> Novo item</Button>
              </div>
            )}
            <QuickCreateDialog open={criarItem} onOpenChange={setCriarItem} title="Novo item" table="itens"
              fields={ITEM_RAPIDO}
              onCreated={(id) => { void qc.invalidateQueries({ queryKey: ["table", "itens"] }); void addItem(id); }} />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qtd.</th>
                    <th className="px-3 py-2 text-left">Un.</th>
                    {fornCot.map((f) => (
                      <th key={String(f["id"])} className="min-w-32 px-3 py-2 text-right">
                        {nomeParc(parceiroById.get(String(f["fornecedor_id"])))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...itensCot].sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""))).map((it) => {
                    const item = itemById.get(String(it["item_id"]));
                    const best = analise.escolhas.find((m) => m.cotacaoItem === it);
                    return (
                      <tr key={String(it["id"])} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-medium">{String(item?.["descricao"] ?? "Item")}</div>
                          {item?.["codigo"] ? <div className="text-muted-foreground text-xs">{String(item["codigo"])}</div> : null}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {editavel ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input key={String(it["quantidade"])} defaultValue={formatQtd(it["quantidade"])} inputMode="decimal" aria-label="Quantidade" className="h-8 w-20 text-right" onBlur={(e) => salvarQtd(it, e.target.value)} />
                              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remover item" onClick={() => removerItem(it)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ) : formatQtd(it["quantidade"])}
                        </td>
                        <td className="px-2 py-1.5">
                          {editavel ? (
                            <div className="w-28"><SearchSelect value={String(it["unidade"] ?? "")} onChange={(v) => salvarUnidade(it, v)} options={unidadeOpts} placeholder="Un." /></div>
                          ) : String(it["unidade"] ?? "—")}
                        </td>
                        {fornCot.map((f) => {
                          const fid = String(f["fornecedor_id"]);
                          const p = precoDe(String(it["id"]), fid);
                          const melhor = best?.fornecedorId === fid;
                          const valido = !!p && p["disponivel"] !== false && num(p["preco_unitario"]) > 0;
                          return (
                            <td key={fid} className={cn("px-2 py-1.5 text-right", melhor && "bg-success/15")}>
                              <div className="flex items-center justify-end gap-1">
                              {editavel && valido && (
                                <button type="button" aria-label="Comprar deste fornecedor" title="Comprar deste fornecedor" onClick={() => escolher(it, melhor && best?.manual ? null : fid)} className={cn("shrink-0", melhor ? "text-success" : "text-muted-foreground hover:text-foreground")}>
                                  {melhor ? <CircleDot className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                                </button>
                              )}
                              {editavel ? (
                                <Input
                                  key={String(p?.["preco_unitario"] ?? "")}
                                  defaultValue={p && num(p["preco_unitario"]) > 0 ? String(p["preco_unitario"]).replace(".", ",") : ""}
                                  placeholder="—"
                                  inputMode="decimal"
                                  aria-label="Preço unitário"
                                  className={cn("h-8 text-right tabular-nums", melhor && "border-success font-semibold")}
                                  onBlur={(e) => salvarPreco(it, f, e.target.value)}
                                />
                              ) : (
                                <span className={cn("tabular-nums", melhor && "text-success font-semibold")}>
                                  {p && num(p["preco_unitario"]) > 0 ? formatBRL(p["preco_unitario"]) : "—"}
                                </span>
                              )}
                              </div>
                              {valido && num(p!["prazo_dias"]) > 0 && <div className="text-muted-foreground mt-0.5 text-xs">{num(p!["prazo_dias"])} dias</div>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {fornCot.length > 0 && (
                  <tfoot className="bg-muted/30 border-t font-semibold">
                    <tr>
                      <td className="px-3 py-2" colSpan={3}>Total por fornecedor</td>
                      {fornCot.map((f) => {
                        const fid = String(f["fornecedor_id"]);
                        const t = analise.totais.get(fid);
                        return (
                          <td key={fid} className={cn("px-3 py-2 text-right tabular-nums", analise.vencedor === fid && "text-success")}>
                            {t && t.total > 0 ? formatBRL(t.total) : "—"}
                            {t && !t.completo && t.total > 0 && <div className="text-warning text-xs font-normal">incompleto</div>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-muted-foreground flex items-center gap-1 text-xs uppercase"><Trophy className="h-4 w-4" />Fornecedor único mais barato</div>
                <div className="mt-1 text-lg font-bold">{vencedorNome ?? "—"}</div>
                <div className="text-muted-foreground text-sm">{analise.vencedor ? formatBRL(analise.totais.get(analise.vencedor)!.total) : "Nenhum fornecedor cotou todos os itens"}</div>
              </div>
              <div className="border-success/50 bg-success/10 rounded-lg border p-4">
                <div className="text-muted-foreground text-xs uppercase">Melhor preço item a item</div>
                <div className="mt-1 text-lg font-bold">{formatBRL(analise.split)}</div>
                <div className="text-muted-foreground text-sm">
                  {analise.vencedor && analise.split < analise.totais.get(analise.vencedor)!.total
                    ? `Economia de ${formatBRL(analise.totais.get(analise.vencedor)!.total - analise.split)} dividindo a compra`
                    : `${analise.melhores.length} de ${itensCot.length} itens com preço`}
                </div>
              </div>
            </div>
          </section>

          <PainelAprovacaoCotacao cotacaoId={cid} valorTotal={analise.split}>{(sitAprov) => (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Pedidos de compra</h3>
              {canUpdate && (
                <Button size="sm" disabled={gerando || analise.escolhas.length === 0 || !podeGerarPedido(sitAprov)} title={!podeGerarPedido(sitAprov) ? "Aguardando aprovação da cotação" : undefined} onClick={gerarPedidos}>
                  {gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
                  {pedidosCot.length ? "Gerar novamente" : "Gerar pedidos de compra"}
                </Button>
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {[...analise.porForn].map(([fid, g]) => {
                const fc = fornCot.find((x) => String(x["fornecedor_id"]) === fid);
                const ped = pedidosCot.find((p) => String(p["fornecedor_id"]) === fid);
                return (
                  <div key={fid} className="space-y-1 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{nomeParc(parceiroById.get(fid))}</div>
                        <div className="text-muted-foreground text-xs">
                          {g.itens.length} {g.itens.length === 1 ? "item" : "itens"} · prazo até {g.prazo} dias
                          {fc?.["condicao_pagamento"] ? ` · ${String(fc["condicao_pagamento"])}` : ""}
                          {fc?.["frete"] ? ` · frete ${String(fc["frete"])}` : ""}
                        </div>
                      </div>
                      <div className="text-right font-semibold tabular-nums">{formatBRL(g.total)}</div>
                    </div>
                    {ped ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-sm font-semibold tabular-nums">{String(ped["numero"] ?? "")}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", ped["status"] === "recebido" ? "bg-success/15 text-success" : ped["status"] === "enviado" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning")}>
                          {ped["status"] === "recebido" ? "Recebido" : ped["status"] === "enviado" ? "Enviado" : "Rascunho"}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => enviarPedido(ped)}><MessageCircle className="mr-1 h-4 w-4" />Enviar</Button>
                        {ped["status"] === "enviado" && canUpdate && <Button size="sm" variant="ghost" onClick={() => marcarRecebido(ped)}>Receber mercadoria</Button>}
                      </div>
                    ) : (
                      <div className="text-muted-foreground pt-1 text-xs">Pedido ainda não gerado.</div>
                    )}
                  </div>
                );
              })}
              {analise.porForn.size === 0 && <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm md:col-span-2">Os pedidos aparecem aqui quando houver preços cotados.</p>}
            </div>
          </section>
          )}</PainelAprovacaoCotacao>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {editavel && (
            <Button
              disabled={aprovando || analise.escolhas.length === 0}
              onClick={async () => {
                if (analise.escolhas.length < itensCot.length && !await confirmar("Alguns itens estão sem preço e ficarão sem custo na oferta. Aprovar mesmo assim?")) return;
                onAprovar(analise.escolhas);
              }}
            >
              {aprovando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Aprovar e gerar oferta
            </Button>
          )}
        </div>
      </SheetContent>
      <PreencherCotacaoDialog
        open={!!preencher}
        onOpenChange={(o) => !o && setPreencher(null)}
        cotacaoId={cid}
        fornecedor={preencher}
        fornecedorNome={preencher ? nomeParc(parceiroById.get(String(preencher["fornecedor_id"]))) : ""}
        itensCot={itensCot}
        precos={precos}
        itemById={itemById}
        onSaved={invalidar}
      />
    </Sheet>
  );
}
