import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, MapPin, Copy, Mail, MessageCircle, Plus, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { confirmar } from "@/components/layout/DialogoGlobal";

const tb = () => supabase.from("reunioes" as never) as unknown as ReturnType<typeof supabase.from>;
type Convidado = { nome: string; email: string; telefone: string };
export type Reuniao = {
  id: string; titulo: string; pauta: string; inicio: string; duracao_min: number; sala: string; video: boolean;
  criado_por: string; participantes: string[]; convidados: Convidado[]; cancelada: boolean;
  modalidade?: "online" | "presencial"; local?: string | null;
};
export const presencial = (r: Pick<Reuniao, "modalidade">) => r.modalidade === "presencial";
export const novaReuniao = (me: string, inicio: Date, duracao = 60): Reuniao => ({ id: "", titulo: "", pauta: "", inicio: inicio.toISOString(), duracao_min: duracao, sala: novaSala(), video: true, criado_por: me, participantes: [], convidados: [], cancelada: false, modalidade: "online", local: "" });

function novaSala() { return `atendeai-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`; }
export const linkReuniao = (r: Pick<Reuniao, "sala" | "video">) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/chamada/${r.sala}${r.video ? "" : "?audio=1"}`;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const textoConvite = (r: Reuniao) =>
  `Olá! Você foi convidado(a) para a reunião *${r.titulo}* em ${quando(r.inicio)} (${r.duracao_min} min).${r.pauta ? `\n\nPauta: ${r.pauta}` : ""}\n\n${presencial(r) ? `Local: ${r.local || "a definir"}` : `Entre pelo link (sem instalar nada): ${linkReuniao(r)}`}`;

export function useReunioes(empresaId: string) {
  return useQuery({
    queryKey: ["reunioes", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const desde = new Date(Date.now() - 400 * 86400000).toISOString();
      const { data, error } = await tb().select("*").eq("empresa_id", empresaId).gte("inicio", desde).order("inicio").limit(2000);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({
        ...(r as unknown as Reuniao),
        participantes: (r["participantes"] as string[]) ?? [],
        convidados: (r["convidados"] as Convidado[]) ?? [],
      }));
    },
    retry: false,
  });
}

export function ReunioesPainel({ me, empresaId, usuarios, onFechar, editar }: { me: string; empresaId: string; usuarios: Row[]; onFechar: () => void; editar?: Reuniao | null }) {
  const qc = useQueryClient();
  const q = useReunioes(empresaId);
  const [form, setForm] = useState<Reuniao | null>(editar ?? null);
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nomes = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["nome"], "Usuário"))])), [usuarios]);
  const emails = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["email"], ""))])), [usuarios]);
  const pessoas = useMemo(() => [...usuarios].filter((u) => String(u["id"]) !== me)
    .sort((a, b) => String(pick(a, ["nome"], "")).localeCompare(String(pick(b, ["nome"], "")), "pt-BR")), [usuarios, me]);
  const minhas = (q.data ?? []).filter((r) => !r.cancelada && (r.criado_por === me || r.participantes.includes(me)));
  const recarregar = () => qc.invalidateQueries({ queryKey: ["reunioes", empresaId] });

  const abrirNova = () => {
    const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
    setForm(novaReuniao(me, d));
  };

  const salvar = async () => {
    if (!form) return;
    if (!form.titulo.trim()) return void toast.error("Informe o título da reunião.");
    const dados = {
      empresa_id: empresaId, criado_por: form.criado_por, titulo: form.titulo.trim(), pauta: form.pauta || null, inicio: form.inicio,
      duracao_min: form.duracao_min, sala: form.sala, video: form.video, participantes: form.participantes,
      convidados: form.convidados.filter((c) => c.nome || c.email || c.telefone),
      modalidade: form.modalidade ?? "online", local: presencial(form) ? (form.local || null) : null,
    };
    if (presencial(form) && !form.local?.trim()) return void toast.error("Informe o endereço da reunião presencial.");
    const r = form.id ? await tb().update(dados as never).eq("id", form.id) : await tb().insert(dados as never);
    if (r.error) return void toast.error(/reunioes|modalidade|local/.test(r.error.message) ? "Rode o script atendeai-planner-agenda.sql no banco." : r.error.message);
    toast.success("Reunião salva.");
    setForm(null);
    void recarregar();
  };

  const cancelar = async (r: Reuniao) => {
    if (!await confirmar(`Cancelar a reunião "${r.titulo}"?`)) return;
    const x = await tb().update({ cancelada: true } as never).eq("id", r.id);
    if (x.error) return void toast.error(x.error.message);
    void recarregar();
  };

  const copiar = async (r: Reuniao) => { await navigator.clipboard.writeText(textoConvite(r)); toast.success("Convite copiado."); };
  const whats = (r: Reuniao, tel?: string) => {
    const n = (tel ?? "").replace(/\D/g, "");
    window.open(`https://wa.me/${n ? (n.length <= 11 ? `55${n}` : n) : ""}?text=${encodeURIComponent(textoConvite(r))}`, "_blank");
  };
  const enviarEmails = async (r: Reuniao) => {
    const para = [...r.convidados.map((c) => c.email), ...r.participantes.map((id) => emails.get(id) ?? "")].filter((e) => /\S+@\S+\.\S+/.test(e));
    if (!para.length) return void toast.error("Nenhum participante tem e-mail cadastrado.");
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("cobranca-regua", { body: { acao: "reuniao_convite", reuniao_id: r.id, para, link: linkReuniao(r) } });
    setEnviando(false);
    const erro = (data as { erro?: string } | null)?.erro;
    if (error || erro) return void toast.error(erro ?? "Atualize a função de e-mail (cobranca-regua v11).");
    toast.success(`Convite enviado para ${para.length} e-mail(s).`);
  };
  const entrar = (r: Reuniao) => window.open(`${linkReuniao(r)}${r.video ? "?" : "&"}org=${r.id}`, "_blank");

  const set = <K extends keyof Reuniao>(k: K, v: Reuniao[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const local = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  return (
    <div className="fixed inset-0 z-[75] flex justify-end bg-background/60" onClick={onFechar}>
      <div className="flex h-full w-full flex-col bg-background shadow-xl lg:w-[60%]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <CalendarClock className="h-5 w-5 text-primary" />
          <h2 className="mr-auto text-lg font-semibold">{form ? (form.id ? "Editar reunião" : "Nova reunião") : "Reuniões"}</h2>
          {!form && <Button size="sm" onClick={abrirNova}><Plus className="mr-1 h-4 w-4" /> Nova reunião</Button>}
          <Button size="sm" variant="ghost" aria-label="Fechar" onClick={onFechar}><X className="h-5 w-5" /></Button>
        </div>

        {form ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div><Label>Título</Label><Input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Alinhamento semanal" /></div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2"><Label>Data e hora</Label><Input type="datetime-local" value={local(form.inicio)} onChange={(e) => e.target.value && set("inicio", new Date(e.target.value).toISOString())} /></div>
                <div><Label>Duração (min)</Label><Input type="number" min={5} step={5} value={form.duracao_min} onChange={(e) => set("duracao_min", Math.max(5, Number(e.target.value) || 60))} /></div>
              </div>
              <div><Label>Pauta</Label><Textarea rows={3} value={form.pauta ?? ""} onChange={(e) => set("pauta", e.target.value)} /></div>
              <div>
                <Label>Tipo de reunião</Label>
                <div className="mt-1 flex gap-2">
                  {(["online", "presencial"] as const).map((m) => (
                    <Button key={m} type="button" size="sm" variant={(form.modalidade ?? "online") === m ? "default" : "outline"} onClick={() => set("modalidade", m)}>
                      {m === "online" ? <><Video className="mr-1 h-4 w-4" /> Online</> : <><MapPin className="mr-1 h-4 w-4" /> Presencial</>}
                    </Button>
                  ))}
                </div>
              </div>
              {presencial(form) ? (
                <div><Label>Endereço / local</Label><Input value={form.local ?? ""} onChange={(e) => set("local", e.target.value)} placeholder="Rua, número, sala, cidade" /></div>
              ) : (
                <>
                  <div className="flex items-center gap-2"><Switch checked={form.video} onCheckedChange={(v) => set("video", v)} /><Label>Reunião com vídeo</Label></div>
                  <div><Label>Link da sala</Label><div className="flex gap-2"><Input readOnly value={linkReuniao(form)} /><Button type="button" size="icon" variant="outline" aria-label="Copiar link" onClick={() => void navigator.clipboard.writeText(linkReuniao(form)).then(() => toast.success("Link copiado."))}><Copy className="h-4 w-4" /></Button></div></div>
                </>
              )}
              <div>
                <Label>Participantes da equipe</Label>
                <Input className="mb-2" placeholder="Pesquisar pessoa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {pessoas.filter((u) => String(pick(u, ["nome"], "")).toLowerCase().includes(busca.toLowerCase())).map((u) => {
                    const id = String(u["id"]), on = form.participantes.includes(id);
                    return (
                      <label key={id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted">
                        <span>{String(pick(u, ["nome"], "Usuário"))}</span>
                        <Switch checked={on} onCheckedChange={(v) => set("participantes", v ? [...form.participantes, id] : form.participantes.filter((x) => x !== id))} />
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between"><Label>Convidados externos</Label>
                  <Button size="sm" variant="outline" onClick={() => set("convidados", [...form.convidados, { nome: "", email: "", telefone: "" }])}><Plus className="mr-1 h-3.5 w-3.5" /> Convidado</Button>
                </div>
                {form.convidados.map((c, i) => (
                  <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    {(["nome", "email", "telefone"] as const).map((k) => (
                      <Input key={k} placeholder={k === "nome" ? "Nome" : k === "email" ? "E-mail" : "WhatsApp"} value={c[k]}
                        onChange={(e) => set("convidados", form.convidados.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
                    ))}
                    <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => set("convidados", form.convidados.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border p-3">
              <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
              <Button onClick={() => void salvar()}>Salvar</Button>
            </div>
          </>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {q.error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">Não foi possível carregar as reuniões. Rode o script atendeai-reunioes.sql no banco.</p>}
            {!q.error && minhas.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma reunião agendada.</p>}
            {minhas.map((r) => {
              const fim = new Date(r.inicio).getTime() + r.duracao_min * 60000;
              const passada = fim < Date.now();
              const org = r.criado_por === me;
              return (
                <div key={r.id} className={cn("rounded-lg border border-border bg-card p-3", passada && "opacity-60")}>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="mr-auto min-w-0">
                      <p className="font-medium">{r.titulo}</p>
                      <p className="text-xs text-muted-foreground">{quando(r.inicio)} · {r.duracao_min} min · {presencial(r) ? `Presencial: ${r.local ?? ""}` : r.video ? "Vídeo" : "Áudio"} · Organizador: {org ? "Você" : nomes.get(r.criado_por) ?? "Usuário"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[...r.participantes.map((id) => (id === me ? "Você" : nomes.get(id) ?? "Usuário")), ...r.convidados.map((c) => c.nome || c.email || c.telefone)].join(", ") || "Sem participantes"}
                      </p>
                    </div>
                    {!presencial(r) && <Button size="sm" onClick={() => entrar(r)}><Video className="mr-1 h-4 w-4" /> Entrar</Button>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => void copiar(r)}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar convite</Button>
                    <Button size="sm" variant="outline" onClick={() => whats(r)}><MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp</Button>
                    {r.convidados.filter((c) => c.telefone).map((c, i) => (
                      <Button key={i} size="sm" variant="ghost" onClick={() => whats(r, c.telefone)}><MessageCircle className="mr-1 h-3.5 w-3.5" /> {c.nome || c.telefone}</Button>
                    ))}
                    <Button size="sm" variant="outline" disabled={enviando} onClick={() => void enviarEmails(r)}><Mail className="mr-1 h-3.5 w-3.5" /> Enviar por e-mail</Button>
                    {org && <Button size="sm" variant="ghost" onClick={() => setForm(r)}>Editar</Button>}
                    {org && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void cancelar(r)}>Cancelar reunião</Button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
