import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit, CalendarClock, ClipboardCheck, FileText, Loader2, MapPin, MessageSquare, Pencil, Phone, Save, Send, StickyNote, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { CampoData } from "@/components/condominios/CampoData";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { analisarOferta } from "@/lib/consultor-comercial.functions";
import { TIPOS_ACAO } from "@/lib/crm";
import { useAudit } from "@/lib/audit";
import type { Row } from "@/lib/row";

const TIPOS = [
  { value: "email", label: "E-mail", icon: Send },
  { value: "ligacao", label: "Ligação", icon: Phone },
  { value: "nota", label: "Nota", icon: StickyNote },
  { value: "reuniao", label: "Reunião", icon: Users },
  { value: "visita", label: "Visita", icon: MapPin },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
];
const ROTULO_ORIGEM: Record<string, string> = {
  oferta: "Oferta", oferta_historico: "Histórico da oferta", laudo: "Visita técnica",
};
const iconeDe = (r: Row) => {
  if (r["origem"] === "oferta") return FileText;
  if (r["origem"] === "laudo") return ClipboardCheck;
  if (r["tipo"] === "analise_ia") return BrainCircuit;
  return TIPOS.find((t) => t.value === r["tipo"])?.icon ?? StickyNote;
};
const rotuloTipo = (t: unknown) => TIPOS.find((x) => x.value === t)?.label ?? (t === "analise_ia" ? "Análise IA" : String(t ?? ""));
const dataHora = (v: unknown) => {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

/** CRM do Cliente: linha do tempo 360° (interações, ofertas, histórico antigo, visitas técnicas) + Consultor Comercial IA. */
export function CrmClientePainel({ clienteId, cliente, readOnly }: { clienteId: string; cliente: Row; readOnly?: boolean }) {
  const qc = useQueryClient();
  const { empresaId, usuarioId } = useAudit();
  const gerar = useServerFn(analisarOferta);
  const key = ["crm_timeline", clienteId, empresaId];
  const [tipo, setTipo] = useState("nota");
  const [texto, setTexto] = useState("");
  const [acaoTipo, setAcaoTipo] = useState("");
  const [acaoData, setAcaoData] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [analise, setAnalise] = useState("");
  const [analisando, setAnalisando] = useState(false);

  const { data = [], error, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_crm_timeline" as never, { p_cliente_id: clienteId, p_empresa_id: empresaId ?? null } as never);
      if (error) throw error;
      return ((data ?? []) as Row[]).sort((a, b) => String(b["ocorrido_em"]).localeCompare(String(a["ocorrido_em"])));
    },
  });

  const proxima = useMemo(() => data.find((r) => r["origem"] === "crm" && r["proxima_acao_em"] && new Date(String(r["proxima_acao_em"])) >= new Date(new Date().toDateString())), [data]);
  const recarregar = () => void qc.invalidateQueries({ queryKey: ["crm_timeline", clienteId] });

  const inserir = async (t: string, txt: string, extra: Row = {}) => {
    const { error } = await supabase.from("crm_interacoes" as never).insert({
      empresa_id: empresaId ?? null, cliente_id: clienteId, usuario_id: usuarioId ?? null, tipo: t, texto: txt, ...extra,
    } as never);
    if (error) throw error;
  };

  const add = useMutation({
    mutationFn: () => inserir(tipo, texto.trim(), {
      proxima_acao_tipo: acaoTipo || null,
      proxima_acao_em: acaoTipo && acaoData ? `${acaoData}T09:00:00` : null,
    }),
    onSuccess: () => { setTexto(""); setAcaoTipo(""); setAcaoData(""); recarregar(); toast.success("Interação registrada."); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });
  const edit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_interacoes" as never).update({ texto: editTexto.trim(), updated_at: new Date().toISOString() } as never).eq("id", editId as string);
      if (error) throw error;
    },
    onSuccess: () => { setEditId(null); recarregar(); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível atualizar."),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_interacoes" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: recarregar,
  });

  const analisar = async () => {
    setAnalisando(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const token = ses.session?.access_token;
      if (!token) return void toast.error("Sessão expirada. Entre novamente.");
      const ctx = {
        cliente: {
          nome: cliente["nome_fantasia"] ?? cliente["razao_social"] ?? cliente["nome"],
          razao_social: cliente["razao_social"], cidade: cliente["cidade"], uf: cliente["uf"],
          condominio: cliente["is_condominio"] ?? undefined,
        },
        linha_do_tempo: data.slice(0, 150).map((r) => ({
          quando: r["ocorrido_em"], origem: r["origem"], tipo: r["tipo"], titulo: r["titulo"], texto: r["texto"],
          proxima_acao: r["proxima_acao_tipo"] ? `${r["proxima_acao_tipo"]} em ${r["proxima_acao_em"]}` : undefined,
        })),
      };
      const r = await gerar({ data: { token, modo: "cliente", contexto: JSON.stringify(ctx).slice(0, 59000) } });
      if (r.erro) return void toast.error(r.erro);
      setAnalise(r.texto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a análise.");
    } finally {
      setAnalisando(false);
    }
  };
  const salvarAnalise = async () => {
    try { await inserir("analise_ia", `Análise do Consultor Comercial (IA)\n\n${analise}`); recarregar(); toast.success("Análise salva na linha do tempo."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };

  if (error) {
    return <p className="text-sm text-muted-foreground">CRM indisponível: rode o script conectcon-crm-cliente.sql no SQL Editor.</p>;
  }

  return (
    <div className="space-y-5">
      {proxima && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <CalendarClock className="h-4 w-4 text-primary" />
          <span>Próxima ação: <b>{TIPOS_ACAO.find((t) => t.value === proxima["proxima_acao_tipo"])?.label ?? String(proxima["proxima_acao_tipo"])}</b> em {new Date(String(proxima["proxima_acao_em"])).toLocaleDateString("pt-BR")}</span>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Consultor Comercial</p>
            <p className="text-xs text-muted-foreground">A IA lê todo o histórico do cliente e sugere a melhor abordagem.</p>
          </div>
          <Button type="button" size="sm" onClick={() => void analisar()} disabled={analisando || data.length === 0}>
            {analisando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-1 h-4 w-4" />}
            {analisando ? "Analisando…" : analise ? "Analisar de novo" : "Analisar cliente"}
          </Button>
        </div>
        {analise && (
          <div className="space-y-1 rounded-md border bg-background p-3 text-sm">
            {analise.split("\n").map((l, i) =>
              l.startsWith("## ") ? <p key={i} className="pt-2 font-semibold text-foreground">{l.slice(3)}</p>
                : <p key={i} className="whitespace-pre-wrap text-muted-foreground">{l.replace(/\*\*(.+?)\*\*/g, "$1")}</p>)}
            {!readOnly && (
              <div className="flex justify-end pt-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void salvarAnalise()}><Save className="mr-1 h-4 w-4" /> Salvar na linha do tempo</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Registrar interação</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="crm-tipo">Tipo</Label>
              <SearchSelect id="crm-tipo" value={tipo} onChange={(v) => setTipo(v || "nota")} allowClear={false} options={TIPOS.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-acao">Próxima ação</Label>
              <SearchSelect id="crm-acao" value={acaoTipo} onChange={setAcaoTipo} placeholder="Nenhuma" options={TIPOS_ACAO.map((t) => ({ value: t.value, label: t.label }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-acao-data">Data da ação</Label>
              <CampoData id="crm-acao-data" value={acaoData} onChange={setAcaoData} disabled={!acaoTipo} inicio={new Date().getFullYear()} />
            </div>
          </div>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="O que aconteceu? Ex.: visita ao síndico, interesse em controle de acesso…" />
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!texto.trim() || add.isPending || (!!acaoTipo && !acaoData)} onClick={() => add.mutate()}>
              {add.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Linha do tempo</p>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum registro ainda para este cliente.</p>}
        <ol className="space-y-2">
          {data.map((r) => {
            const Icone = iconeDe(r);
            const id = String(r["id"]);
            const editando = editId === id;
            return (
              <li key={id} className="flex gap-3 rounded-md border p-3">
                <Icone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{r["origem"] === "crm" ? rotuloTipo(r["tipo"]) : ROTULO_ORIGEM[String(r["origem"])] ?? String(r["origem"])}</Badge>
                    <span>{dataHora(r["ocorrido_em"])}</span>
                    {r["titulo"] ? <span className="font-medium text-foreground">{String(r["titulo"])}</span> : null}
                  </div>
                  {editando ? (
                    <div className="space-y-2">
                      <Textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)} rows={3} />
                      <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
                        <Button type="button" size="sm" disabled={!editTexto.trim() || edit.isPending} onClick={() => edit.mutate()}>Salvar</Button>
                      </div>
                    </div>
                  ) : r["texto"] ? <p className="whitespace-pre-wrap text-sm">{String(r["texto"])}</p> : null}
                  {r["proxima_acao_tipo"] ? (
                    <p className="text-xs text-muted-foreground">Próxima ação: {TIPOS_ACAO.find((t) => t.value === r["proxima_acao_tipo"])?.label ?? String(r["proxima_acao_tipo"])}{r["proxima_acao_em"] ? ` em ${new Date(String(r["proxima_acao_em"])).toLocaleDateString("pt-BR")}` : ""}</p>
                  ) : null}
                </div>
                {r["editavel"] === true && !readOnly && !editando && (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Editar" onClick={() => { setEditId(id); setEditTexto(String(r["texto"] ?? "")); }}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Excluir" onClick={async () => { if (await confirmar({ title: "Excluir registro?", description: "Esta interação será removida da linha do tempo." })) del.mutate(id); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
