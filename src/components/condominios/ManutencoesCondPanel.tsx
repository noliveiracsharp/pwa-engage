import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Pencil, Play, Plus, Printer, QrCode, Search, Trash2, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { imprimirElemento } from "@/lib/propostas";
import {
  FREQUENCIAS, MODELOS_PADRAO, PRIORIDADES, STATUS, TIPOS, checklistDoModelo, enviarWhatsappEmpresa, linkAtivo, linkOs, meta,
  prazoSla, preventivasAGerar, proximoNumeroOs, resumoChecklist, type ItemChecklist,
} from "@/lib/manutencoes";
import { SITUACAO_PLANO, STATUS_PATRIMONIO, destinatariosAviso, mensagemResponsaveis, situacaoPlano } from "@/lib/cond-manutencoes";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { CampoData } from "./CampoData";
import { s, useCondRows } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dia = (v: unknown) => (v ? new Date(`${s(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const dh = (v: unknown) => (v ? new Date(s(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const brl = (v: unknown) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const alfa = <T extends { label: string }>(l: T[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
const Pill = ({ m }: { m: { label: string; cls: string } }) => <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>;
const TABELAS = ["manutencao_ativos", "manutencao_planos", "manutencao_os", "manutencao_modelos"];

function useInvalidar() {
  const qc = useQueryClient();
  return () => TABELAS.forEach((t) => qc.invalidateQueries({ queryKey: ["cond", t] }));
}

function Rodape({ onCancel, salvando, rotulo = "Salvar" }: { onCancel: () => void; salvando: boolean; rotulo?: string }) {
  return (
    <div className="sticky bottom-0 mt-auto flex justify-end gap-2 border-t bg-background p-4">
      <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : rotulo}</Button>
    </div>
  );
}

function Campo({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export function ManutencoesCondPanel({ condominioId, nomeCondominio, perms }: { condominioId: string; nomeCondominio: string; perms: Perms }) {
  const { data: ativos = [] } = useCondRows("manutencao_ativos", "condominio_id", condominioId);
  const { data: planos = [] } = useCondRows("manutencao_planos", "condominio_id", condominioId);
  const { data: os = [] } = useCondRows("manutencao_os", "condominio_id", condominioId);
  const { data: modelos = [] } = useCondRows("manutencao_modelos", "condominio_id", condominioId);
  const { data: espacos = [] } = useCondRows("cond_espacos", "condominio_id", condominioId);
  const invalidar = useInvalidar();
  const [aba, setAba] = useState("os");

  // Gera as OS preventivas dos planos que chegaram na antecedência (motor do módulo de Manutenções).
  useEffect(() => {
    if (!perms.canCreate || !planos.length) return;
    const pend = preventivasAGerar(planos.map((p) => ({ id: s(p["id"]), ativo: p["ativo"] !== false, proxima_data: s(p["proxima_data"]), frequencia_meses: Number(p["frequencia_meses"] ?? 1), antecedencia_dias: Number(p["antecedencia_dias"] ?? 7) })), hoje());
    if (!pend.length) return;
    void (async () => {
      let n = 0;
      for (const pl of pend) {
        const p = planos.find((x) => s(x["id"]) === pl.id)!;
        const a = ativos.find((x) => s(x["id"]) === s(p["ativo_id"]));
        const m = modelos.find((x) => s(x["id"]) === s(p["modelo_id"]));
        for (const data of pl.datas) {
          const numero = await proximoNumeroOs(condominioId);
          const { error } = await db.from("manutencao_os").insert({
            empresa_id: condominioId, condominio_id: condominioId, numero, tipo: "preventiva", prioridade: "normal", status: "agendada",
            plano_id: pl.id, ativo_id: p["ativo_id"] ?? null, modelo_id: p["modelo_id"] ?? null, equipamento: s(a?.["nome"]) || s(p["nome"]), local: s(a?.["local"]) || null,
            descricao: s(p["nome"]), data_prevista: new Date(`${data}T${s(p["hora"]) || "09:00"}:00-03:00`).toISOString(),
            checklist: m ? checklistDoModelo(m["itens"]) : [],
          });
          if (!error) n++;
        }
        await db.from("manutencao_planos").update({ proxima_data: pl.proxima }).eq("id", pl.id);
      }
      if (n) toast.success(`${n} preventiva(s) agendada(s) pelos planos.`);
      invalidar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planos.length, condominioId]);

  const ctx = { condominioId, nomeCondominio, perms, ativos, planos, os, modelos, espacos, invalidar };
  return (
    <Tabs value={aba} onValueChange={setAba} className="space-y-4">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="os">Ordens de serviço</TabsTrigger>
        <TabsTrigger value="calendario">Calendário</TabsTrigger>
        <TabsTrigger value="bens">Bens & Patrimônio</TabsTrigger>
        <TabsTrigger value="preventivas">Preventivas</TabsTrigger>
        <TabsTrigger value="modelos">Modelos de checklist</TabsTrigger>
        <TabsTrigger value="relatorio">Relatório</TabsTrigger>
      </TabsList>
      <TabsContent value="os"><Ordens {...ctx} /></TabsContent>
      <TabsContent value="calendario"><Calendario {...ctx} /></TabsContent>
      <TabsContent value="bens"><Bens {...ctx} /></TabsContent>
      <TabsContent value="preventivas"><Planos {...ctx} /></TabsContent>
      <TabsContent value="modelos"><Modelos {...ctx} /></TabsContent>
      <TabsContent value="relatorio"><Relatorio {...ctx} /></TabsContent>
    </Tabs>
  );
}

type Ctx = { condominioId: string; nomeCondominio: string; perms: Perms; ativos: Row[]; planos: Row[]; os: Row[]; modelos: Row[]; espacos: Row[]; invalidar: () => void };

function Busca({ valor, onChange, ph }: { valor: string; onChange: (v: string) => void; ph: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input aria-label="Buscar" placeholder={ph} value={valor} onChange={(e) => onChange(e.target.value)} className="pl-9" />
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{texto}</p>;
}

/* ------------------------------- Bens & Patrimônio ------------------------------- */

function Bens({ condominioId, perms, ativos, espacos, invalidar }: Ctx) {
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const [etiquetas, setEtiquetas] = useState<Record<string, string>>({});
  const nomeEsp = useMemo(() => new Map(espacos.map((e) => [s(e["id"]), s(e["nome"])])), [espacos]);
  const lista = ativos.filter((a) => norm([a["nome"], a["identificacao"], a["marca"], a["modelo"], a["local"], nomeEsp.get(s(a["espaco_id"]))].map(s).join(" ")).includes(norm(busca)))
    .sort((a, b) => s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR"));
  const imprimir = async () => {
    const m: Record<string, string> = {};
    for (const a of lista) if (a["token"]) m[s(a["id"])] = await QRCode.toDataURL(linkAtivo(a["token"]), { margin: 1, width: 240 });
    setEtiquetas(m);
    setTimeout(() => imprimirElemento("cond-etiquetas-qr"), 80);
  };
  const excluir = async (a: Row) => {
    if (!(await confirmar({ title: "Excluir bem", description: `Excluir "${s(a["nome"])}"? O histórico de ordens é mantido.`, destructive: true }))) return;
    const { error } = await db.from("manutencao_ativos").delete().eq("id", a["id"]);
    if (error) return void toast.error(error.message);
    toast.success("Bem excluído."); invalidar();
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Busca valor={busca} onChange={setBusca} ph="Bem, plaqueta, marca, local…" />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void imprimir()} disabled={!lista.length}><QrCode className="size-4" /> Etiquetas QR</Button>
          {perms.canCreate && <Button onClick={() => setEdit({})}><Plus className="size-4" /> Novo bem</Button>}
        </div>
      </div>
      {!lista.length ? <Vazio texto="Nenhum bem cadastrado. Cadastre bombas, gerador, portões, extintores, mobiliário…" /> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Bem</th><th className="p-2">Plaqueta</th><th className="p-2">Local</th><th className="p-2">Qtd</th><th className="p-2">Valor</th><th className="p-2">Status</th><th className="p-2 text-right">Ações</th></tr></thead>
            <tbody>{lista.map((a) => (
              <tr key={s(a["id"])} className="border-t">
                <td className="p-2"><div className="font-medium">{s(a["nome"])}</div><div className="text-xs text-muted-foreground">{[a["marca"], a["modelo"]].map(s).filter(Boolean).join(" · ")}</div></td>
                <td className="p-2 tabular-nums">{s(a["identificacao"]) || "—"}</td>
                <td className="p-2">{nomeEsp.get(s(a["espaco_id"])) || s(a["local"]) || "—"}</td>
                <td className="p-2 tabular-nums">{s(a["quantidade"]) || "1"}</td>
                <td className="p-2 tabular-nums">{brl(a["valor"])}</td>
                <td className="p-2"><Pill m={meta(STATUS_PATRIMONIO, a["status_patrimonio"])} /></td>
                <td className="p-2"><div className="flex justify-end gap-1">
                  <AcaoIcone titulo="Abrir ficha do QR Code" onClick={() => window.open(linkAtivo(a["token"]), "_blank", "noopener")}><QrCode className="size-4" /></AcaoIcone>
                  {perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEdit(a)}><Pencil className="size-4" /></AcaoIcone>}
                  {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={() => void excluir(a)}><Trash2 className="size-4" /></AcaoIcone>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {edit && <BemSheet registro={edit} condominioId={condominioId} espacos={espacos} onClose={() => setEdit(null)} onSaved={invalidar} />}
      <div className="dre-print-src" aria-hidden>
        <div id="cond-etiquetas-qr" className="dre-doc">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {lista.filter((a) => etiquetas[s(a["id"])]).map((a) => (
              <div key={s(a["id"])} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 8, textAlign: "center", breakInside: "avoid" }}>
                <img src={etiquetas[s(a["id"])]} alt="" style={{ width: 140, margin: "0 auto" }} data-no-zoom />
                <div style={{ fontWeight: 600, fontSize: 12 }}>{s(a["nome"])}</div>
                <div style={{ fontSize: 10 }}>{[s(a["identificacao"]), nomeEsp.get(s(a["espaco_id"])) || s(a["local"])].filter(Boolean).join(" · ")}</div>
                <div style={{ fontSize: 9 }}>Aponte a câmera para registrar manutenção ou abrir chamado</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BemSheet({ registro, condominioId, espacos, onClose, onSaved }: { registro: Row; condominioId: string; espacos: Row[]; onClose: () => void; onSaved: () => void }) {
  const CAMPOS = ["nome", "marca", "modelo", "identificacao", "quantidade", "status_patrimonio", "nota_fiscal", "valor", "data_nota", "observacoes", "espaco_id", "local", "numero_serie"];
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS.map((c) => [c, s(registro[c])])));
  const [salvando, setSalvando] = useState(false);
  const set = (k: string) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v["nome"]?.trim()) return void toast.error("Informe o patrimônio.");
    setSalvando(true);
    const payload = {
      ...Object.fromEntries(CAMPOS.map((c) => [c, v[c]?.trim() ? v[c]!.trim() : null])),
      quantidade: Number(v["quantidade"] || 1), valor: v["valor"] ? Number(v["valor"].replace(/\./g, "").replace(",", ".")) : null,
      status_patrimonio: v["status_patrimonio"] || "ativo", categoria: "Patrimônio",
    };
    const r = registro["id"]
      ? await db.from("manutencao_ativos").update(payload).eq("id", registro["id"])
      : await db.from("manutencao_ativos").insert({ ...payload, empresa_id: condominioId, condominio_id: condominioId });
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Bem salvo."); onSaved(); onClose();
  };
  const restam = 500 - (v["observacoes"]?.length ?? 0);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4"><SheetTitle>{registro["id"] ? "Editar bem patrimonial" : "Novo bem patrimonial"}</SheetTitle><SheetDescription>Insira um novo bem ou edite os dados do bem selecionado.</SheetDescription></SheetHeader>
        <form onSubmit={salvar} className="flex flex-1 flex-col">
          <div className="grid gap-4 p-4 sm:grid-cols-6">
            <Campo id="b-nome" label="Patrimônio" className="sm:col-span-6"><Input id="b-nome" value={v["nome"]} onChange={(e) => set("nome")(e.target.value)} placeholder="Ex.: Bomba de recalque 01" /></Campo>
            <Campo id="b-marca" label="Marca" className="sm:col-span-3"><Input id="b-marca" value={v["marca"]} onChange={(e) => set("marca")(e.target.value)} /></Campo>
            <Campo id="b-modelo" label="Modelo" className="sm:col-span-3"><Input id="b-modelo" value={v["modelo"]} onChange={(e) => set("modelo")(e.target.value)} /></Campo>
            <Campo id="b-id" label="Identificação (plaqueta)" className="sm:col-span-2"><Input id="b-id" value={v["identificacao"]} onChange={(e) => set("identificacao")(e.target.value)} /></Campo>
            <Campo id="b-qtd" label="Quantidade" className="sm:col-span-2"><Input id="b-qtd" inputMode="numeric" value={v["quantidade"]} onChange={(e) => set("quantidade")(e.target.value.replace(/\D/g, ""))} placeholder="1" /></Campo>
            <Campo id="b-st" label="Status" className="sm:col-span-2"><SearchSelect id="b-st" value={v["status_patrimonio"] || "ativo"} allowClear={false} onChange={set("status_patrimonio")} options={alfa(STATUS_PATRIMONIO)} /></Campo>
            <Campo id="b-nf" label="Nota fiscal" className="sm:col-span-2"><Input id="b-nf" value={v["nota_fiscal"]} onChange={(e) => set("nota_fiscal")(e.target.value)} /></Campo>
            <Campo id="b-valor" label="Valor (R$)" className="sm:col-span-2"><Input id="b-valor" inputMode="decimal" value={v["valor"]} onChange={(e) => set("valor")(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" /></Campo>
            <Campo id="b-dn" label="Data da nota" className="sm:col-span-2"><CampoData id="b-dn" value={v["data_nota"] ?? ""} onChange={set("data_nota")} inicio={1990} /></Campo>
            <Campo id="b-desc" label={`Descritivo do patrimônio (restam ${restam} caracteres)`} className="sm:col-span-6"><Textarea id="b-desc" maxLength={500} rows={4} value={v["observacoes"]} onChange={(e) => set("observacoes")(e.target.value)} /></Campo>
            <Campo id="b-esp" label="Espaço social" className="sm:col-span-3"><SearchSelect id="b-esp" value={v["espaco_id"] ?? ""} onChange={set("espaco_id")} placeholder="Selecione" options={alfa(espacos.map((e) => ({ value: s(e["id"]), label: s(e["nome"]) })))} /></Campo>
            <Campo id="b-local" label="Ou especifique o local" className="sm:col-span-3"><Input id="b-local" value={v["local"]} onChange={(e) => set("local")(e.target.value)} placeholder="Ex.: Barrilete, Subsolo 2" /></Campo>
          </div>
          <Rodape onCancel={onClose} salvando={salvando} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Ordens de serviço ------------------------------- */

function Ordens(c: Ctx) {
  const { perms, os } = c;
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [status, setStatus] = useState("");
  const [abrir, setAbrir] = useState<Row | null>(null);
  const lista = os.filter((r) => (!tipo || r["tipo"] === tipo) && (!status || r["status"] === status)
    && norm([r["numero"], r["equipamento"], r["local"], r["descricao"]].map(s).join(" ")).includes(norm(busca)))
    .sort((a, b) => s(b["data_prevista"] || b["created_at"]).localeCompare(s(a["data_prevista"] || a["created_at"])));
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Busca valor={busca} onChange={setBusca} ph="OS, bem, local…" />
        <SearchSelect value={tipo} onChange={setTipo} placeholder="Todos os tipos" options={alfa(TIPOS)} className="w-44" />
        <SearchSelect value={status} onChange={setStatus} placeholder="Todas as situações" options={alfa(STATUS)} className="w-48" />
        {perms.canCreate && <Button className="ml-auto" onClick={() => setAbrir({ tipo: "corretiva" })}><Plus className="size-4" /> Nova corretiva</Button>}
      </div>
      {!lista.length ? <Vazio texto="Nenhuma ordem de serviço. Corretivas abertas aqui ou pelo QR Code dos bens aparecem nesta lista." /> : (
        <ul className="grid gap-2">{lista.map((r) => {
          const ck = resumoChecklist((r["checklist"] as ItemChecklist[]) ?? []);
          return (
            <li key={s(r["id"])}>
              <button type="button" onClick={() => setAbrir(r)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Wrench className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-semibold tabular-nums">{s(r["numero"])}</span>
                <Pill m={meta(TIPOS, r["tipo"])} /><Pill m={meta(STATUS, r["status"])} />
                <span className="min-w-0 flex-1 truncate">{s(r["equipamento"]) || s(r["descricao"])}{r["local"] ? ` · ${s(r["local"])}` : ""}</span>
                {ck.total > 0 && <span className="text-xs text-muted-foreground">{ck.respondidos}/{ck.total}{ck.naoConformes ? ` · ${ck.naoConformes} NC` : ""}</span>}
                <span className="text-xs text-muted-foreground">{dh(r["data_prevista"])}</span>
              </button>
            </li>
          );
        })}</ul>
      )}
      {abrir && <OsSheet {...c} registro={abrir} onClose={() => setAbrir(null)} />}
    </section>
  );
}

function OsSheet({ condominioId, nomeCondominio, perms, ativos, modelos, invalidar, registro, onClose }: Ctx & { registro: Row; onClose: () => void }) {
  const novo = !registro["id"];
  const [v, setV] = useState({
    tipo: s(registro["tipo"]) || "corretiva", prioridade: s(registro["prioridade"]) || "normal", ativo_id: s(registro["ativo_id"]),
    modelo_id: s(registro["modelo_id"]), descricao: s(registro["descricao"]), observacoes: s(registro["observacoes"]),
    data: s(registro["data_prevista"]).slice(0, 10) || hoje(), solicitante: s(registro["solicitante"]),
  });
  const [ck, setCk] = useState<ItemChecklist[]>(((registro["checklist"] as ItemChecklist[]) ?? []).map((i) => ({ ...i })));
  const [salvando, setSalvando] = useState(false);
  const status = s(registro["status"]) || "agendada";
  const encerrada = status === "concluida" || status === "cancelada";
  const pode = novo ? perms.canCreate : perms.canUpdate && !encerrada;
  const r = resumoChecklist(ck);
  const ativo = ativos.find((a) => s(a["id"]) === v.ativo_id);

  const gravar = async (extra: Row = {}) => {
    const payload: Row = {
      tipo: v.tipo, prioridade: v.prioridade, ativo_id: v.ativo_id || null, modelo_id: v.modelo_id || null,
      equipamento: s(ativo?.["nome"]) || s(registro["equipamento"]) || v.descricao.slice(0, 80), local: s(ativo?.["local"]) || s(registro["local"]) || null,
      descricao: v.descricao, observacoes: v.observacoes || null, solicitante: v.solicitante || null, checklist: ck,
      data_prevista: new Date(`${v.data}T09:00:00-03:00`).toISOString(), ...extra,
    };
    if (novo) {
      const numero = await proximoNumeroOs(condominioId);
      const { data, error } = await db.from("manutencao_os").insert({ ...payload, numero, status: "agendada", empresa_id: condominioId, condominio_id: condominioId, prazo_sla: prazoSla(new Date(), v.prioridade).toISOString() }).select("*").single();
      if (error) throw error;
      return data as Row;
    }
    const { data, error } = await db.from("manutencao_os").update(payload).eq("id", registro["id"]).select("*").single();
    if (error) throw error;
    return data as Row;
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.descricao.trim() && !v.ativo_id) return void toast.error("Escolha o bem ou descreva o problema.");
    setSalvando(true);
    try { await gravar(); toast.success("Ordem salva."); invalidar(); onClose(); } catch (err) { toast.error((err as Error).message); } finally { setSalvando(false); }
  };
  const iniciar = async () => { setSalvando(true); try { await gravar({ status: "em_execucao", iniciado_em: new Date().toISOString() }); invalidar(); toast.success("Execução iniciada."); onClose(); } catch (err) { toast.error((err as Error).message); } finally { setSalvando(false); } };

  const concluir = async () => {
    if (r.total && r.respondidos < r.total) return void toast.error(`Responda todos os itens do checklist (${r.respondidos}/${r.total}).`);
    if (!(await confirmar({ title: "Concluir manutenção", description: "Concluir e avisar síndico, subsíndico e gerente predial pelo WhatsApp?" }))) return;
    setSalvando(true);
    try {
      const salvo = await gravar({ status: "concluida", concluido_em: new Date().toISOString() });
      const { data: equipe } = await db.from("cond_equipe").select("nome,cargo,celular,fim").eq("condominio_id", condominioId);
      const dest = destinatariosAviso((equipe ?? []) as Row[], hoje());
      const texto = mensagemResponsaveis({ condominio: nomeCondominio, numero: s(salvo["numero"]), tipo: meta(TIPOS, salvo["tipo"]).label.toLowerCase(), titulo: s(salvo["equipamento"]) || s(salvo["descricao"]), quando: dh(salvo["concluido_em"]), total: r.total, naoConformes: r.naoConformes, link: linkOs(salvo["token"]) });
      let ok = 0; let motivo = "";
      for (const d of dest) { const m = await enviarWhatsappEmpresa(condominioId, d.celular, texto); if (m) motivo = m; else ok++; }
      invalidar(); onClose();
      if (!dest.length) toast.warning("Concluída. Nenhum síndico ou gerente com celular em Equipe & Diretoria para avisar.");
      else if (ok) toast.success(`Concluída. ${ok} responsável(is) avisado(s) pelo WhatsApp.`);
      else toast.warning(`Concluída, mas o aviso não foi enviado: ${motivo}`);
    } catch (err) { toast.error((err as Error).message); } finally { setSalvando(false); }
  };

  const escolherModelo = (id: string) => {
    setV((o) => ({ ...o, modelo_id: id }));
    const m = modelos.find((x) => s(x["id"]) === id);
    setCk(m ? checklistDoModelo(m["itens"]) : []);
  };
  const resp = (i: number, patch: Partial<ItemChecklist>) => setCk((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex flex-wrap items-center gap-2">{novo ? "Nova ordem de serviço" : s(registro["numero"])} {!novo && <Pill m={meta(STATUS, status)} />}</SheetTitle>
          <SheetDescription>{novo ? "Corretiva aberta conforme a necessidade (NBR 5674)." : `Prevista para ${dh(registro["data_prevista"])}`}</SheetDescription>
        </SheetHeader>
        <form onSubmit={salvar} className="flex flex-1 flex-col">
          <fieldset disabled={!pode} className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo id="o-tipo" label="Tipo"><SearchSelect id="o-tipo" value={v.tipo} allowClear={false} onChange={(x) => setV((o) => ({ ...o, tipo: x }))} options={alfa(TIPOS)} disabled={!pode} /></Campo>
            <Campo id="o-pri" label="Prioridade (SLA)"><SearchSelect id="o-pri" value={v.prioridade} allowClear={false} onChange={(x) => setV((o) => ({ ...o, prioridade: x }))} options={alfa(PRIORIDADES.map((p) => ({ value: p.value, label: `${p.label} · ${p.horas}h` })))} disabled={!pode} /></Campo>
            <Campo id="o-bem" label="Bem / equipamento"><SearchSelect id="o-bem" value={v.ativo_id} onChange={(x) => setV((o) => ({ ...o, ativo_id: x }))} placeholder="Selecione" options={alfa(ativos.map((a) => ({ value: s(a["id"]), label: `${s(a["nome"])}${a["local"] ? ` · ${s(a["local"])}` : ""}` })))} disabled={!pode} /></Campo>
            <Campo id="o-data" label="Data prevista"><CampoData id="o-data" value={v.data} onChange={(x) => setV((o) => ({ ...o, data: x }))} inicio={2020} disabled={!pode} /></Campo>
            <Campo id="o-desc" label="Descrição do problema / serviço" className="sm:col-span-2"><Textarea id="o-desc" rows={3} value={v.descricao} onChange={(e) => setV((o) => ({ ...o, descricao: e.target.value }))} /></Campo>
            <Campo id="o-sol" label="Solicitante"><Input id="o-sol" value={v.solicitante} onChange={(e) => setV((o) => ({ ...o, solicitante: e.target.value }))} placeholder="Ex.: Zelador, portaria" /></Campo>
            <Campo id="o-mod" label="Checklist"><SearchSelect id="o-mod" value={v.modelo_id} onChange={escolherModelo} placeholder="Sem checklist" options={alfa(modelos.map((m) => ({ value: s(m["id"]), label: s(m["nome"]) })))} disabled={!pode} /></Campo>
          </fieldset>
          {ck.length > 0 && (
            <div className="space-y-2 px-4 pb-4">
              <p className="text-sm font-medium">Checklist · {r.respondidos}/{r.total}{r.naoConformes ? ` · ${r.naoConformes} não conforme(s)` : ""}</p>
              <ul className="divide-y rounded-lg border">{ck.map((i, idx) => (
                <li key={idx} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <span className="min-w-0 flex-1">{i.texto}</span>
                  {i.tipo === "numero" ? (
                    <Input aria-label={`Valor de ${i.texto}`} className="w-28" inputMode="decimal" value={i.valor ?? ""} disabled={encerrada} onChange={(e) => resp(idx, { valor: e.target.value })} placeholder={i.unidade ?? ""} />
                  ) : (
                    <div role="radiogroup" aria-label={i.texto} className="flex gap-1">
                      {(["C", "NC", "NA"] as const).map((op) => (
                        <Button key={op} type="button" size="sm" role="radio" aria-checked={i.resposta === op} disabled={encerrada}
                          variant={i.resposta === op ? (op === "NC" ? "destructive" : "default") : "outline"} onClick={() => resp(idx, { resposta: op })}>{op}</Button>
                      ))}
                    </div>
                  )}
                </li>
              ))}</ul>
            </div>
          )}
          <div className="px-4 pb-4"><Campo id="o-obs" label="Observações da execução"><Textarea id="o-obs" rows={3} value={v.observacoes} disabled={encerrada} onChange={(e) => setV((o) => ({ ...o, observacoes: e.target.value }))} /></Campo></div>
          {!novo && (
            <div className="flex flex-wrap gap-2 px-4 pb-4">
              <Button type="button" variant="outline" onClick={() => window.open(linkOs(registro["token"]), "_blank", "noopener")}><ClipboardList className="size-4" /> Relatório da OS</Button>
              {perms.canUpdate && status === "agendada" && <Button type="button" variant="outline" disabled={salvando} onClick={() => void iniciar()}><Play className="size-4" /> Iniciar execução</Button>}
              {perms.canUpdate && !encerrada && <Button type="button" disabled={salvando} onClick={() => void concluir()}><CheckCircle2 className="size-4" /> Concluir e avisar</Button>}
            </div>
          )}
          {pode ? <Rodape onCancel={onClose} salvando={salvando} /> : <div className="sticky bottom-0 mt-auto flex justify-end border-t bg-background p-4"><Button type="button" variant="outline" onClick={onClose}>Fechar</Button></div>}
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Preventivas ------------------------------- */

function Planos({ condominioId, perms, planos, ativos, modelos, invalidar }: Ctx) {
  const [edit, setEdit] = useState<Row | null>(null);
  const nomeA = new Map(ativos.map((a) => [s(a["id"]), s(a["nome"])]));
  const lista = [...planos].sort((a, b) => s(a["proxima_data"]).localeCompare(s(b["proxima_data"])));
  const excluir = async (p: Row) => {
    if (!(await confirmar({ title: "Excluir plano", description: `Excluir o plano "${s(p["nome"])}"? Ordens já geradas continuam.`, destructive: true }))) return;
    const { error } = await db.from("manutencao_planos").delete().eq("id", p["id"]);
    if (error) return void toast.error(error.message);
    invalidar();
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cada plano agenda sozinho a próxima ordem preventiva, respeitando a antecedência.</p>
        {perms.canCreate && <Button onClick={() => setEdit({})}><Plus className="size-4" /> Novo plano</Button>}
      </div>
      {!lista.length ? <Vazio texto="Nenhum plano preventivo. Ex.: limpeza de caixa d'água (semestral), recarga de extintores (anual), SPDA (anual)." /> : (
        <ul className="grid gap-2">{lista.map((p) => (
          <li key={s(p["id"])} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <span className="min-w-0 flex-1"><span className="font-medium">{s(p["nome"])}</span><span className="block text-xs text-muted-foreground">{nomeA.get(s(p["ativo_id"])) || "Área comum"} · {meta(FREQUENCIAS, String(p["frequencia_meses"])).label}</span></span>
            <span className="text-sm tabular-nums">Próxima: {dia(p["proxima_data"])}</span>
            {p["ativo"] === false ? <Pill m={{ label: "Pausado", cls: "bg-muted text-muted-foreground" }} /> : <Pill m={SITUACAO_PLANO[situacaoPlano(s(p["proxima_data"]), hoje())]} />}
            {perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEdit(p)}><Pencil className="size-4" /></AcaoIcone>}
            {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={() => void excluir(p)}><Trash2 className="size-4" /></AcaoIcone>}
          </li>
        ))}</ul>
      )}
      {edit && <PlanoSheet registro={edit} condominioId={condominioId} ativos={ativos} modelos={modelos} onClose={() => setEdit(null)} onSaved={invalidar} />}
    </section>
  );
}

function PlanoSheet({ registro, condominioId, ativos, modelos, onClose, onSaved }: { registro: Row; condominioId: string; ativos: Row[]; modelos: Row[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    nome: s(registro["nome"]), ativo_id: s(registro["ativo_id"]), modelo_id: s(registro["modelo_id"]), frequencia_meses: s(registro["frequencia_meses"]) || "1",
    proxima_data: s(registro["proxima_data"]) || hoje(), hora: s(registro["hora"]) || "09:00", antecedencia_dias: s(registro["antecedencia_dias"]) || "7", ativo: registro["ativo"] !== false,
  });
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.nome.trim()) return void toast.error("Informe o nome do plano.");
    setSalvando(true);
    const payload = { ...v, ativo_id: v.ativo_id || null, modelo_id: v.modelo_id || null, frequencia_meses: Number(v.frequencia_meses), antecedencia_dias: Number(v.antecedencia_dias || 0) };
    const r = registro["id"] ? await db.from("manutencao_planos").update(payload).eq("id", registro["id"]) : await db.from("manutencao_planos").insert({ ...payload, empresa_id: condominioId, condominio_id: condominioId });
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Plano salvo."); onSaved(); onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4"><SheetTitle>{registro["id"] ? "Editar plano preventivo" : "Novo plano preventivo"}</SheetTitle><SheetDescription>Periodicidade conforme o manual de uso e a NBR 5674.</SheetDescription></SheetHeader>
        <form onSubmit={salvar} className="flex flex-1 flex-col">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo id="p-nome" label="Nome do plano" className="sm:col-span-2"><Input id="p-nome" value={v.nome} onChange={(e) => setV((o) => ({ ...o, nome: e.target.value }))} placeholder="Ex.: Limpeza das caixas d'água" /></Campo>
            <Campo id="p-bem" label="Bem / equipamento"><SearchSelect id="p-bem" value={v.ativo_id} onChange={(x) => setV((o) => ({ ...o, ativo_id: x }))} placeholder="Área comum" options={alfa(ativos.map((a) => ({ value: s(a["id"]), label: s(a["nome"]) })))} /></Campo>
            <Campo id="p-mod" label="Checklist"><SearchSelect id="p-mod" value={v.modelo_id} onChange={(x) => setV((o) => ({ ...o, modelo_id: x }))} placeholder="Sem checklist" options={alfa(modelos.map((m) => ({ value: s(m["id"]), label: s(m["nome"]) })))} /></Campo>
            <Campo id="p-freq" label="Frequência"><SearchSelect id="p-freq" value={v.frequencia_meses} allowClear={false} onChange={(x) => setV((o) => ({ ...o, frequencia_meses: x }))} options={alfa(FREQUENCIAS)} /></Campo>
            <Campo id="p-prox" label="Próxima data"><CampoData id="p-prox" value={v.proxima_data} onChange={(x) => setV((o) => ({ ...o, proxima_data: x }))} inicio={2020} /></Campo>
            <Campo id="p-hora" label="Horário"><Input id="p-hora" type="time" value={v.hora} onChange={(e) => setV((o) => ({ ...o, hora: e.target.value }))} /></Campo>
            <Campo id="p-ant" label="Agendar com antecedência (dias)"><Input id="p-ant" inputMode="numeric" value={v.antecedencia_dias} onChange={(e) => setV((o) => ({ ...o, antecedencia_dias: e.target.value.replace(/\D/g, "") }))} /></Campo>
            <div className="flex items-center gap-3 sm:col-span-2">
              <input id="p-ativo" type="checkbox" role="switch" className="peer sr-only" checked={v.ativo} onChange={(e) => setV((o) => ({ ...o, ativo: e.target.checked }))} />
              <label htmlFor="p-ativo" className={cn("relative h-6 w-11 cursor-pointer rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-ring", v.ativo ? "bg-primary" : "bg-muted")}><span className={cn("absolute top-0.5 size-5 rounded-full bg-background shadow transition", v.ativo ? "left-[22px]" : "left-0.5")} /></label>
              <span className="text-sm">Plano ativo</span>
            </div>
          </div>
          <Rodape onCancel={onClose} salvando={salvando} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Calendário ------------------------------- */

function Calendario(c: Ctx) {
  const { os, planos } = c;
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [abrir, setAbrir] = useState<Row | null>(null);
  const ano = ref.getFullYear(), mes = ref.getMonth();
  const dias = new Date(ano, mes + 1, 0).getDate();
  const inicio = new Date(ano, mes, 1).getDay();
  const chave = (d: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const porDia = useMemo(() => {
    const m = new Map<string, { os: Row[]; planos: Row[] }>();
    const add = (k: string) => { if (!m.has(k)) m.set(k, { os: [], planos: [] }); return m.get(k)!; };
    for (const r of os) if (r["data_prevista"]) add(new Date(s(r["data_prevista"])).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })).os.push(r);
    for (const p of planos) if (p["ativo"] !== false && p["proxima_data"]) add(s(p["proxima_data"]).slice(0, 10)).planos.push(p);
    return m;
  }, [os, planos]);
  const h = hoje();
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setRef(new Date(ano, mes - 1, 1))}><ChevronLeft className="size-4" /></Button>
        <h3 className="min-w-44 text-center font-semibold capitalize">{ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
        <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setRef(new Date(ano, mes + 1, 1))}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs" role="grid" aria-label="Calendário de manutenções">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="p-1 text-center font-medium text-muted-foreground">{d}</div>)}
        {Array.from({ length: inicio }).map((_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: dias }, (_, i) => i + 1).map((d) => {
          const k = chave(d); const it = porDia.get(k);
          return (
            <div key={k} role="gridcell" className={cn("min-h-24 rounded-md border p-1", k === h && "border-primary")}>
              <div className="mb-1 text-right font-medium">{d}</div>
              <div className="space-y-0.5">
                {it?.os.map((r) => (
                  <button key={s(r["id"])} type="button" onClick={() => setAbrir(r)} className={cn("block w-full truncate rounded px-1 text-left", meta(STATUS, r["status"]).cls)} title={`${s(r["numero"])} · ${s(r["equipamento"])}`}>{s(r["equipamento"]) || s(r["numero"])}</button>
                ))}
                {it?.planos.map((p) => <div key={s(p["id"])} className="truncate rounded border border-dashed px-1 text-muted-foreground" title="Preventiva prevista (ainda sem OS)">{s(p["nome"])}</div>)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Cores pela situação da ordem. Itens tracejados são preventivas previstas que ainda vão gerar a ordem.</p>
      {abrir && <OsSheet {...c} registro={abrir} onClose={() => setAbrir(null)} />}
    </section>
  );
}

/* ------------------------------- Modelos de checklist ------------------------------- */

const MODELOS_CONDOMINIO = [
  { nome: "Caixas d'água — limpeza e inspeção", categoria: "Hidráulica", itens: ["Tampa vedada e sem trincas", "Limpeza e desinfecção realizadas", "Boias e registros funcionando", "Laudo de potabilidade anexado"] },
  { nome: "Bombas de recalque", categoria: "Hidráulica", itens: ["Ruído e vibração normais", "Sem vazamentos no selo", "Revezamento automático funcionando", "Quadro de comando sem aquecimento"] },
  { nome: "Gerador — teste com carga", categoria: "Elétrica", itens: ["Partida automática", "Nível de óleo e água", "Combustível acima de 50%", "Transferência de carga OK"] },
  { nome: "Extintores e hidrantes", categoria: "Incêndio", itens: ["Lacre e manômetro na faixa", "Validade da recarga", "Sinalização e acesso livres", "Mangueiras e esguichos no abrigo"] },
  { nome: "Limpeza de área comum", categoria: "Limpeza", itens: ["Piso varrido e lavado", "Lixeiras esvaziadas", "Vidros e espelhos limpos", "Banheiros abastecidos"] },
];

function Modelos({ condominioId, perms, modelos, invalidar }: Ctx) {
  const [edit, setEdit] = useState<Row | null>(null);
  const carregar = async () => {
    const base = [...MODELOS_CONDOMINIO.map((m) => ({ ...m, itens: m.itens.map((t) => ({ texto: t, tipo: "cnc" })) })), ...MODELOS_PADRAO.filter((m) => m.categoria !== "Geral" || true)];
    const existentes = new Set(modelos.map((m) => s(m["nome"])));
    const novos = base.filter((m) => !existentes.has(m.nome)).map((m) => ({ ...m, empresa_id: condominioId, condominio_id: condominioId, padrao: true }));
    if (!novos.length) return void toast.info("Os modelos padrão já estão carregados.");
    const { error } = await db.from("manutencao_modelos").insert(novos);
    if (error) return void toast.error(error.message);
    toast.success(`${novos.length} modelo(s) carregado(s).`); invalidar();
  };
  const excluir = async (m: Row) => {
    if (!(await confirmar({ title: "Excluir modelo", description: `Excluir "${s(m["nome"])}"?`, destructive: true }))) return;
    const { error } = await db.from("manutencao_modelos").delete().eq("id", m["id"]);
    if (error) return void toast.error(error.message);
    invalidar();
  };
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {perms.canCreate && <Button variant="outline" onClick={() => void carregar()}>Carregar modelos padrão</Button>}
        {perms.canCreate && <Button onClick={() => setEdit({})}><Plus className="size-4" /> Novo modelo</Button>}
      </div>
      {!modelos.length ? <Vazio texto="Nenhum modelo. Carregue os padrões (caixa d'água, bombas, gerador, extintores, limpeza…) ou crie o seu." /> : (
        <ul className="grid gap-2 sm:grid-cols-2">{[...modelos].sort((a, b) => s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR")).map((m) => (
          <li key={s(m["id"])} className="flex items-start gap-2 rounded-lg border bg-card p-3">
            <div className="min-w-0 flex-1"><p className="font-medium">{s(m["nome"])}</p><p className="text-xs text-muted-foreground">{s(m["categoria"]) || "Geral"} · {Array.isArray(m["itens"]) ? (m["itens"] as unknown[]).length : 0} itens</p></div>
            {perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEdit(m)}><Pencil className="size-4" /></AcaoIcone>}
            {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={() => void excluir(m)}><Trash2 className="size-4" /></AcaoIcone>}
          </li>
        ))}</ul>
      )}
      {edit && <ModeloSheet registro={edit} condominioId={condominioId} onClose={() => setEdit(null)} onSaved={invalidar} />}
    </section>
  );
}

function ModeloSheet({ registro, condominioId, onClose, onSaved }: { registro: Row; condominioId: string; onClose: () => void; onSaved: () => void }) {
  const itens0 = Array.isArray(registro["itens"]) ? (registro["itens"] as { texto: string; tipo?: string; unidade?: string }[]) : [];
  const [nome, setNome] = useState(s(registro["nome"]));
  const [categoria, setCategoria] = useState(s(registro["categoria"]));
  const [texto, setTexto] = useState(itens0.map((i) => (i.tipo === "numero" ? `${i.texto} [${i.unidade ?? ""}]` : i.texto)).join("\n"));
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const itens = texto.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*)\[(.*)\]$/); return m ? { texto: m[1]!.trim(), tipo: "numero", unidade: m[2]!.trim() } : { texto: l, tipo: "cnc" }; });
    if (!nome.trim() || !itens.length) return void toast.error("Informe o nome e ao menos um item.");
    setSalvando(true);
    const payload = { nome: nome.trim(), categoria: categoria.trim() || null, itens };
    const r = registro["id"] ? await db.from("manutencao_modelos").update(payload).eq("id", registro["id"]) : await db.from("manutencao_modelos").insert({ ...payload, empresa_id: condominioId, condominio_id: condominioId });
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Modelo salvo."); onSaved(); onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4"><SheetTitle>{registro["id"] ? "Editar modelo" : "Novo modelo de checklist"}</SheetTitle><SheetDescription>Um item por linha. Para medições, termine com a unidade entre colchetes, ex.: "Pressão do manômetro [bar]".</SheetDescription></SheetHeader>
        <form onSubmit={salvar} className="flex flex-1 flex-col">
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Campo id="m-nome" label="Nome"><Input id="m-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <Campo id="m-cat" label="Categoria"><Input id="m-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Hidráulica" /></Campo>
            <Campo id="m-itens" label="Itens" className="sm:col-span-2"><Textarea id="m-itens" rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
          </div>
          <Rodape onCancel={onClose} salvando={salvando} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Relatório ------------------------------- */

function Relatorio({ condominioId, nomeCondominio, os, planos, ativos }: Ctx) {
  const emp = useEmpresaAtiva();
  const { data: cond } = useQuery({
    queryKey: ["cond", "empresa-doc", condominioId],
    queryFn: async () => (await db.from("empresas").select("nome,titulo,logo,cnpj_cpf").eq("id", condominioId).maybeSingle()).data as Row | null,
  });
  const ini0 = new Date(); ini0.setDate(1);
  const [de, setDe] = useState(ini0.toLocaleDateString("sv-SE"));
  const [ate, setAte] = useState(hoje());
  const noPeriodo = os.filter((r) => { const d = s(r["data_prevista"] || r["created_at"]).slice(0, 10); return d >= de && d <= ate; })
    .sort((a, b) => s(a["data_prevista"]).localeCompare(s(b["data_prevista"])));
  const prev = noPeriodo.filter((r) => r["tipo"] === "preventiva");
  const prevOk = prev.filter((r) => r["status"] === "concluida").length;
  const corr = noPeriodo.filter((r) => r["tipo"] === "corretiva");
  const corrOk = corr.filter((r) => r["status"] === "concluida").length;
  const nc = noPeriodo.reduce((t, r) => t + resumoChecklist((r["checklist"] as ItemChecklist[]) ?? []).naoConformes, 0);
  const vencidos = planos.filter((p) => p["ativo"] !== false && situacaoPlano(s(p["proxima_data"]), hoje()) === "vencido").length;
  const logo = s(cond?.["logo"]) || s(emp.logo);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo id="r-de" label="Data inicial"><CampoData id="r-de" value={de} onChange={setDe} inicio={2020} /></Campo>
        <Campo id="r-ate" label="Data final"><CampoData id="r-ate" value={ate} onChange={setAte} inicio={2020} /></Campo>
        <Button onClick={() => imprimirElemento("cond-manut-relatorio")}><Printer className="size-4" /> Imprimir / PDF</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background p-2">
        <div id="cond-manut-relatorio" className="dre-doc">
          <header className="dre-head">
            <div className="dre-emp">
              {logo && <img src={logo} alt="" data-no-zoom />}
              <div><div className="dre-emp-nome">{s(cond?.["titulo"]) || s(cond?.["nome"]) || nomeCondominio}</div><div className="dre-rot">{s(cond?.["cnpj_cpf"]) ? `CNPJ ${s(cond?.["cnpj_cpf"])} • ` : ""}Relatório • Confidencial</div></div>
            </div>
            <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
          </header>
          <div className="dre-titulo"><h1>Relatório de Manutenções (NBR 5674)</h1><p>Período de {dia(de)} a {dia(ate)}</p></div>
          <table className="dre-kpis"><tbody><tr>
            <td><span>Preventivas cumpridas</span><strong>{prev.length ? Math.round((prevOk / prev.length) * 100) : 0}% ({prevOk}/{prev.length})</strong></td>
            <td><span>Corretivas resolvidas</span><strong>{corrOk}/{corr.length}</strong></td>
            <td><span>Itens não conformes</span><strong>{nc}</strong></td>
            <td><span>Planos vencidos hoje</span><strong>{vencidos}</strong></td>
            <td><span>Bens cadastrados</span><strong>{ativos.length}</strong></td>
          </tr></tbody></table>
          <table className="dre-tab">
            <thead><tr><th>OS</th><th>Tipo</th><th>Bem / serviço</th><th>Prevista</th><th>Concluída</th><th>Checklist</th><th>Situação</th></tr></thead>
            <tbody>{noPeriodo.map((r) => { const ck = resumoChecklist((r["checklist"] as ItemChecklist[]) ?? []); return (
              <tr key={s(r["id"])}><td>{s(r["numero"])}</td><td>{meta(TIPOS, r["tipo"]).label}</td><td>{s(r["equipamento"]) || s(r["descricao"])}</td><td>{dia(r["data_prevista"])}</td><td>{dia(r["concluido_em"])}</td><td>{ck.total ? `${ck.respondidos}/${ck.total}${ck.naoConformes ? ` · ${ck.naoConformes} NC` : ""}` : "—"}</td><td>{meta(STATUS, r["status"]).label}</td></tr>
            ); })}
            {!noPeriodo.length && <tr><td colSpan={7}>Nenhuma ordem no período.</td></tr>}</tbody>
          </table>
          <footer className="dre-rodape">Registros gerados pelo sistema com data, checklist e fotos de cada ordem. Documento de uso interno.</footer>
        </div>
      </div>
    </section>
  );
}
