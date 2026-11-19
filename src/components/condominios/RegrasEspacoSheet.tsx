import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Lock, Search, Trees, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { chaveHora, dataMaxima, estruturaTravada, type ModoConcorrencia } from "@/lib/cond-reservas";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { ordemNatural, s, useCondRows } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabase as any;
const n = (v: unknown, d = 0) => (v === null || v === undefined || v === "" ? d : Number(v));
const hhmm = (v: unknown, d: string) => (s(v) || d).slice(0, 5);
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const COTAS = [["pendente", "Em aberto"], ["diaria", "Diária"], ["semanal", "Por semana (Dom–Sáb)"], ["mensal", "Mensal"], ["semestral", "6 meses"], ["anual", "Anual"], ["dias", "Por período de X dias"]] as const;
const msgErro = (e: { message?: string }) => toast.error(e.message || "Não foi possível salvar.");

function Campo({ label, children, ajuda, amarelo }: { label: string; children: React.ReactNode; ajuda?: string; amarelo?: boolean }) {
  return (
    <div className={cn("space-y-1.5 rounded-md", amarelo && "bg-warning/10 p-2")}>
      <Label className="text-sm">{label}</Label>{children}
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}
function Sw({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <span className="font-medium">{label}</span><Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Regras de agendamento de um espaço (síndico/administradora). */
export function RegrasEspacoSheet({ espaco, condominioId, espacos, onClose }: { espaco: Row; condominioId: string; espacos: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: reservas = [] } = useCondRows("cond_reservas", "espaco_id", s(espaco["id"]));
  const travado = useMemo(() => estruturaTravada(s(espaco["id"]),
    reservas.map((r) => ({ espaco_id: s(r["espaco_id"]), unidade_id: null, inicio: new Date(s(r["inicio"])), fim: new Date(s(r["fim"])), status: s(r["status"]) })), new Date()), [reservas, espaco]);
  const [v, setV] = useState<Row>(() => ({ ...espaco }));
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const num = (k: string, d = 0) => ({ type: "number", min: 0, value: v[k] === null || v[k] === undefined ? "" : String(v[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === "" ? null : Number(e.target.value)), placeholder: String(d), className: "h-11" });
  const [sub, setSub] = useState<"horarios" | "unidades" | "espacos" | null>(null);
  const [salvando, setSalvando] = useState(false);

  const gravar = async () => {
    if (hhmm(v["hora_fim"], "22:00") <= hhmm(v["hora_inicio"], "07:00")) { toast.error("Hora fim deve ser depois da hora início."); return; }
    setSalvando(true);
    const campos = ["exige_aprovacao", "ativo", "inativo_inicio", "inativo_fim", "inativo_texto", "valor", "texto_regimento", "texto_valor", "texto_cancelamento", "dias_min", "dias_max", "antecipar_horas", "max_por_unidade", "max_mesmo_dia", "periodo_cota", "periodo_cota_dias", "horas_entre", "horas_cancelamento", "hora_inicio", "hora_fim", "periodo_qtd", "periodo_unidade", "horarios_seguidos", "simultaneas", "intervalo_min", "bloqueio_antes_h", "bloqueio_depois_h", "max_convidados", "avisar_lista_convidados", "bloquear_inadimplentes", "mostrar_unidade", "morador_cancela_aprovada", "minutos_no_show"];
    const valores: Row = Object.fromEntries(campos.map((k) => [k, v[k] === "" ? null : v[k] ?? null]));
    for (const k of ["valor", "dias_min", "antecipar_horas", "horas_entre", "horas_cancelamento", "periodo_qtd", "horarios_seguidos", "simultaneas", "intervalo_min", "bloqueio_antes_h", "bloqueio_depois_h"]) valores[k] = n(valores[k]);
    valores["dias_max"] = n(valores["dias_max"], 90); valores["ativo"] = v["ativo"] !== false;
    const { error } = await db().from("cond_espacos").update(valores).eq("id", s(espaco["id"]));
    setSalvando(false);
    if (error) { msgErro(error.message?.includes("column") ? { message: "Rode o script conectcon-espacos-reservas.sql no SQL Editor." } : error); return; }
    toast.success("Regras salvas."); void qc.invalidateQueries({ queryKey: ["cond", "cond_espacos"] }); onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-full lg:w-[60vw] lg:max-w-[60vw]" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-4"><SheetTitle>Regras de agendamento · {s(espaco["nome"])}</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <section className="grid gap-3 sm:grid-cols-2">
            <Sw label="Ativo" checked={v["ativo"] !== false} onChange={(x) => set("ativo", x)} />
            <Sw label="Exige aprovação da gestão" checked={!!v["exige_aprovacao"]} onChange={(x) => set("exige_aprovacao", x)} />
            <Campo label="Valor a cobrar (R$)"><Input {...num("valor")} step="0.01" /></Campo>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="font-semibold">Inativar por um período</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Início"><Input type="datetime-local" className="h-11" value={s(v["inativo_inicio"]).slice(0, 16)} onChange={(e) => set("inativo_inicio", e.target.value ? new Date(e.target.value).toISOString() : null)} /></Campo>
              <Campo label="Fim"><Input type="datetime-local" className="h-11" value={s(v["inativo_fim"]).slice(0, 16)} onChange={(e) => set("inativo_fim", e.target.value ? new Date(e.target.value).toISOString() : null)} /></Campo>
            </div>
            <Campo label="Texto exibido no bloqueio"><Input className="h-11" value={s(v["inativo_texto"])} onChange={(e) => set("inativo_texto", e.target.value)} placeholder="Ex.: manutenção da piscina" /></Campo>
          </section>

          <section className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => setSub("horarios")}><Clock className="size-4" /> Gerenciar horários</Button>
            <Button variant="outline" className="h-11" onClick={() => setSub("unidades")}><Users className="size-4" /> Gerenciar unidades</Button>
            <Button variant="outline" className="h-11" onClick={() => setSub("espacos")}><Trees className="size-4" /> Gerenciar outros espaços</Button>
          </section>

          <section className="grid gap-3">
            {([["texto_regimento", "Texto do regimento interno"], ["texto_valor", "Texto de valor da reserva"], ["texto_cancelamento", "Texto de cancelamento"]] as const).map(([k, l]) => (
              <Campo key={k} label={l} ajuda={`${s(v[k]).length}/500`}><Textarea rows={3} maxLength={500} value={s(v[k])} onChange={(e) => set(k, e.target.value)} /></Campo>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Campo label="Dias mínimos de antecedência"><Input {...num("dias_min")} /></Campo>
            <Campo label="Dias máximos de antecedência" ajuda={`Data máxima: ${dataMaxima({ dias_max: n(v["dias_max"], 90) }, new Date()).toLocaleDateString("pt-BR")}`}><Input {...num("dias_max", 90)} /></Campo>
            <Campo label="Antecipar horário de início (horas)"><Input {...num("antecipar_horas")} /></Campo>
            <Campo label="Máximo de reservas por unidade" ajuda="Em branco = sem limite"><Input {...num("max_por_unidade")} placeholder="Sem limite" /></Campo>
            <Campo label="Contagem do limite por unidade">
              <select className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={s(v["periodo_cota"]) || "pendente"} onChange={(e) => set("periodo_cota", e.target.value)}>
                {COTAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Campo>
            {v["periodo_cota"] === "dias" && <Campo label="Período (dias)"><Input {...num("periodo_cota_dias", 7)} /></Campo>}
            <Campo label="Quantidade de reservas no mesmo dia" ajuda="Em branco = sem limite"><Input {...num("max_mesmo_dia")} placeholder="Sem limite" /></Campo>
            <Campo label="Horas entre agendamentos"><Input {...num("horas_entre")} /></Campo>
            <Campo label="Horas mínimas para cancelamento"><Input {...num("horas_cancelamento")} /></Campo>
          </section>

          <section className={cn("space-y-3 rounded-lg border p-3", "border-warning/50 bg-warning/5")}>
            <h3 className="flex items-center gap-2 font-semibold">{travado && <Lock className="size-4" />} Funcionamento</h3>
            {travado && <p role="alert" className="rounded-md bg-warning/15 p-2 text-sm">Existem agendamentos ativos neste espaço. Para alterar estes campos, cancele os agendamentos e refaça-os depois.</p>}
            <fieldset disabled={travado} className="grid gap-3 sm:grid-cols-2 disabled:opacity-70">
              <Campo label="Hora início"><Input type="time" className="h-11" value={hhmm(v["hora_inicio"], "07:00")} onChange={(e) => set("hora_inicio", e.target.value)} /></Campo>
              <Campo label="Hora fim"><Input type="time" className="h-11" value={hhmm(v["hora_fim"], "22:00")} onChange={(e) => set("hora_fim", e.target.value)} /></Campo>
              <Campo label="Período de reserva">
                <div className="flex gap-2">
                  <Input {...num("periodo_qtd", 1)} className="h-11 w-24" disabled={v["periodo_unidade"] === "livre"} />
                  <select className="h-11 flex-1 rounded-md border bg-background px-3 text-sm" value={s(v["periodo_unidade"]) || "horas"} onChange={(e) => set("periodo_unidade", e.target.value)}>
                    <option value="horas">Horas</option><option value="minutos">Minutos</option><option value="livre">Horário escolhido pelo usuário</option>
                  </select>
                </div>
              </Campo>
              <Campo label="Horários seguidos que o usuário pode escolher"><Input {...num("horarios_seguidos", 1)} /></Campo>
              <Campo label="Reservas simultâneas"><Input {...num("simultaneas", 1)} /></Campo>
              <Campo label="Intervalo entre períodos (minutos)"><Input {...num("intervalo_min")} /></Campo>
              <Campo label="Bloqueio horas antes" ajuda="Zero = não bloquear"><Input {...num("bloqueio_antes_h")} /></Campo>
              <Campo label="Bloqueio horas depois" ajuda="Zero = não bloquear"><Input {...num("bloqueio_depois_h")} /></Campo>
            </fieldset>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <Campo label="Máximo de convidados" ajuda="Em branco = ilimitado"><Input {...num("max_convidados")} placeholder="Ilimitado" /></Campo>
            <Campo label="Cancelar se não usar (minutos, SmartAccess)"><Input {...num("minutos_no_show")} placeholder="Desligado" /></Campo>
            <Sw label="Avisar condomínio do preenchimento da lista de convidados" checked={!!v["avisar_lista_convidados"]} onChange={(x) => set("avisar_lista_convidados", x)} />
            <Sw label="Bloquear inadimplentes automaticamente" checked={!!v["bloquear_inadimplentes"]} onChange={(x) => set("bloquear_inadimplentes", x)} />
            <Sw label="Mostrar unidade aos moradores" checked={!!v["mostrar_unidade"]} onChange={(x) => set("mostrar_unidade", x)} />
            <Sw label="Morador pode cancelar após aprovada" checked={v["morador_cancela_aprovada"] !== false} onChange={(x) => set("morador_cancela_aprovada", x)} />
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" className="h-11" onClick={onClose}>Cancelar</Button>
          <Button className="h-11" onClick={gravar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </div>
        {sub === "horarios" && <HorariosDialog inicio={hhmm(v["hora_inicio"], "07:00")} fim={hhmm(v["hora_fim"], "22:00")} valor={Array.isArray(v["horarios_bloqueados"]) ? (v["horarios_bloqueados"] as string[]) : []}
          onClose={() => setSub(null)} onSalvar={async (lista) => {
            const { error } = await db().from("cond_espacos").update({ horarios_bloqueados: lista }).eq("id", s(espaco["id"]));
            if (error) { msgErro(error); return; }
            set("horarios_bloqueados", lista); toast.success("Horários bloqueados salvos."); setSub(null);
            void qc.invalidateQueries({ queryKey: ["cond", "cond_espacos"] });
          }} />}
        {sub === "unidades" && <UnidadesDialog condominioId={condominioId} espacoId={s(espaco["id"])} onClose={() => setSub(null)} />}
        {sub === "espacos" && <OutrosEspacosDialog condominioId={condominioId} espaco={espaco} espacos={espacos} onClose={() => setSub(null)} />}
      </SheetContent>
    </Sheet>
  );
}

function HorariosDialog({ inicio, fim, valor, onClose, onSalvar }: { inicio: string; fim: string; valor: string[]; onClose: () => void; onSalvar: (l: string[]) => void }) {
  const [sel, setSel] = useState(new Set(valor));
  const horas = useMemo(() => { const a = Number(inicio.slice(0, 2)); const b = Math.max(a, Math.ceil(Number(fim.slice(0, 2)) + Number(fim.slice(3)) / 60) - 1); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }, [inicio, fim]);
  const alt = (k: string) => setSel((p) => { const x = new Set(p); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const todosDia = (d: number) => horas.every((h) => sel.has(chaveHora(d, h)));
  const altDia = (d: number) => setSel((p) => { const x = new Set(p); const on = !todosDia(d); horas.forEach((h) => on ? x.add(chaveHora(d, h)) : x.delete(chaveHora(d, h))); return x; });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Bloqueio de dias e horários</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Marque os dias e horários que ficam bloqueados toda semana.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm">
            <thead><tr><th className="p-1" />{DIAS.map((d) => <th key={d} className="p-1 font-medium">{d}</th>)}</tr></thead>
            <tbody>
              <tr><td className="p-1 text-left text-xs text-muted-foreground">todos</td>{DIAS.map((d, i) => <td key={d} className="p-1"><Checkbox aria-label={`Bloquear ${d} inteiro`} checked={todosDia(i)} onCheckedChange={() => altDia(i)} className="size-6" /></td>)}</tr>
              {horas.map((h) => (
                <tr key={h} className="border-t">
                  <td className="p-1 text-left font-medium">{String(h).padStart(2, "0")}h</td>
                  {DIAS.map((d, i) => <td key={d} className="p-1"><Checkbox aria-label={`${d} ${h}h`} checked={sel.has(chaveHora(i, h))} onCheckedChange={() => alt(chaveHora(i, h))} className="size-6" /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <DialogFooter><Button variant="outline" className="h-11" onClick={onClose}>Cancelar</Button><Button className="h-11" onClick={() => onSalvar([...sel].sort())}>Concluir</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BloqU = { bloqueado: boolean; data_inicio: string; data_fim: string; id?: string };
function UnidadesDialog({ condominioId, espacoId, onClose }: { condominioId: string; espacoId: string; onClose: () => void }) {
  const { data: unidades = [] } = useCondRows("cond_unidades", "condominio_id", condominioId);
  const { data: blocos = [] } = useCondRows("cond_blocos", "condominio_id", condominioId);
  const { data: atuais = [], isLoading } = useCondRows("cond_espacos_bloqueios_unidades", "espaco_id", espacoId);
  const [busca, setBusca] = useState("");
  const [ed, setEd] = useState<Record<string, BloqU>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const lista = useMemo(() => {
    const bn = new Map(blocos.map((b) => [s(b["id"]), s(b["nome"])]));
    const t = busca.trim().toLowerCase();
    return unidades.map((u) => ({ id: s(u["id"]), label: `${bn.get(s(u["cond_bloco_id"])) ? bn.get(s(u["cond_bloco_id"])) + " · " : ""}Unidade ${s(u["numero"])}` }))
      .filter((u) => !t || u.label.toLowerCase().includes(t)).sort((a, b) => ordemNatural(a.label, b.label));
  }, [unidades, blocos, busca]);
  const estado = (id: string): BloqU => {
    if (ed[id]) return ed[id]!;
    const a = atuais.find((x) => s(x["unidade_id"]) === id);
    return a ? { bloqueado: true, data_inicio: s(a["data_inicio"]), data_fim: s(a["data_fim"]), id: s(a["id"]) } : { bloqueado: false, data_inicio: "", data_fim: "" };
  };
  const mudar = (id: string, p: Partial<BloqU>) => setEd((o) => ({ ...o, [id]: { ...estado(id), ...p } }));
  const salvar = async () => {
    setSalvando(true);
    for (const [uid, b] of Object.entries(ed)) {
      const r = b.bloqueado
        ? await db().from("cond_espacos_bloqueios_unidades").upsert({ condominio_id: condominioId, espaco_id: espacoId, unidade_id: uid, data_inicio: b.data_inicio || null, data_fim: b.data_fim || null }, { onConflict: "espaco_id,unidade_id" })
        : await db().from("cond_espacos_bloqueios_unidades").delete().eq("espaco_id", espacoId).eq("unidade_id", uid);
      if (r.error) { setSalvando(false); msgErro(r.error); return; }
    }
    setSalvando(false); toast.success("Unidades atualizadas.");
    void qc.invalidateQueries({ queryKey: ["cond", "cond_espacos_bloqueios_unidades"] }); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Gerenciar unidades</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Unidade bloqueada não agenda neste espaço. Sem datas, o bloqueio vale até ser desmarcado.</p>
        <div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 pl-8" placeholder="Buscar unidade..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar unidade" /></div>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <ul className="divide-y rounded-md border">
            {lista.map((u) => { const b = estado(u.id); return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-2">
                <label className="flex min-h-11 flex-1 items-center gap-3 text-sm"><Checkbox className="size-6" checked={b.bloqueado} onCheckedChange={(c) => mudar(u.id, { bloqueado: !!c })} />{u.label}</label>
                <Input type="date" aria-label={`Início do bloqueio ${u.label}`} className="h-11 w-40" disabled={!b.bloqueado} value={b.data_inicio} onChange={(e) => mudar(u.id, { data_inicio: e.target.value })} />
                <Input type="date" aria-label={`Fim do bloqueio ${u.label}`} className="h-11 w-40" disabled={!b.bloqueado} value={b.data_fim} onChange={(e) => mudar(u.id, { data_fim: e.target.value })} />
              </li>); })}
            {!lista.length && <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma unidade.</li>}
          </ul>
        )}
        <DialogFooter><Button variant="outline" className="h-11" onClick={onClose}>Cancelar</Button><Button className="h-11" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Concluir"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutrosEspacosDialog({ condominioId, espaco, espacos, onClose }: { condominioId: string; espaco: Row; espacos: Row[]; onClose: () => void }) {
  const id = s(espaco["id"]);
  const { data: atuais = [] } = useCondRows("cond_espacos_concorrencia", "espaco_id", id);
  const [ed, setEd] = useState<Record<string, ModoConcorrencia | null>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const outros = espacos.filter((e) => s(e["id"]) !== id && e["tipo"] !== "operacional").sort((a, b) => ordemNatural(s(a["nome"]), s(b["nome"])));
  const modo = (oid: string) => (oid in ed ? ed[oid] : (s(atuais.find((a) => s(a["outro_espaco_id"]) === oid)?.["modo"]) as ModoConcorrencia) || null);
  const difere = (o: Row) => hhmm(o["hora_inicio"], "07:00") !== hhmm(espaco["hora_inicio"], "07:00") || hhmm(o["hora_fim"], "22:00") !== hhmm(espaco["hora_fim"], "22:00");
  const salvar = async () => {
    setSalvando(true);
    for (const [oid, m] of Object.entries(ed)) {
      const r = m
        ? await db().from("cond_espacos_concorrencia").upsert({ condominio_id: condominioId, espaco_id: id, outro_espaco_id: oid, modo: m }, { onConflict: "espaco_id,outro_espaco_id" })
        : await db().from("cond_espacos_concorrencia").delete().eq("espaco_id", id).eq("outro_espaco_id", oid);
      if (r.error) { setSalvando(false); msgErro(r.error); return; }
    }
    setSalvando(false); toast.success("Regras entre espaços salvas.");
    void qc.invalidateQueries({ queryKey: ["cond", "cond_espacos_concorrencia"] }); onClose();
  };
  const OPC: [ModoConcorrencia, string][] = [["habilitar", "Habilitar"], ["mesma_unidade", "Bloquear mesma unidade"], ["todas_unidades", "Bloquear todas as unidades"]];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Gerenciar outros espaços</DialogTitle></DialogHeader>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li><b>Habilitar:</b> o morador pode reservar os dois espaços no mesmo dia (precisam ter as mesmas regras de funcionamento).</li>
          <li><b>Bloquear mesma unidade:</b> a mesma unidade não reserva os dois no mesmo dia.</li>
          <li><b>Bloquear todas as unidades:</b> se um estiver reservado no dia, o outro fica indisponível para todos.</li>
        </ul>
        <ul className="divide-y rounded-md border">
          {outros.map((o) => { const oid = s(o["id"]); const m = modo(oid); return (
            <li key={oid} className="space-y-2 p-3">
              <p className="font-medium">{s(o["nome"])}</p>
              <div className="flex flex-wrap gap-2">
                {OPC.map(([k, l]) => (
                  <label key={k} className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm">
                    <Checkbox className="size-5" checked={m === k} onCheckedChange={(c) => {
                      if (c && k === "habilitar" && difere(o)) { toast.error("Para habilitar, os dois espaços precisam ter o mesmo horário de funcionamento."); return; }
                      setEd((p) => ({ ...p, [oid]: c ? k : null }));
                    }} />{l}
                  </label>
                ))}
              </div>
            </li>); })}
          {!outros.length && <li className="p-4 text-center text-sm text-muted-foreground">Nenhum outro espaço social cadastrado.</li>}
        </ul>
        <DialogFooter><Button variant="outline" className="h-11" onClick={onClose}>Cancelar</Button><Button className="h-11" onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Concluir"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bloqueio de uma data (feriado/comemorativa) em lote para vários espaços. */
export function BloqueioDatasDialog({ condominioId, espacos, onClose }: { condominioId: string; espacos: Row[]; onClose: () => void }) {
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const { data: todas = [] } = useCondRows("cond_espacos_bloqueios_datas", "condominio_id", condominioId);
  const [ed, setEd] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const qc = useQueryClient();
  const lista = espacos.filter((e) => e["tipo"] !== "operacional").sort((a, b) => ordemNatural(s(a["nome"]), s(b["nome"])));
  const marcado = (id: string) => (id in ed ? ed[id]! : todas.some((t) => s(t["espaco_id"]) === id && s(t["data"]) === data));
  const salvar = async () => {
    if (!data) { toast.error("Escolha a data."); return; }
    setSalvando(true);
    for (const [id, on] of Object.entries(ed)) {
      const r = on
        ? await db().from("cond_espacos_bloqueios_datas").upsert({ condominio_id: condominioId, espaco_id: id, data, motivo: motivo || null }, { onConflict: "espaco_id,data" })
        : await db().from("cond_espacos_bloqueios_datas").delete().eq("espaco_id", id).eq("data", data);
      if (r.error) { setSalvando(false); msgErro(r.error); return; }
    }
    setSalvando(false); setEd({}); toast.success("Bloqueio de data salvo.");
    void qc.invalidateQueries({ queryKey: ["cond", "cond_espacos_bloqueios_datas"] });
  };
  const proximas = [...new Set(todas.map((t) => s(t["data"])))].filter((d) => d >= new Date().toISOString().slice(0, 10)).sort();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Bloquear datas específicas (feriados/comemorativas)</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Data"><Input type="date" className="h-11" value={data} onChange={(e) => { setData(e.target.value); setEd({}); }} /></Campo>
          <Campo label="Motivo"><Input className="h-11" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Natal" /></Campo>
        </div>
        {proximas.length > 0 && <div className="flex flex-wrap gap-1.5">{proximas.map((d) => (
          <button key={d} type="button" onClick={() => { setData(d); setEd({}); }} className={cn("flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs", d === data && "border-primary bg-primary/10")}>
            <CalendarDays className="size-3" />{new Date(d + "T12:00").toLocaleDateString("pt-BR")}
          </button>))}</div>}
        {data && (
          <>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><Checkbox className="size-6" checked={lista.every((e) => marcado(s(e["id"])))} onCheckedChange={(c) => setEd(Object.fromEntries(lista.map((e) => [s(e["id"]), !!c])))} />Todos os espaços</label>
            <ul className="divide-y rounded-md border">
              {lista.map((e) => <li key={s(e["id"])}><label className="flex min-h-11 items-center gap-3 px-3 text-sm"><Checkbox className="size-6" checked={marcado(s(e["id"]))} onCheckedChange={(c) => setEd((p) => ({ ...p, [s(e["id"])]: !!c }))} />{s(e["nome"])}</label></li>)}
            </ul>
          </>
        )}
        <DialogFooter><Button variant="outline" className="h-11" onClick={onClose}>Fechar</Button><Button className="h-11" onClick={salvar} disabled={salvando || !data}>{salvando ? "Salvando..." : "Salvar bloqueio"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
