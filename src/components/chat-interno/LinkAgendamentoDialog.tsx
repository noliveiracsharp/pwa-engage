import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONFIG_PADRAO, DIAS_SEMANA, slugAgenda, validarJanelas, type ConfigAgendamento, type Janela } from "@/lib/agendamento";

const tb = () => supabase.from("planner_agendamento" as never) as unknown as ReturnType<typeof supabase.from>;
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const DURACOES = [15, 20, 30, 45, 60, 90, 120];

export function LinkAgendamentoDialog({ open, onOpenChange, me, empresaId, nome }: { open: boolean; onOpenChange: (o: boolean) => void; me: string; empresaId: string; nome: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["planner-agendamento", me], enabled: open && !!me,
    queryFn: async () => {
      const r = await tb().select("*").eq("usuario_id", me).maybeSingle();
      if (r.error) throw r.error;
      return r.data as Row | null;
    },
  });
  const [c, setC] = useState<ConfigAgendamento>(CONFIG_PADRAO);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!open || q.isLoading) return;
    const d = q.data;
    setC(d ? { ...CONFIG_PADRAO, ...(d as unknown as ConfigAgendamento), janelas: (d["janelas"] as ConfigAgendamento["janelas"]) ?? {} } : { ...CONFIG_PADRAO, slug: slugAgenda(nome) });
  }, [open, q.isLoading, q.data, nome]);

  const link = typeof window !== "undefined" ? `${window.location.origin}/agendar/${c.slug}` : "";
  const setJ = (d: number, l: Janela[]) => setC((x) => ({ ...x, janelas: { ...x.janelas, [String(d)]: l } }));

  const salvar = async () => {
    const slug = slugAgenda(c.slug);
    if (slug.length < 3) return void toast.error("Escolha um endereço com pelo menos 3 letras.");
    const erro = validarJanelas(c.janelas);
    if (erro) return void toast.error(erro);
    const janelas = Object.fromEntries(Object.entries(c.janelas).filter(([, l]) => l.length));
    if (c.ativo && !Object.keys(janelas).length) return void toast.error("Abra pelo menos um dia da semana.");
    setSalvando(true);
    const r = await tb().upsert({ ...c, slug, janelas, usuario_id: me, empresa_id: empresaId, updated_at: new Date().toISOString() } as never);
    setSalvando(false);
    if (r.error) {
      const m = r.error.message;
      return void toast.error(m.includes("planner_agendamento") ? "Rode o script atendeai-link-agendamento.sql no banco." : m.includes("duplicate") || m.includes("unique") ? "Esse endereço já está em uso. Escolha outro." : m);
    }
    toast.success("Link de agendamento salvo.");
    void qc.invalidateQueries({ queryKey: ["planner-agendamento", me] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100] flex max-h-[90vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Meu link de agendamento</DialogTitle>
          <DialogDescription>Escolha os dias e horários em que clientes podem marcar reuniões com você.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div><p className="font-medium">Receber agendamentos</p><p className="text-xs text-muted-foreground">Desligado, o link mostra que a agenda está fechada.</p></div>
            <Switch checked={c.ativo} onCheckedChange={(v) => setC({ ...c, ativo: v })} aria-label="Receber agendamentos" />
          </div>
          <div className="space-y-1.5">
            <Label>Endereço do link</Label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-md border border-input pl-2 text-sm text-muted-foreground">
                <span className="truncate">/agendar/</span>
                <Input className="border-0 shadow-none focus-visible:ring-0" value={c.slug} onChange={(e) => setC({ ...c, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
              </div>
              <Button type="button" variant="outline" size="icon" aria-label="Copiar link" onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."))}><Copy className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" size="icon" aria-label="Abrir link" onClick={() => window.open(link, "_blank")}><ExternalLink className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Nome da reunião</Label><Input value={c.titulo} onChange={(e) => setC({ ...c, titulo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Duração</Label>
              <Select value={String(c.duracao_min)} onValueChange={(v) => setC({ ...c, duracao_min: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[110]">{DURACOES.map((d) => <SelectItem key={d} value={String(d)}>{d < 60 ? `${d} minutos` : `${d / 60} hora${d > 60 ? "s" : ""}`}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Pausa entre reuniões (min)</Label><Input type="number" min={0} max={240} value={c.intervalo_min} onChange={(e) => setC({ ...c, intervalo_min: Math.max(0, Number(e.target.value) || 0) })} /></div>
            <div className="space-y-1.5"><Label>Antecedência mínima (horas)</Label><Input type="number" min={0} max={720} value={c.antecedencia_h} onChange={(e) => setC({ ...c, antecedencia_h: Math.max(0, Number(e.target.value) || 0) })} /></div>
            <div className="space-y-1.5"><Label>Pode marcar até (dias à frente)</Label><Input type="number" min={1} max={365} value={c.horizonte_dias} onChange={(e) => setC({ ...c, horizonte_dias: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })} /></div>
            <div className="space-y-1.5"><Label>Como será</Label>
              <Select value={c.modalidade} onValueChange={(v) => setC({ ...c, modalidade: v as ConfigAgendamento["modalidade"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[110]"><SelectItem value="presencial">Presencial</SelectItem><SelectItem value="online">Vídeo chamada</SelectItem></SelectContent>
              </Select>
            </div>
            {c.modalidade === "presencial" && <div className="space-y-1.5 sm:col-span-2"><Label>Endereço</Label><Input value={c.local} onChange={(e) => setC({ ...c, local: e.target.value })} /></div>}
            <div className="space-y-1.5 sm:col-span-2"><Label>Mensagem para quem vai agendar</Label><Textarea rows={2} value={c.descricao} onChange={(e) => setC({ ...c, descricao: e.target.value })} placeholder="Escolha o melhor dia e horário para conversarmos." /></div>
          </div>
          <div className="space-y-2">
            <Label>Dias e horários disponíveis (horário de Brasília)</Label>
            {ORDEM.map((d) => {
              const l = c.janelas[String(d)] ?? [];
              return (
                <div key={d} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-2">
                  <label className="flex w-32 items-center gap-2 pt-1.5 text-sm font-medium">
                    <Switch checked={l.length > 0} onCheckedChange={(v) => setJ(d, v ? [{ inicio: "09:00", fim: "17:00" }] : [])} aria-label={DIAS_SEMANA[d]} />{DIAS_SEMANA[d]}
                  </label>
                  <div className="flex-1 space-y-1.5">
                    {!l.length && <p className="pt-1.5 text-sm text-muted-foreground">Indisponível</p>}
                    {l.map((j, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" className="h-8 w-28" value={j.inicio} aria-label="Início" onChange={(e) => setJ(d, l.map((x, k) => k === i ? { ...x, inicio: e.target.value } : x))} />
                        <span className="text-sm text-muted-foreground">até</span>
                        <Input type="time" className="h-8 w-28" value={j.fim} aria-label="Fim" onChange={(e) => setJ(d, l.map((x, k) => k === i ? { ...x, fim: e.target.value } : x))} />
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Remover horário" onClick={() => setJ(d, l.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                        {i === l.length - 1 && <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Adicionar horário" onClick={() => setJ(d, [...l, { inicio: j.fim, fim: j.fim < "23:00" ? `${String(Number(j.fim.slice(0, 2)) + 1).padStart(2, "0")}${j.fim.slice(2)}` : "23:59" }])}><Plus className="h-4 w-4" /></Button>}
                      </div>
                    ))}
                  </div>
                  {l.length > 0 && <Button type="button" size="sm" variant="link" className="h-8 px-0 text-xs" onClick={() => setC((x) => ({ ...x, janelas: Object.fromEntries(ORDEM.map((k) => [String(k), (x.janelas[String(k)]?.length ? l : x.janelas[String(k)]) ?? []])) }))}>Copiar para os dias abertos</Button>}
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">Reuniões já marcadas e horários indisponíveis da sua agenda nunca aparecem para o cliente.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={salvando} onClick={() => void salvar()}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
