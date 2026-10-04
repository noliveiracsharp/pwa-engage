import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Pencil, Send, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { Button } from "@/components/ui/button";
import { LaudoSheet, type LaudoForm, type LaudoLinha } from "@/components/laudos/LaudoSheet";
import { LaudoPDF } from "@/components/laudos/LaudoPDF";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { matchesAny } from "@/lib/input-masks";
import { CLASSIFICACOES, classificacaoMeta, isInspecao, objetivoLabel, OBJETIVOS, proximoNumero } from "@/lib/laudos";
import { formatDate } from "@/lib/orcamentos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/laudos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Laudos Técnicos — Atende.ai" },
      { name: "description", content: "Levantamentos e inspeções técnicas em campo com checklist, fotos e relatório para o cliente." },
      { property: "og:title", content: "Laudos Técnicos — Atende.ai" },
      { property: "og:description", content: "Levantamentos e inspeções técnicas em campo com checklist, fotos e relatório para o cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LaudosPage,
});

function LaudosPage() {
  const qc = useQueryClient();
  const perms = usePagePermissions("/laudos");
  const { empresaId, usuarioId } = useAudit();
  const { empresa } = useAuth();
  const { data: laudos = [], isLoading } = useTableRows("laudos_tecnicos");
  const { data: todasLinhas = [] } = useTableRows("laudos_itens");
  const { data: todasFotos = [] } = useTableRows("laudos_fotos");
  const { data: cotacoes = [] } = useTableRows("cotacoes");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: itens = [] } = useTableRows("itens");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const remove = useDeleteRecord("laudos_tecnicos");

  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [f, setF] = useState({ busca: "", objetivo: "todos", classificacao: "todos" });

  const parceiroById = useMemo(() => new Map(parceiros.map((p) => [String(rowId(p)), p])), [parceiros]);
  const usuarioById = useMemo(() => new Map(usuarios.map((u) => [String(rowId(u)), u])), [usuarios]);
  const clientes = useMemo(() => {
    const c = parceiros.filter((p) => p["is_cliente"] === true);
    return c.length ? c : parceiros;
  }, [parceiros]);
  const cotadoPorLaudo = useMemo(() => new Set(cotacoes.map((c) => String(c["laudo_id"] ?? ""))), [cotacoes]);
  const linhasDe = (r: Row | null) => (r ? todasLinhas.filter((l) => String(l["laudo_id"]) === String(rowId(r))) : []);
  const fotosDe = (r: Row | null) => (r ? todasFotos.filter((l) => String(l["laudo_id"]) === String(rowId(r))) : []);
  const nomeCliente = (r: Row) => String(pick(parceiroById.get(String(r["parceiro_id"])) ?? {}, ["razao_social", "nome_fantasia"]) ?? "—");

  const save = useMutation({
    mutationFn: async ({ header, linhas, fotosGerais }: { header: LaudoForm; linhas: LaudoLinha[]; fotosGerais: string[] }) => {
      const inspecao = isInspecao(header.objetivo);
      const payload: Row = {
        parceiro_id: header.parceiro_id,
        objetivo: header.objetivo,
        data_visita: header.data_visita || null,
        observacoes_gerais: header.observacoes_gerais.trim() || null,
        laudo_final: inspecao ? header.laudo_final.trim() || null : null,
        classificacao: inspecao ? header.classificacao || null : null,
        updated_at: new Date().toISOString(),
      };
      let id = record ? String(rowId(record)) : "";
      if (record) {
        const { error } = await supabase.from("laudos_tecnicos").update(payload).eq("id", id);
        if (error) throw error;
        await supabase.from("laudos_fotos").delete().eq("laudo_id", id);
        const { error: e2 } = await supabase.from("laudos_itens").delete().eq("laudo_id", id);
        if (e2) throw e2;
      } else {
        const numero = await proximoNumero("laudos_tecnicos", "LAU", empresaId);
        const { data, error } = await supabase
          .from("laudos_tecnicos")
          .insert({ ...payload, numero, empresa_id: empresaId, tecnico_usuario_id: usuarioId ?? null, status: "Concluído" })
          .select("id")
          .single();
        if (error) throw error;
        id = String((data as Row)["id"]);
      }
      const itensPayload = linhas.map((l, i) => ({
        id: crypto.randomUUID(),
        laudo_id: id,
        item_id: l.item_id || null,
        descricao_item: l.descricao_item,
        quantidade: inspecao ? 1 : Number(l.quantidade.replace(",", ".")) || 1,
        conforme: inspecao ? l.conforme : true,
        observacao: l.observacao.trim() || null,
        ordem: i + 1,
      }));
      if (itensPayload.length) {
        const { error } = await supabase.from("laudos_itens").insert(itensPayload);
        if (error) throw error;
      }
      const fotos = [
        ...fotosGerais.map((u) => ({ laudo_id: id, laudo_item_id: null, url_foto: u })),
        ...linhas.flatMap((l, i) => l.fotos.map((u) => ({ laudo_id: id, laudo_item_id: itensPayload[i]!.id, url_foto: u }))),
      ];
      if (fotos.length) {
        const { error } = await supabase.from("laudos_fotos").insert(fotos);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      for (const t of ["laudos_tecnicos", "laudos_itens", "laudos_fotos"]) qc.invalidateQueries({ queryKey: ["table", t] });
      toast.success("Laudo salvo com sucesso.");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar o laudo."),
  });

  const enviarCotacao = useMutation({
    mutationFn: async (r: Row) => {
      const linhas = linhasDe(r).filter((l) => l["item_id"]);
      if (!linhas.length) throw new Error("O laudo não possui itens do cadastro para cotar.");
      const numero = await proximoNumero("cotacoes", "COT", r["empresa_id"] as string);
      const { data, error } = await supabase
        .from("cotacoes")
        .insert({ empresa_id: r["empresa_id"], numero, laudo_id: rowId(r), titulo: `${r["numero"] ?? "Laudo"} · ${nomeCliente(r)}`, status: "pendente" })
        .select("id")
        .single();
      if (error) throw error;
      const cid = (data as Row)["id"];
      const { error: e2 } = await supabase.from("cotacoes_itens").insert(
        linhas.map((l) => ({ cotacao_id: cid, item_id: l["item_id"], quantidade: l["quantidade"], observacao: l["observacao"] ?? null })),
      );
      if (e2) throw e2;
      await supabase.from("laudos_tecnicos").update({ status: "Enviado p/ cotação" }).eq("id", String(rowId(r)));
      return numero;
    },
    onSuccess: (numero) => {
      for (const t of ["cotacoes", "cotacoes_itens", "laudos_tecnicos"]) qc.invalidateQueries({ queryKey: ["table", t] });
      toast.success(`Cotação ${numero} criada e enviada para Compras.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar a cotação."),
  });

  const rows = useMemo(
    () =>
      laudos
        .filter(
          (r) =>
            matchesAny([r["numero"], nomeCliente(r), r["observacoes_gerais"]], f.busca) &&
            (f.objetivo === "todos" || isInspecao(r["objetivo"]) === isInspecao(f.objetivo)) &&
            (f.classificacao === "todos" || r["classificacao"] === f.classificacao),
        )
        .sort((a, b) => String(b["created_at"] ?? "").localeCompare(String(a["created_at"] ?? ""))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [laudos, f, parceiroById],
  );

  const columns: Column[] = [
    { key: "numero", header: "Número", fields: ["numero"], render: (r) => <span className="font-semibold tabular-nums">{String(r["numero"] ?? "—")}</span> },
    { key: "data", header: "Visita", fields: ["data_visita"], render: (r) => formatDate(r["data_visita"]) },
    { key: "cliente", header: "Cliente", fields: ["parceiro_id"], render: (r) => <div className="max-w-64 truncate">{nomeCliente(r)}</div> },
    { key: "objetivo", header: "Objetivo", fields: ["objetivo"], render: (r) => objetivoLabel(r["objetivo"]) },
    {
      key: "resultado", header: "Resultado", fields: ["classificacao"],
      render: (r) => {
        const c = classificacaoMeta(r["classificacao"]);
        if (c) return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", c.badge)}>{c.label}</span>;
        return <span className="text-muted-foreground text-xs">{String(r["status"] ?? "—")}</span>;
      },
    },
    { key: "tecnico", header: "Técnico", fields: ["tecnico_usuario_id"], render: (r) => String(pick(usuarioById.get(String(r["tecnico_usuario_id"])) ?? {}, ["nome", "email"]) ?? "—") },
    {
      key: "acoes", header: "", fields: [],
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" aria-label="Visualizar relatório" onClick={() => setPreview(r)}><FileText className="h-4 w-4" /></Button>
          {!isInspecao(r["objetivo"]) && !cotadoPorLaudo.has(String(rowId(r))) && perms.can_update !== false && (
            <Button size="icon" variant="ghost" aria-label="Enviar para cotação" title="Enviar para cotação" disabled={enviarCotacao.isPending} onClick={() => enviarCotacao.mutate(r)}><Send className="h-4 w-4" /></Button>
          )}
          {perms.can_update !== false && <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setRecord(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
          {perms.can_delete !== false && (
            <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => { if (confirm(`Excluir o laudo ${r["numero"] ?? ""}?`)) remove.mutate(r); }}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Laudos Técnicos</h1>
          <p className="text-muted-foreground text-sm">Levantamentos e inspeções feitos em campo.</p>
        </div>
        {perms.can_create !== false && <Button onClick={() => { setRecord(null); setOpen(true); }}>Novo laudo</Button>}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
        <FilterInput label="Buscar" value={f.busca} onChange={(v: string) => setF({ ...f, busca: v })} placeholder="Número, cliente…" />
        <FilterSelect label="Objetivo" value={f.objetivo} onChange={(v: string) => setF({ ...f, objetivo: v })} options={[{ value: "todos", label: "Todos" }, ...OBJETIVOS]} />
        <FilterSelect label="Classificação" value={f.classificacao} onChange={(v: string) => setF({ ...f, classificacao: v })} options={[{ value: "todos", label: "Todas" }, ...CLASSIFICACOES.map((c) => ({ value: c.value, label: c.label }))]} />
      </div>

      <DataTable rows={rows} columns={columns} loading={isLoading} />

      <LaudoSheet
        open={open}
        onOpenChange={setOpen}
        record={record}
        linhas={linhasDe(record)}
        fotos={fotosDe(record)}
        clientes={clientes}
        itens={itens}
        saving={save.isPending}
        onSave={(v) => save.mutate(v)}
      />
      <LaudoPDF
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        laudo={preview}
        linhas={linhasDe(preview)}
        fotos={fotosDe(preview)}
        empresa={empresa}
        cliente={preview ? parceiroById.get(String(preview["parceiro_id"])) : undefined}
        tecnico={preview ? usuarioById.get(String(preview["tecnico_usuario_id"])) : undefined}
      />
    </div>
  );
}
