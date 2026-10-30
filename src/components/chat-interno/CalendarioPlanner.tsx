import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckSquare, ChevronLeft, ChevronRight, Copy, LogIn, MapPin, Pencil, Ban, Video, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { linkReuniao, presencial, textoConvite, type Reuniao } from "@/components/chat-interno/ReunioesPainel";
import { diaDoItem, inicioSemana, ordenar, somarDias, type PlannerItem } from "@/lib/planner";
import { intervaloDaVista, type Vista } from "@/lib/planner-calendario";

const HORA_PX = 48;
const diaLocal = (d: Date) => d.toLocaleDateString("sv-SE");
const hojeISO = () => diaLocal(new Date());
const nomeDia = (iso: string, f: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", f);
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const MESES = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1).toLocaleDateString("pt-BR", { month: "long" }));

export type NovoNoCalendario = { tipo: "online" | "presencial" | "tarefa"; inicio: Date; titulo: string };

type Props = {
  me: string;
  proprio: boolean;
  reunioes: Reuniao[];
  itens: PlannerItem[];
  onCriar: (n: NovoNoCalendario) => void;
  onAbrirTarefa: (id: string) => void;
  onConcluir: (i: PlannerItem, feito: boolean) => void;
  onEditarReuniao: (r: Reuniao) => void;
  onCancelarReuniao: (r: Reuniao) => void;
};

export function CalendarioPlanner({ me, proprio, reunioes, itens, onCriar, onAbrirTarefa, onConcluir, onEditarReuniao, onCancelarReuniao }: Props) {
  const [vista, setVista] = useState<Vista>("semana");
  const [ref, setRef] = useState(hojeISO());
  const [deP, setDeP] = useState(inicioSemana(hojeISO()));
  const [ateP, setAteP] = useState(somarDias(inicioSemana(hojeISO()), 13));
  const [rapido, setRapido] = useState<Date | null>(null);
  const [tituloRapido, setTituloRapido] = useState("");
  const grade = useRef<HTMLDivElement>(null);

  const { de, ate, passo } = intervaloDaVista(vista, ref, deP, ateP);
  const dias = useMemo(() => { const r: string[] = []; for (let d = de; d <= ate; d = somarDias(d, 1)) r.push(d); return r; }, [de, ate]);
  const horaria = (vista === "dia" || vista === "semana" || vista === "4dias" || (vista === "personalizado" && dias.length <= 14));

  useEffect(() => { if (horaria && grade.current) grade.current.scrollTop = 7 * HORA_PX; }, [horaria, vista]);

  const reunioesDoDia = (d: string) => reunioes.filter((r) => diaLocal(new Date(r.inicio)) === d).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const tarefasDoDia = (d: string) => ordenar(itens.filter((i) => diaDoItem(i) === d));

  const navegar = (n: number) => {
    if (vista === "personalizado") { const len = dias.length; setDeP(somarDias(deP, n * len)); setAteP(somarDias(ateP, n * len)); return; }
    if (vista === "mes") { const d = new Date(`${ref}T12:00:00`); d.setMonth(d.getMonth() + n); setRef(diaLocal(d)); return; }
    if (vista === "ano") { const d = new Date(`${ref}T12:00:00`); d.setFullYear(d.getFullYear() + n); setRef(diaLocal(d)); return; }
    setRef(somarDias(ref, n * passo));
  };
  const titulo = vista === "ano" ? ref.slice(0, 4)
    : vista === "mes" ? nomeDia(ref, { month: "long", year: "numeric" })
    : de === ate ? nomeDia(de, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : `${nomeDia(de, { day: "2-digit", month: "short" })} – ${nomeDia(ate, { day: "2-digit", month: "short", year: "numeric" })}`;

  const abrirRapido = (dia: string, hora = 9, min = 0) => {
    const d = new Date(`${dia}T00:00:00`); d.setHours(hora, min, 0, 0);
    setTituloRapido(""); setRapido(d);
  };
  const irPara = (dia: string, v: Vista = "dia") => { setRef(dia); setVista(v); };

  const CardReuniao = ({ r, compacto }: { r: Reuniao; compacto?: boolean }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()}
          className={cn("flex h-full w-full min-w-0 items-start gap-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight",
            presencial(r) ? "border-accent bg-accent text-accent-foreground" : "border-primary/50 bg-primary/15 text-foreground hover:bg-primary/25")}>
          {presencial(r) ? <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> : <Video className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}
          <span className="min-w-0 flex-1">
            <b className="block truncate">{r.titulo}</b>
            {!compacto && <span className="block truncate opacity-80">{hhmm(new Date(r.inicio))} – {hhmm(new Date(new Date(r.inicio).getTime() + r.duracao_min * 60000))}{presencial(r) && r.local ? ` · ${r.local}` : ""}</span>}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[80] w-64">
        <div className="px-2 py-1.5 text-xs">
          <p className="font-semibold">{r.titulo}</p>
          <p className="text-muted-foreground">{new Date(r.inicio).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {r.duracao_min} min</p>
          {presencial(r) && <p className="mt-1 flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3" />{r.local || "Local a definir"}</p>}
        </div>
        {presencial(r) && r.local && <DropdownMenuItem onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.local ?? "")}`, "_blank")}><MapPin className="mr-2 h-4 w-4" /> Abrir no mapa</DropdownMenuItem>}
        {!presencial(r) && <DropdownMenuItem onClick={() => window.open(`${linkReuniao(r)}${r.video ? "?" : "&"}org=${r.id}`, "_blank")}><LogIn className="mr-2 h-4 w-4" /> Entrar na sala</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(textoConvite(r)).then(() => toast.success("Convite copiado."))}><Copy className="mr-2 h-4 w-4" /> Copiar convite</DropdownMenuItem>
        {r.criado_por === me && <DropdownMenuItem onClick={() => onEditarReuniao(r)}><Pencil className="mr-2 h-4 w-4" /> Editar / convidar</DropdownMenuItem>}
        {r.criado_por === me && <DropdownMenuItem className="text-destructive" onClick={() => onCancelarReuniao(r)}><Ban className="mr-2 h-4 w-4" /> Cancelar reunião</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const ChipTarefa = ({ i }: { i: PlannerItem }) => (
    <div className={cn("flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]", i.status === "concluida" && "opacity-60")} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={i.status === "concluida" ? "Reabrir" : "Concluir"} disabled={!proprio} onClick={() => onConcluir(i, i.status !== "concluida")}>
        <CheckSquare className={cn("h-3 w-3", i.status === "concluida" ? "text-success" : "text-muted-foreground")} />
      </button>
      <button type="button" className={cn("min-w-0 flex-1 truncate text-left hover:underline", i.status === "concluida" && "line-through")} onClick={() => i.origem === "tarefa" && onAbrirTarefa(i.id)}>
        {i.origem === "projeto" ? "📁 " : ""}{i.titulo}
      </button>
    </div>
  );

  return (
    <div className="rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <Button size="sm" variant="outline" onClick={() => { setRef(hojeISO()); if (vista === "personalizado") { setDeP(hojeISO()); setAteP(somarDias(hojeISO(), dias.length - 1)); } }}>Hoje</Button>
        <Button size="icon" variant="ghost" aria-label="Anterior" onClick={() => navegar(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Próximo" onClick={() => navegar(1)}><ChevronRight className="h-4 w-4" /></Button>
        <h3 className="mr-auto text-base font-semibold capitalize">{titulo}</h3>
        <label className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />
          <Input type="date" className="h-8 w-36" value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} aria-label="Ir para a data" />
        </label>
        {vista === "personalizado" && (
          <div className="flex items-center gap-1 text-xs">
            <Input type="date" className="h-8 w-36" value={deP} onChange={(e) => e.target.value && setDeP(e.target.value)} aria-label="Início" />
            <span>até</span>
            <Input type="date" className="h-8 w-36" value={ateP} min={deP} onChange={(e) => e.target.value && setAteP(e.target.value)} aria-label="Fim" />
          </div>
        )}
        <Select value={vista} onValueChange={(v) => setVista(v as Vista)}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[80]">
            <SelectItem value="ano">Ano</SelectItem>
            <SelectItem value="4dias">4 dias</SelectItem>
            <SelectItem value="dia">Dia</SelectItem>
            <SelectItem value="mes">Mês</SelectItem>
            <SelectItem value="personalizado">Personalizado</SelectItem>
            <SelectItem value="programacao">Programação (lista)</SelectItem>
            <SelectItem value="semana">Semana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {horaria && (
        <div>
          <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0,1fr))` }}>
            <div className="p-1 text-[10px] text-muted-foreground">Dia todo</div>
            {dias.map((d) => (
              <div key={d} className="min-w-0 border-l border-border p-1" onClick={() => abrirRapido(d)}>
                <button type="button" onClick={(e) => { e.stopPropagation(); irPara(d); }} className="flex w-full flex-col items-center">
                  <span className="text-[10px] uppercase text-muted-foreground">{nomeDia(d, { weekday: "short" })}</span>
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-lg", d === hojeISO() && "bg-primary text-primary-foreground")}>{d.slice(8, 10)}</span>
                </button>
                <div className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">{tarefasDoDia(d).map((i) => <ChipTarefa key={i.id} i={i} />)}</div>
              </div>
            ))}
          </div>
          <div ref={grade} className="relative max-h-[640px] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0,1fr))` }}>
              <div>{Array.from({ length: 24 }, (_, h) => <div key={h} style={{ height: HORA_PX }} className="pr-1 text-right text-[10px] text-muted-foreground">{h ? `${String(h).padStart(2, "0")}:00` : ""}</div>)}</div>
              {dias.map((d) => (
                <div key={d} className="relative border-l border-border">
                  {Array.from({ length: 48 }, (_, n) => (
                    <div key={n} style={{ height: HORA_PX / 2 }} onClick={() => abrirRapido(d, Math.floor(n / 2), (n % 2) * 30)}
                      className={cn("cursor-pointer hover:bg-muted/60", n % 2 === 1 ? "border-b border-border" : "border-b border-dashed border-border/40")} />
                  ))}
                  {d === hojeISO() && <div className="pointer-events-none absolute inset-x-0 h-0.5 bg-destructive" style={{ top: ((new Date().getHours() * 60 + new Date().getMinutes()) / 60) * HORA_PX }} />}
                  {reunioesDoDia(d).map((r) => {
                    const ini = new Date(r.inicio); const top = ((ini.getHours() * 60 + ini.getMinutes()) / 60) * HORA_PX;
                    return <div key={r.id} className="absolute inset-x-0.5" style={{ top, height: Math.max(20, (r.duracao_min / 60) * HORA_PX - 2) }}><CardReuniao r={r} compacto={r.duracao_min < 45} /></div>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {vista === "mes" && (() => {
        const ini = inicioSemana(`${ref.slice(0, 7)}-01`);
        const cel = Array.from({ length: 42 }, (_, n) => somarDias(ini, n));
        return (
          <div className="grid grid-cols-7">
            {cel.slice(0, 7).map((d) => <div key={d} className="border-b border-border p-1 text-center text-[10px] uppercase text-muted-foreground">{nomeDia(d, { weekday: "short" })}</div>)}
            {cel.map((d) => (
              <div key={d} onClick={() => abrirRapido(d)} className={cn("min-h-24 cursor-pointer border-b border-l border-border p-1 hover:bg-muted/40", d.slice(0, 7) !== ref.slice(0, 7) && "bg-muted/30 text-muted-foreground")}>
                <button type="button" onClick={(e) => { e.stopPropagation(); irPara(d); }} className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", d === hojeISO() && "bg-primary text-primary-foreground")}>{Number(d.slice(8, 10))}</button>
                <div className="space-y-0.5">
                  {reunioesDoDia(d).slice(0, 3).map((r) => <CardReuniao key={r.id} r={r} compacto />)}
                  {tarefasDoDia(d).slice(0, 2).map((i) => <ChipTarefa key={i.id} i={i} />)}
                  {reunioesDoDia(d).length + tarefasDoDia(d).length > 5 && <p className="text-[10px] text-muted-foreground">+{reunioesDoDia(d).length + tarefasDoDia(d).length - 5} mais</p>}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {vista === "ano" && (
        <div className="grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {MESES.map((m, mi) => {
            const primeiro = `${ref.slice(0, 4)}-${String(mi + 1).padStart(2, "0")}-01`;
            const ini = inicioSemana(primeiro);
            return (
              <div key={m}>
                <button type="button" className="mb-1 text-sm font-semibold capitalize hover:underline" onClick={() => irPara(primeiro, "mes")}>{m}</button>
                <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]">
                  {Array.from({ length: 42 }, (_, n) => somarDias(ini, n)).map((d) => {
                    const fora = d.slice(0, 7) !== primeiro.slice(0, 7);
                    const tem = !fora && (reunioesDoDia(d).length > 0 || tarefasDoDia(d).length > 0);
                    return (
                      <button key={d} type="button" disabled={fora} onClick={() => irPara(d)}
                        className={cn("relative h-6 rounded-full", fora ? "opacity-0" : "hover:bg-muted", d === hojeISO() && "bg-primary text-primary-foreground")}>
                        {Number(d.slice(8, 10))}
                        {tem && <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(vista === "programacao" || (vista === "personalizado" && !horaria)) && (
        <div className="divide-y divide-border">
          {dias.filter((d) => reunioesDoDia(d).length || tarefasDoDia(d).length).map((d) => (
            <div key={d} className="grid gap-2 p-2 sm:grid-cols-[160px_1fr]">
              <button type="button" onClick={() => irPara(d)} className="text-left text-sm">
                <b className={cn(d === hojeISO() && "text-primary")}>{nomeDia(d, { day: "2-digit", month: "short" })}</b>
                <span className="ml-1 capitalize text-muted-foreground">{nomeDia(d, { weekday: "short" })}</span>
              </button>
              <div className="space-y-1">
                {reunioesDoDia(d).map((r) => <div key={r.id}><CardReuniao r={r} /></div>)}
                {tarefasDoDia(d).map((i) => <ChipTarefa key={i.id} i={i} />)}
              </div>
            </div>
          ))}
          {!dias.some((d) => reunioesDoDia(d).length || tarefasDoDia(d).length) && <p className="py-10 text-center text-sm text-muted-foreground">Nada agendado neste período.</p>}
        </div>
      )}

      {rapido && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-foreground/30 p-4" onClick={() => setRapido(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <p className="mr-auto text-sm capitalize text-muted-foreground">{rapido.toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
              <Button size="icon" variant="ghost" aria-label="Fechar" onClick={() => setRapido(null)}><X className="h-4 w-4" /></Button>
            </div>
            <Input autoFocus placeholder="Adicionar título (opcional)" value={tituloRapido} onChange={(e) => setTituloRapido(e.target.value)} className="mb-3" />
            <p className="mb-2 text-xs text-muted-foreground">O que deseja criar?</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {([["online", "Reunião online", Video], ["presencial", "Reunião presencial", MapPin], ["tarefa", "Tarefa", CheckSquare]] as const).map(([t, rot, Ic]) => (
                <Button key={t} variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => { onCriar({ tipo: t, inicio: rapido, titulo: tituloRapido }); setRapido(null); }}>
                  <Ic className="h-5 w-5" /><span className="text-xs">{rot}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
