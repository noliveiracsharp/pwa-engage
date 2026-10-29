import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Handshake, Send } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useSaveOrcamento } from "@/hooks/useSaveOrcamento";
import { linhasOfertaDaInspecao } from "@/lib/laudo-oferta";
import { todayISO } from "@/lib/orcamentos";
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
import { STATUS_LEVANTAMENTO, statusLevantamento } from "@/lib/levantamento";

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
  const { data: ofertas = [] } = useTableRows("orcamentos");
  const salvarOferta = useSaveOrcamento();
  const navigate = useNavigate();
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
  const ofertaPorLaudo = useMemo(() => new Map(ofertas.filter((o) => o["laudo_id"]).map((o) => [String(o["laudo_id"]), o])), [ofertas]);
  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i)), i])), [itens]);
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
        ...(l.grupo.trim() ? { grupo: l.grupo.trim() } : {}),
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
      return { id, inspecao, nc: linhas.filter((l) => !l.conforme).length };
    },
    onSuccess: async ({ id, inspecao, nc }) => {
      for (const t of ["laudos_tecnicos", "laudos_itens", "laudos_fotos"]) qc.invalidateQueries({ queryKey: ["table", t] });
      toast.success("Laudo salvo com sucesso.");
      setOpen(false);
      if (!inspecao || ofertaPorLaudo.has(id) || !perms.canUpdate) return;
      const ok = await confirmar({
        title: "Enviar ao Comercial?",
        description: nc
          ? `Inspeção salva com ${nc} não conformidade(s). Deseja gerar uma Oferta para o Comercial negociar com o cliente?`
          : "Inspeção salva. Deseja gerar uma Oferta para o Comercial?",
        confirmText: "Gerar Oferta",
        cancelText: "Apenas salvar",
      } as never);
      if (ok) gerarOferta.mutate(id);
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
        linhas.map((l) => ({ cotacao_id: cid, item_id: l["item_id"], quantidade: l["quantidade"], observacao: l["observacao"] ?? null, ...(l["grupo"] ? { grupo: l["grupo"] } : {}) })) as never,
      );
      if (e2) throw e2;
      const hist = Array.isArray(r["levantamento_historico"]) ? (r["levantamento_historico"] as unknown[]) : [];
      await supabase.from("laudos_tecnicos").update({ status: "Enviado p/ cotação", levantamento_status: "cotacao_gerada", levantamento_historico: [...hist, { em: new Date().toISOString(), usuario: "Compras", acao: "cotacao", obs: `Cotação ${numero}` }] } as never).eq("id", String(rowId(r)));
      return numero;
    },
    onSuccess: (numero) => {
      for (const t of ["cotacoes", "cotacoes_itens", "laudos_tecnicos"]) qc.invalidateQueries({ queryKey: ["table", t] });
      toast.success(`Cotação ${numero} criada e enviada para Compras.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar a cotação."),
  });

  const gerarOferta = useMutation({
    mutationFn: async (laudoId: string) => {
      const [{ data: laudo, error }, { data: lls, error: e2 }] = await Promise.all([
        supabase.from("laudos_tecnicos").select("*").eq("id", laudoId).single(),
        supabase.from("laudos_itens").select("*").eq("laudo_id", laudoId).order("ordem"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      const l = laudo as Row;
      const linhas = linhasOfertaDaInspecao((lls ?? []) as Row[], itemById);
      const cls = classificacaoMeta(l["classificacao"])?.label;
      const hoje = todayISO();
      const res = await salvarOferta.mutateAsync({
        original: null,
        linhas,
        header: {
          empresa_id: l["empresa_id"] ?? empresaId,
          parceiro_id: l["parceiro_id"],
          usuario_id: usuarioId ?? null,
          dt_orcamento: hoje,
          situacao: "Em andamento",
          laudo_id: laudoId,
          origem_lead: "Inspeção técnica",
          origem_lead_desc: `Laudo ${l["numero"] ?? ""}${cls ? ` · ${cls}` : ""} · ${linhas.length} não conformidade(s)`,
          descricao: `Inspeção técnica ${l["numero"] ?? ""} · ${nomeCliente(l)}`,
          total_bruto: linhas.reduce((s, x) => s + x.total_linha, 0),
        },
      });
      const tecnico = String(pick(usuarioById.get(String(l["tecnico_usuario_id"])) ?? {}, ["nome", "email"]) ?? "técnico");
      await supabase.from("orcamento_interacoes" as never).insert({
        orcamento_id: res.id, tipo: "nota", empresa_id: l["empresa_id"] ?? empresaId ?? null, usuario_id: usuarioId ?? null,
        descricao: `Oferta criada a partir da Inspeção Técnica ${l["numero"] ?? ""} realizada por ${tecnico}. ${linhas.length} item(ns) não conforme(s) aguardando precificação.`,
      } as never);
      await supabase.from("laudos_tecnicos").update({ status: "Enviado ao Comercial" }).eq("id", laudoId);
      return res;
    },
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ["table", "laudos_tecnicos"] });
      qc.invalidateQueries({ queryKey: ["table", "orcamentos"] });
      if (await confirmar({ title: `Oferta ${res.numero} criada`, description: "Deseja abrir a tela de Ofertas para precificar?", confirmText: "Abrir Ofertas", cancelText: "Depois" } as never))
        navigate({ to: "/orcamentos" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível gerar a Oferta."),
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
          {isInspecao(r["objetivo"]) && ofertaPorLaudo.has(String(rowId(r))) && (
            <span className="self-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary" title="Oferta gerada a partir desta inspeção">
              Oferta {String(ofertaPorLaudo.get(String(rowId(r)))?.["numero"] ?? "")}
            </span>
          )}
          {isInspecao(r["objetivo"]) && !ofertaPorLaudo.has(String(rowId(r))) && perms.canUpdate && (
            <Button size="icon" variant="ghost" aria-label="Enviar ao Comercial" title="Enviar ao Comercial (gerar Oferta)" disabled={gerarOferta.isPending} onClick={() => gerarOferta.mutate(String(rowId(r)))}><Handshake className="h-4 w-4" /></Button>
          )}
          {!isInspecao(r["objetivo"]) && (
            <span className={cn("self-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_LEVANTAMENTO[statusLevantamento(r["levantamento_status"])].cls)}>
              {STATUS_LEVANTAMENTO[statusLevantamento(r["levantamento_status"])].label}
            </span>
          )}
          {!isInspecao(r["objetivo"]) && !cotadoPorLaudo.has(String(rowId(r))) && perms.canUpdate && statusLevantamento(r["levantamento_status"]) === "aprovado" && (
            <Button size="icon" variant="ghost" aria-label="Enviar para cotação" title="Enviar para cotação" disabled={enviarCotacao.isPending} onClick={() => enviarCotacao.mutate(r)}><Send className="h-4 w-4" /></Button>
          )}
        </div>
      ),
    },
  ];

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  return (
    <>
      <DataTable
        title="Laudos Técnicos"
        columns={columns}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(row, i) => String(rowId(row) ?? i)}
        onAdd={perms.canCreate ? () => { setRecord(null); setOpen(true); } : undefined}
        onEdit={perms.canUpdate ? (r) => { setRecord(r); setOpen(true); } : undefined}
        onDelete={perms.canDelete ? (r) => remove.mutate(r) : undefined}
        filters={
          <>
            <FilterInput label="Buscar" value={f.busca} onChange={(v) => setF({ ...f, busca: v })} placeholder="Número, cliente…" />
            <FilterSelect label="Objetivo" value={f.objetivo} onChange={(v) => setF({ ...f, objetivo: v })} options={[{ value: "todos", label: "Todos" }, ...OBJETIVOS]} />
            <FilterSelect label="Classificação" value={f.classificacao} onChange={(v) => setF({ ...f, classificacao: v })} options={[{ value: "todos", label: "Todas" }, ...CLASSIFICACOES.map((c) => ({ value: c.value, label: c.label }))]} />
          </>
        }
      />

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
    </>
  );
}
