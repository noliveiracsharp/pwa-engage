import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Download, FileCode2, RefreshCw, Send } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { notasDaOferta, pendenciasNota, statusNota, STATUS_NOTA, type RascunhoNota } from "@/lib/notas-fiscais";
import { formatBRL, formatDate } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notas_fiscais")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Notas Fiscais — Atende.ai" },
      { name: "description", content: "Emissão de NF-e para produtos e NFS-e para serviços, com PDF e XML." },
      { property: "og:title", content: "Notas Fiscais — Atende.ai" },
      { property: "og:description", content: "Emissão de NF-e para produtos e NFS-e para serviços, com PDF e XML." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotasFiscaisPage,
});

const nomeParc = (p?: Row) => String(pick(p ?? {}, ["razao_social", "nome_fantasia", "nome"]) ?? "—");

async function chamar(acao: string, dados: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("notas-fiscais", { body: { acao, ...dados } });
  const erro = (data as { erro?: string } | null)?.erro;
  if (error || erro) throw new Error(erro ?? "Não foi possível falar com o serviço de notas. Confira se a função notas-fiscais foi publicada.");
  return data as { status?: string };
}

function NotasFiscaisPage() {
  const perms = usePagePermissions("/notas_fiscais");
  const { empresaId } = useAudit();
  const qc = useQueryClient();
  const { data: notas = [], isLoading } = useTableRows("notas_fiscais");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: ofertas = [] } = useTableRows("orcamentos");
  const { data: catalogo = [] } = useTableRows("itens");
  const remove = useDeleteRecord("notas_fiscais");
  const [f, setF] = useState({ busca: "", tipo: "todos", status: "todos" });
  const [gerar, setGerar] = useState(false);
  const [ofertaId, setOfertaId] = useState("");
  const [recorrentes, setRecorrentes] = useState(false);
  const [previa, setPrevia] = useState<RascunhoNota[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const parcById = useMemo(() => new Map(parceiros.map((p) => [String(rowId(p)), p])), [parceiros]);
  const ofById = useMemo(() => new Map(ofertas.map((o) => [String(rowId(o)), o])), [ofertas]);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["table", "notas_fiscais"] });

  const rows = useMemo(() => notas
    .filter((n) => {
      const p = parcById.get(String(n["parceiro_id"] ?? ""));
      const o = ofById.get(String(n["orcamento_id"] ?? ""));
      return matchesAny([n["numero"], nomeParc(p), o?.["numero"]], f.busca)
        && (f.tipo === "todos" || n["tipo"] === f.tipo) && (f.status === "todos" || n["status"] === f.status);
    })
    .sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""))), [notas, f, parcById, ofById]);

  const calcularPrevia = async (id: string, rec: boolean) => {
    setOfertaId(id);
    if (!id) return setPrevia([]);
    const { data, error } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", id);
    if (error) return toast.error(error.message);
    const cat = new Map(catalogo.map((i) => [String(rowId(i)), i]));
    setPrevia(notasDaOferta(ofById.get(id) ?? {}, (data ?? []) as Row[], cat, rec));
  };

  const criarRascunhos = async () => {
    if (!previa.length) return;
    const of = ofById.get(ofertaId);
    const { error } = await supabase.from("notas_fiscais").insert(previa.map((n) => ({
      empresa_id: empresaId, tipo: n.tipo, parceiro_id: n.parceiro_id, orcamento_id: ofertaId, valor: n.valor, itens: n.itens,
      discriminacao: n.tipo === "nfse" ? `Oferta ${String(of?.["numero"] ?? "")} — ${n.itens.map((i) => i.descricao).join("; ")}` : null,
    })) as never);
    if (error) return toast.error(error.message.includes("notas_fiscais") ? "Rode o script de Notas Fiscais no SQL Editor." : error.message);
    toast.success(`${previa.length} nota(s) criada(s) como rascunho.`);
    setGerar(false); setPrevia([]); setOfertaId(""); void recarregar();
  };

  const acao = async (n: Row, tipo: "emitir" | "consultar" | "cancelar") => {
    const id = String(rowId(n));
    let motivo: string | null = null;
    if (tipo === "emitir") {
      const p = parcById.get(String(n["parceiro_id"] ?? ""));
      const pend = pendenciasNota({ tipo: n["tipo"] as "nfe", parceiro_id: (n["parceiro_id"] as string) ?? null, valor: Number(n["valor"] ?? 0), itens: (n["itens"] as never) ?? [] },
        String(pick(p ?? {}, ["documento", "cnpj", "cpf"]) ?? ""));
      if (pend.length) return toast.error(pend.join(" "));
      if (!(await confirmar({ title: "Emitir nota fiscal?", description: `${n["tipo"] === "nfe" ? "NF-e" : "NFS-e"} de ${formatBRL(n["valor"])} para ${nomeParc(p)}.` }))) return;
    }
    if (tipo === "cancelar") {
      motivo = await perguntar({ title: "Cancelar nota fiscal", description: "Informe a justificativa (mínimo 15 caracteres).", multiline: true } as never);
      if (!motivo) return;
    }
    setOcupado(id);
    try {
      const r = await chamar(tipo, { id, motivo });
      toast.success(tipo === "emitir" ? "Nota enviada. Use Atualizar status em instantes." : tipo === "cancelar" ? "Nota cancelada." : `Status: ${statusNota(r.status).label}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setOcupado(null); void recarregar(); }
  };

  const columns: Column[] = [
    { key: "tipo", header: "Tipo", fields: ["tipo"], render: (r) => <span className="font-semibold">{r["tipo"] === "nfe" ? "NF-e (produto)" : "NFS-e (serviço)"}</span> },
    { key: "numero", header: "Número", fields: ["numero"], render: (r) => <span className="tabular-nums">{String(r["numero"] ?? "—")}</span> },
    { key: "cliente", header: "Cliente", fields: ["parceiro_id"], render: (r) => <span className="block max-w-64 truncate">{nomeParc(parcById.get(String(r["parceiro_id"] ?? "")))}</span> },
    { key: "oferta", header: "Oferta", fields: ["orcamento_id"], render: (r) => String(ofById.get(String(r["orcamento_id"] ?? ""))?.["numero"] ?? "—") },
    { key: "valor", header: "Valor", fields: ["valor"], render: (r) => <span className="tabular-nums">{formatBRL(r["valor"])}</span> },
    { key: "data", header: "Criada em", fields: ["created_at"], render: (r) => formatDate(r["created_at"]) },
    {
      key: "status", header: "Situação", fields: ["status"],
      render: (r) => {
        const s = statusNota(r["status"]);
        return <span title={String(r["erro"] ?? "")} className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.badge)}>{ocupado === String(rowId(r)) ? "Aguarde…" : s.label}</span>;
      },
    },
  ];

  if (!perms.loading && !perms.canRead) return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;

  return (
    <>
      <DataTable
        title="Notas Fiscais"
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={perms.canCreate ? () => setGerar(true) : undefined}
        onDelete={perms.canDelete ? (r) => (["rascunho", "erro"].includes(String(r["status"])) ? remove.mutate(r) : toast.error("Só é possível excluir rascunhos ou notas com erro.")) : undefined}
        rowMenu={(r) => {
          const st = String(r["status"] ?? "rascunho");
          return (
            <>
              {perms.canUpdate && ["rascunho", "erro"].includes(st) && <DropdownMenuItem onClick={() => void acao(r, "emitir")}><Send className="h-4 w-4" />Emitir</DropdownMenuItem>}
              {st === "processando" && <DropdownMenuItem onClick={() => void acao(r, "consultar")}><RefreshCw className="h-4 w-4" />Atualizar status</DropdownMenuItem>}
              {r["pdf_url"] && <DropdownMenuItem onClick={() => window.open(String(r["pdf_url"]), "_blank", "noopener")}><Download className="h-4 w-4" />{r["tipo"] === "nfe" ? "DANFE (PDF)" : "Nota (PDF)"}</DropdownMenuItem>}
              {r["xml_url"] && <DropdownMenuItem onClick={() => window.open(String(r["xml_url"]), "_blank", "noopener")}><FileCode2 className="h-4 w-4" />XML</DropdownMenuItem>}
              {perms.canUpdate && st === "autorizada" && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void acao(r, "cancelar")}><Ban className="h-4 w-4" />Cancelar nota</DropdownMenuItem>}
            </>
          );
        }}
        filters={
          <>
            <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Número, cliente ou Oferta" />
            <FilterSelect label="Tipo" value={f.tipo} onChange={(v) => setF({ ...f, tipo: v })} options={[{ value: "todos", label: "Todos" }, { value: "nfe", label: "NF-e (produtos)" }, { value: "nfse", label: "NFS-e (serviços)" }]} />
            <FilterSelect label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: "todos", label: "Todas" }, ...Object.entries(STATUS_NOTA).map(([value, s]) => ({ value, label: s.label }))]} />
          </>
        }
      />
      <Dialog open={gerar} onOpenChange={(o) => { setGerar(o); if (!o) { setPrevia([]); setOfertaId(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar notas a partir da Oferta</DialogTitle>
            <DialogDescription>Produtos viram NF-e e serviços viram NFS-e, separados por quem paga.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Oferta</Label>
              <SearchSelect value={ofertaId} onChange={(v) => void calcularPrevia(v, recorrentes)} placeholder="Selecione a Oferta"
                options={ofertas.map((o) => ({ value: String(rowId(o)), label: `${String(o["numero"] ?? "")} — ${nomeParc(parcById.get(String(o["parceiro_id"] ?? "")))}` }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div><Label>Faturar mensalidade (recorrência)</Label><p className="text-muted-foreground text-xs">Recorrência nunca sai junto com a implantação.</p></div>
              <Switch checked={recorrentes} onCheckedChange={(v) => { setRecorrentes(v); void calcularPrevia(ofertaId, v); }} />
            </div>
            {ofertaId && (previa.length ? (
              <ul className="divide-y rounded-md border text-sm">
                {previa.map((n, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 p-2.5">
                    <div className="min-w-0"><div className="font-semibold">{n.tipo === "nfe" ? "NF-e" : "NFS-e"} · {n.itens.length} item(ns)</div>
                      <div className="text-muted-foreground truncate text-xs">{nomeParc(parcById.get(String(n.parceiro_id ?? "")))}</div></div>
                    <span className="tabular-nums font-semibold">{formatBRL(n.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-muted-foreground text-sm">Nenhum item faturável nesta Oferta.</p>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGerar(false)}>Cancelar</Button>
            <Button disabled={!previa.length} onClick={() => void criarRascunhos()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
