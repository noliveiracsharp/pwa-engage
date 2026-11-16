import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Package, Pencil, Plus, Search, Trash2, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import {
  CATEGORIAS_ESTOQUE, SITUACAO_ESTOQUE, TIPOS_MOV_COND, UNIDADES_ESTOQUE, custoMateriais, saldoItem, situacaoEstoque, tipoMovCond, validarMovimento,
} from "@/lib/cond-estoque";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { s, useCondRows } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const T = ["cond_estoque_itens", "cond_estoque_locais", "cond_estoque_movimentacoes"];
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const alfa = <X extends { label: string }>(l: X[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
export const qtdBr = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const catLabel = (v: unknown) => CATEGORIAS_ESTOQUE.find((c) => c.value === v)?.label ?? "Outros";
const LOCAIS_PADRAO = ["Almoxarifado / Zeladoria", "Casa de máquinas", "Depósito da piscina", "Portaria"];

export function useEstoqueCond(condominioId: string) {
  const qc = useQueryClient();
  const itens = useCondRows("cond_estoque_itens", "condominio_id", condominioId).data ?? [];
  const locais = useCondRows("cond_estoque_locais", "condominio_id", condominioId).data ?? [];
  const movs = useCondRows("cond_estoque_movimentacoes", "condominio_id", condominioId).data ?? [];
  const invalidar = () => T.forEach((t) => qc.invalidateQueries({ queryKey: ["cond", t] }));
  return { itens, locais, movs, invalidar };
}

function Pill({ m }: { m: { label: string; cls: string } }) {
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>;
}
function Campo({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><Label htmlFor={id}>{label}</Label>{children}</div>;
}
function Rodape({ onCancel, salvando }: { onCancel: () => void; salvando: boolean }) {
  return (
    <div className="sticky bottom-0 mt-auto flex justify-end gap-2 border-t bg-background p-4">
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
    </div>
  );
}

/* ------------------------------- Aba Estoque & Insumos ------------------------------- */

export function EstoqueCond({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const est = useEstoqueCond(condominioId);
  const { itens, locais, movs, invalidar } = est;
  const [visao, setVisao] = useState<"saldos" | "movs" | "locais">("saldos");
  const [busca, setBusca] = useState("");
  const [local, setLocal] = useState("");
  const [sit, setSit] = useState("");
  const [item, setItem] = useState<Row | null>(null);
  const [mov, setMov] = useState<Row | null>(null);

  const linhas = useMemo(() => itens.map((i) => {
    const saldo = saldoItem(movs as never, s(i["id"]), local || undefined);
    const situacao = situacaoEstoque(saldo, Number(i["estoque_minimo"] ?? 0));
    return { i, saldo, situacao };
  }).filter((l) => (!sit || l.situacao === sit) && norm([l.i["nome"], l.i["codigo"], catLabel(l.i["categoria"])].map(s).join(" ")).includes(norm(busca)))
    .sort((a, b) => s(a.i["nome"]).localeCompare(s(b.i["nome"]), "pt-BR")), [itens, movs, local, sit, busca]);
  const repor = itens.filter((i) => ["abaixo", "zerado"].includes(situacaoEstoque(saldoItem(movs as never, s(i["id"])), Number(i["estoque_minimo"] ?? 0))) && Number(i["estoque_minimo"] ?? 0) > 0).length;
  const valorTotal = itens.reduce((t, i) => t + Math.max(0, saldoItem(movs as never, s(i["id"]))) * Number(i["custo_unitario"] ?? 0), 0);

  const criarLocaisPadrao = async () => {
    const { error } = await db.from("cond_estoque_locais").insert(LOCAIS_PADRAO.map((nome) => ({ condominio_id: condominioId, nome })));
    if (error) return void toast.error(error.message);
    toast.success("Locais criados."); invalidar();
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Itens cadastrados</p><p className="text-xl font-semibold">{itens.length}</p></div>
        <div className={cn("rounded-lg border bg-card p-3", repor && "border-destructive/50")}><p className="text-xs text-muted-foreground">Precisam de reposição</p><p className={cn("text-xl font-semibold", repor && "text-destructive")}>{repor}</p></div>
        <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Valor em estoque</p><p className="text-xl font-semibold">{brl(valorTotal)}</p></div>
      </div>
      <div role="tablist" aria-label="Visões do estoque" className="flex flex-wrap gap-1">
        {([["saldos", "Saldos & itens"], ["movs", "Movimentações"], ["locais", "Locais"]] as const).map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={visao === k} size="sm" variant={visao === k ? "default" : "outline"} onClick={() => setVisao(k)}>{l}</Button>
        ))}
      </div>

      {!locais.length && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
          <Warehouse className="size-5 text-muted-foreground" aria-hidden />
          <span className="flex-1">Cadastre onde os materiais ficam guardados antes de lançar entradas.</span>
          {perms.canCreate && <Button size="sm" onClick={() => void criarLocaisPadrao()}>Criar locais sugeridos</Button>}
        </div>
      )}

      {visao === "saldos" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input aria-label="Buscar" placeholder="Item, código, categoria…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
            </div>
            <SearchSelect value={local} onChange={setLocal} placeholder="Todos os locais" options={alfa(locais.map((l) => ({ value: s(l["id"]), label: s(l["nome"]) })))} className="w-48" />
            <SearchSelect value={sit} onChange={setSit} placeholder="Todas as situações" options={alfa(Object.entries(SITUACAO_ESTOQUE).map(([value, m]) => ({ value, label: m.label })))} className="w-48" />
            <div className="ml-auto flex gap-2">
              {perms.canCreate && <Button variant="outline" disabled={!itens.length || !locais.length} onClick={() => setMov({})}><ArrowLeftRight className="size-4" /> Movimentação</Button>}
              {perms.canCreate && <Button onClick={() => setItem({})}><Plus className="size-4" /> Novo item</Button>}
            </div>
          </div>
          {!linhas.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum item. Cadastre lâmpadas, produtos de limpeza, cloro, pilhas…</p> : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Item</th><th className="p-2">Categoria</th><th className="p-2 text-right">Saldo</th><th className="p-2 text-right">Mínimo</th><th className="p-2 text-right">Custo un.</th><th className="p-2">Situação</th><th className="p-2 text-right">Ações</th></tr></thead>
                <tbody>{linhas.map(({ i, saldo, situacao }) => (
                  <tr key={s(i["id"])} className="border-t">
                    <td className="p-2 font-medium">{s(i["nome"])}{i["codigo"] ? <span className="ml-1 text-xs text-muted-foreground">({s(i["codigo"])})</span> : null}</td>
                    <td className="p-2">{catLabel(i["categoria"])}</td>
                    <td className="p-2 text-right tabular-nums">{qtdBr(saldo)} {s(i["unidade"])}</td>
                    <td className="p-2 text-right tabular-nums">{qtdBr(Number(i["estoque_minimo"] ?? 0))}</td>
                    <td className="p-2 text-right tabular-nums">{i["custo_unitario"] != null ? brl(Number(i["custo_unitario"])) : "—"}</td>
                    <td className="p-2"><Pill m={SITUACAO_ESTOQUE[situacao]} /></td>
                    <td className="p-2"><div className="flex justify-end gap-1">
                      {perms.canCreate && <AcaoIcone titulo="Lançar movimentação" onClick={() => setMov({ item_id: i["id"] })}><ArrowLeftRight className="size-4" /></AcaoIcone>}
                      {perms.canUpdate && <AcaoIcone titulo="Editar item" onClick={() => setItem(i)}><Pencil className="size-4" /></AcaoIcone>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
      {visao === "movs" && <Movimentacoes {...est} />}
      {visao === "locais" && <Locais condominioId={condominioId} perms={perms} {...est} />}
      {item && <ItemSheet condominioId={condominioId} registro={item} onClose={() => setItem(null)} invalidar={invalidar} perms={perms} />}
      {mov && <MovSheet condominioId={condominioId} registro={mov} onClose={() => setMov(null)} {...est} />}
    </section>
  );
}

function Movimentacoes({ itens, locais, movs }: ReturnType<typeof useEstoqueCond>) {
  const [busca, setBusca] = useState("");
  const nItem = new Map(itens.map((i) => [s(i["id"]), i]));
  const nLocal = new Map(locais.map((l) => [s(l["id"]), s(l["nome"])]));
  const lista = movs.filter((m) => norm([nItem.get(s(m["item_id"]))?.["nome"], m["responsavel"], m["documento"], m["observacoes"], tipoMovCond(m["tipo"])?.label].map(s).join(" ")).includes(norm(busca)))
    .sort((a, b) => s(b["dt_movimento"]).localeCompare(s(a["dt_movimento"])));
  return (
    <div className="space-y-2">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Buscar" placeholder="Item, tipo, responsável, nota…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
      </div>
      {!lista.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma movimentação.</p> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="p-2">Data</th><th className="p-2">Tipo</th><th className="p-2">Item</th><th className="p-2 text-right">Qtd.</th><th className="p-2">De → Para</th><th className="p-2">Responsável / doc.</th></tr></thead>
            <tbody>{lista.map((m) => { const it = nItem.get(s(m["item_id"])); const t = tipoMovCond(m["tipo"]); return (
              <tr key={s(m["id"])} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(s(m["dt_movimento"])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="p-2">{t?.label ?? s(m["tipo"])}</td>
                <td className="p-2">{s(it?.["nome"]) || "—"}</td>
                <td className={cn("p-2 text-right tabular-nums", t?.origem && !t.destino ? "text-destructive" : t?.destino && !t.origem ? "text-success" : "")}>{t?.origem && !t.destino ? "−" : t?.destino && !t.origem ? "+" : ""}{qtdBr(Number(m["quantidade"]))} {s(it?.["unidade"])}</td>
                <td className="p-2">{nLocal.get(s(m["local_origem_id"])) ?? "—"} → {nLocal.get(s(m["local_destino_id"])) ?? "—"}</td>
                <td className="p-2">{[m["responsavel"], m["documento"]].map(s).filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ); })}</tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Movimentações não são apagadas. Para corrigir, lance um ajuste de inventário.</p>
    </div>
  );
}

function Locais({ condominioId, perms, locais, movs, invalidar }: { condominioId: string; perms: Perms } & ReturnType<typeof useEstoqueCond>) {
  const [nome, setNome] = useState("");
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    const { error } = await db.from("cond_estoque_locais").insert({ condominio_id: condominioId, nome: nome.trim() });
    if (error) return void toast.error(error.message);
    setNome(""); invalidar();
  };
  const remover = async (l: Row) => {
    if (movs.some((m) => m["local_origem_id"] === l["id"] || m["local_destino_id"] === l["id"])) return void toast.error("Local com movimentações não pode ser excluído.");
    if (!(await confirmar({ title: "Excluir local", description: `Excluir "${s(l["nome"])}"?`, destructive: true } as never))) return;
    const { error } = await db.from("cond_estoque_locais").delete().eq("id", l["id"]);
    if (error) return void toast.error(error.message);
    invalidar();
  };
  return (
    <div className="space-y-3">
      {perms.canCreate && (
        <form onSubmit={add} className="flex max-w-md gap-2">
          <Input aria-label="Nome do local" placeholder="Ex.: DML Torre A" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Button type="submit"><Plus className="size-4" /> Adicionar</Button>
        </form>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">{[...locais].sort((a, b) => s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR")).map((l) => (
        <li key={s(l["id"])} className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <Warehouse className="size-4 text-muted-foreground" aria-hidden /><span className="flex-1">{s(l["nome"])}</span>
          {perms.canDelete && <AcaoIcone titulo="Excluir local" destrutivo onClick={() => void remover(l)}><Trash2 className="size-4" /></AcaoIcone>}
        </li>
      ))}</ul>
    </div>
  );
}

function ItemSheet({ condominioId, registro, onClose, invalidar, perms }: { condominioId: string; registro: Row; onClose: () => void; invalidar: () => void; perms: Perms }) {
  const [v, setV] = useState({
    nome: s(registro["nome"]), codigo: s(registro["codigo"]), categoria: s(registro["categoria"]) || "limpeza", unidade: s(registro["unidade"]) || "un",
    minimo: registro["estoque_minimo"] != null ? String(registro["estoque_minimo"]).replace(".", ",") : "", custo: registro["custo_unitario"] != null ? String(registro["custo_unitario"]).replace(".", ",") : "",
    ativo: registro["ativo"] !== false,
  });
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.nome.trim()) return void toast.error("Informe o nome do item.");
    setSalvando(true);
    const payload = { condominio_id: condominioId, nome: v.nome.trim(), codigo: v.codigo || null, categoria: v.categoria, unidade: v.unidade, estoque_minimo: num(v.minimo), custo_unitario: v.custo ? num(v.custo) : null, ativo: v.ativo };
    const r = registro["id"] ? await db.from("cond_estoque_itens").update(payload).eq("id", registro["id"]) : await db.from("cond_estoque_itens").insert(payload);
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Item salvo."); invalidar(); onClose();
  };
  const pode = registro["id"] ? perms.canUpdate : perms.canCreate;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4"><SheetTitle className="flex items-center gap-2"><Package className="size-5" /> {registro["id"] ? "Editar item" : "Novo item de estoque"}</SheetTitle><SheetDescription>Material de consumo do condomínio (limpeza, elétrica, piscina…).</SheetDescription></SheetHeader>
        <form onSubmit={salvar} className="flex flex-1 flex-col">
          <fieldset disabled={!pode} className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo id="e-nome" label="Nome" className="sm:col-span-2"><Input id="e-nome" value={v.nome} onChange={(e) => setV((o) => ({ ...o, nome: e.target.value }))} placeholder="Ex.: Lâmpada LED tubular 18W" /></Campo>
            <Campo id="e-cat" label="Categoria"><SearchSelect id="e-cat" value={v.categoria} allowClear={false} onChange={(x) => setV((o) => ({ ...o, categoria: x }))} options={alfa(CATEGORIAS_ESTOQUE)} /></Campo>
            <Campo id="e-un" label="Unidade"><SearchSelect id="e-un" value={v.unidade} allowClear={false} onChange={(x) => setV((o) => ({ ...o, unidade: x }))} options={alfa(UNIDADES_ESTOQUE.map((u) => ({ value: u, label: u })))} /></Campo>
            <Campo id="e-min" label="Estoque mínimo"><Input id="e-min" inputMode="decimal" value={v.minimo} onChange={(e) => setV((o) => ({ ...o, minimo: e.target.value }))} placeholder="0" /></Campo>
            <Campo id="e-custo" label="Custo unitário (R$)"><Input id="e-custo" inputMode="decimal" value={v.custo} onChange={(e) => setV((o) => ({ ...o, custo: e.target.value }))} placeholder="0,00" /></Campo>
            <Campo id="e-cod" label="Código (opcional)"><Input id="e-cod" value={v.codigo} onChange={(e) => setV((o) => ({ ...o, codigo: e.target.value }))} /></Campo>
            <div className="flex items-center gap-3 pt-6"><Switch id="e-ativo" checked={v.ativo} onCheckedChange={(x) => setV((o) => ({ ...o, ativo: x }))} /><Label htmlFor="e-ativo">Item ativo</Label></div>
          </fieldset>
          <Rodape onCancel={onClose} salvando={salvando} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MovSheet({ condominioId, registro, onClose, itens, locais, movs, invalidar }: { condominioId: string; registro: Row; onClose: () => void } & ReturnType<typeof useEstoqueCond>) {
  const [v, setV] = useState({ tipo: "entrada_compra", item_id: s(registro["item_id"]), origem: "", destino: locais.length === 1 ? s(locais[0]["id"]) : "", qtd: "", custo: "", documento: "", responsavel: "", obs: "" });
  const [salvando, setSalvando] = useState(false);
  const t = tipoMovCond(v.tipo);
  const it = itens.find((i) => s(i["id"]) === v.item_id);
  const saldoOrigem = v.item_id && v.origem ? saldoItem(movs as never, v.item_id, v.origem) : 0;
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.item_id) return void toast.error("Escolha o item.");
    const q = num(v.qtd);
    const erro = validarMovimento({ tipo: v.tipo, quantidade: q, origem: v.origem, destino: v.destino, saldoOrigem });
    if (erro) return void toast.error(erro);
    setSalvando(true);
    const custo = v.custo ? num(v.custo) : it?.["custo_unitario"] != null ? Number(it["custo_unitario"]) : null;
    const { error } = await db.from("cond_estoque_movimentacoes").insert({
      condominio_id: condominioId, item_id: v.item_id, tipo: v.tipo, quantidade: q, custo_unitario: custo,
      local_origem_id: t?.origem ? v.origem : null, local_destino_id: t?.destino ? v.destino : null,
      documento: v.documento || null, responsavel: v.responsavel || null, observacoes: v.obs || null,
    });
    // Compra com custo informado atualiza o custo de referência do item.
    if (!error && v.tipo === "entrada_compra" && v.custo) await db.from("cond_estoque_itens").update({ custo_unitario: num(v.custo) }).eq("id", v.item_id);
    setSalvando(false);
    if (error) return void toast.error(error.message);
    toast.success("Movimentação registrada."); invalidar(); onClose();
  };
  const optLocais = alfa(locais.filter((l) => l["ativo"] !== false).map((l) => ({ value: s(l["id"]), label: s(l["nome"]) })));
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4"><SheetTitle>Nova movimentação</SheetTitle><SheetDescription>Entrada, saída para consumo, perda ou transferência.</SheetDescription></SheetHeader>
        <form onSubmit={salvar} className="flex flex-1 flex-col">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo id="m-tipo" label="Tipo"><SearchSelect id="m-tipo" value={v.tipo} allowClear={false} onChange={(x) => setV((o) => ({ ...o, tipo: x }))} options={alfa(TIPOS_MOV_COND.filter((x) => x.value !== "saida_os"))} /></Campo>
            <Campo id="m-item" label="Item"><SearchSelect id="m-item" value={v.item_id} onChange={(x) => setV((o) => ({ ...o, item_id: x }))} placeholder="Selecione" options={alfa(itens.filter((i) => i["ativo"] !== false).map((i) => ({ value: s(i["id"]), label: `${s(i["nome"])} (${s(i["unidade"])})` })))} /></Campo>
            {t?.origem && <Campo id="m-orig" label={`Sai de${v.item_id && v.origem ? ` · disponível ${qtdBr(saldoOrigem)}` : ""}`}><SearchSelect id="m-orig" value={v.origem} onChange={(x) => setV((o) => ({ ...o, origem: x }))} placeholder="Local" options={optLocais} /></Campo>}
            {t?.destino && <Campo id="m-dest" label="Vai para"><SearchSelect id="m-dest" value={v.destino} onChange={(x) => setV((o) => ({ ...o, destino: x }))} placeholder="Local" options={optLocais} /></Campo>}
            <Campo id="m-qtd" label={`Quantidade${it ? ` (${s(it["unidade"])})` : ""}`}><Input id="m-qtd" inputMode="decimal" value={v.qtd} onChange={(e) => setV((o) => ({ ...o, qtd: e.target.value }))} /></Campo>
            {v.tipo === "entrada_compra" && <Campo id="m-custo" label="Custo unitário (R$)"><Input id="m-custo" inputMode="decimal" value={v.custo} onChange={(e) => setV((o) => ({ ...o, custo: e.target.value }))} placeholder={it?.["custo_unitario"] != null ? String(it["custo_unitario"]).replace(".", ",") : "0,00"} /></Campo>}
            <Campo id="m-resp" label="Responsável / retirado por"><Input id="m-resp" value={v.responsavel} onChange={(e) => setV((o) => ({ ...o, responsavel: e.target.value }))} placeholder="Ex.: Maria (limpeza)" /></Campo>
            <Campo id="m-doc" label="Nota fiscal / documento"><Input id="m-doc" value={v.documento} onChange={(e) => setV((o) => ({ ...o, documento: e.target.value }))} /></Campo>
            <Campo id="m-obs" label="Observações" className="sm:col-span-2"><Textarea id="m-obs" rows={2} value={v.obs} onChange={(e) => setV((o) => ({ ...o, obs: e.target.value }))} /></Campo>
          </div>
          <Rodape onCancel={onClose} salvando={salvando} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Materiais usados na OS ------------------------------- */

export function MateriaisOs({ condominioId, osId, editavel }: { condominioId: string; osId: string; editavel: boolean }) {
  const { itens, locais, movs, invalidar } = useEstoqueCond(condominioId);
  const [v, setV] = useState({ item_id: "", local: locais.length === 1 ? s(locais[0]["id"]) : "", qtd: "" });
  const [salvando, setSalvando] = useState(false);
  const daOs = movs.filter((m) => s(m["os_id"]) === osId);
  const nItem = new Map(itens.map((i) => [s(i["id"]), i]));
  const total = custoMateriais(daOs);
  const saldo = v.item_id && v.local ? saldoItem(movs as never, v.item_id, v.local) : 0;

  const lancar = async (tipo: "saida_os" | "devolucao", m?: Row) => {
    const item_id = m ? s(m["item_id"]) : v.item_id;
    const q = m ? Number(m["quantidade"]) : num(v.qtd);
    const loc = m ? s(m["local_origem_id"]) : v.local;
    if (!item_id) return void toast.error("Escolha o material.");
    if (tipo === "saida_os") { const e = validarMovimento({ tipo, quantidade: q, origem: loc, saldoOrigem: saldo }); if (e) return void toast.error(e); }
    else if (!(await confirmar({ title: "Devolver ao estoque", description: "Devolver este material ao estoque e retirar o custo da OS?" }))) return;
    setSalvando(true);
    const it = nItem.get(item_id);
    const { error } = await db.from("cond_estoque_movimentacoes").insert({
      condominio_id: condominioId, item_id, tipo, quantidade: q, os_id: osId,
      custo_unitario: m ? m["custo_unitario"] : it?.["custo_unitario"] ?? null,
      local_origem_id: tipo === "saida_os" ? loc : null, local_destino_id: tipo === "devolucao" ? loc : null,
    });
    setSalvando(false);
    if (error) return void toast.error(error.message);
    if (!m) setV((o) => ({ ...o, item_id: "", qtd: "" }));
    invalidar();
  };

  // Saídas já devolvidas não exibem novamente o botão de devolver.
  const devolvidas = new Set<string>();
  const linhas = daOs.filter((m) => m["tipo"] === "saida_os").map((m) => {
    const dev = daOs.find((d) => d["tipo"] === "devolucao" && s(d["item_id"]) === s(m["item_id"]) && Number(d["quantidade"]) === Number(m["quantidade"]) && !devolvidas.has(s(d["id"])));
    if (dev) devolvidas.add(s(dev["id"]));
    return { m, devolvida: !!dev };
  });

  return (
    <div className="space-y-2 px-4 pb-4">
      <div className="flex items-center justify-between"><Label>Materiais utilizados</Label><span className="text-sm font-medium">Custo: {brl(total)}</span></div>
      {linhas.length > 0 && (
        <ul className="divide-y rounded-lg border">{linhas.map(({ m, devolvida }) => { const it = nItem.get(s(m["item_id"])); return (
          <li key={s(m["id"])} className={cn("flex items-center gap-2 p-2 text-sm", devolvida && "text-muted-foreground line-through")}>
            <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">{s(it?.["nome"])} · {qtdBr(Number(m["quantidade"]))} {s(it?.["unidade"])}</span>
            <span className="tabular-nums">{brl(Number(m["quantidade"]) * Number(m["custo_unitario"] ?? 0))}</span>
            {editavel && !devolvida && <AcaoIcone titulo="Devolver ao estoque" disabled={salvando} onClick={() => void lancar("devolucao", m)}><ArrowLeftRight className="size-4" /></AcaoIcone>}
          </li>
        ); })}</ul>
      )}
      {editavel && (itens.length && locais.length ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
          <SearchSelect value={v.item_id} onChange={(x) => setV((o) => ({ ...o, item_id: x }))} placeholder="Material" options={alfa(itens.filter((i) => i["ativo"] !== false).map((i) => ({ value: s(i["id"]), label: `${s(i["nome"])} (${s(i["unidade"])})` })))} />
          <SearchSelect value={v.local} onChange={(x) => setV((o) => ({ ...o, local: x }))} placeholder="Retirado de" options={alfa(locais.map((l) => ({ value: s(l["id"]), label: s(l["nome"]) })))} />
          <Input aria-label="Quantidade" inputMode="decimal" placeholder={v.item_id && v.local ? `Disp. ${qtdBr(saldo)}` : "Qtd."} value={v.qtd} onChange={(e) => setV((o) => ({ ...o, qtd: e.target.value }))} />
          <Button type="button" variant="outline" disabled={salvando} onClick={() => void lancar("saida_os")}><Plus className="size-4" /> Usar</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Cadastre itens e locais na aba Estoque & Insumos para lançar materiais.</p>)}
      {!editavel && !linhas.length && <p className="text-xs text-muted-foreground">Nenhum material lançado.</p>}
    </div>
  );
}
