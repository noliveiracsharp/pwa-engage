import { useMemo, useState } from "react";
import { BadgeCheck, Briefcase, Camera, Hammer, Images, Luggage, Pencil, Plus, Search, Settings2, Star, Trash2, Trees, Truck, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UploadInfo } from "@/components/ui/upload-info";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { comprimirImagem } from "@/lib/image-compress";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { ordemNatural, s, useCondRows, useCondSalvar } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
type Foto = { url: string; legenda?: string };
const fotosDe = (r: Row | null): Foto[] => (Array.isArray(r?.["fotos"]) ? (r!["fotos"] as Foto[]).filter((f) => f?.url) : []);

type Tipo = "social" | "operacional";
type Icone = "mudanca" | "reforma" | "locacao" | "prestador" | "visitante" | "outro";
const ICONES: Record<Icone, { label: string; Icon: LucideIcon; cor: string }> = {
  locacao: { label: "Locação temporária", Icon: Luggage, cor: "text-chart-1" },
  mudanca: { label: "Mudança", Icon: Truck, cor: "text-chart-2" },
  outro: { label: "Outro", Icon: Settings2, cor: "text-muted-foreground" },
  prestador: { label: "Prestador de serviço", Icon: Briefcase, cor: "text-chart-3" },
  reforma: { label: "Reforma", Icon: Hammer, cor: "text-chart-4" },
  visitante: { label: "Visitante", Icon: BadgeCheck, cor: "text-chart-5" },
};
/** Registros antigos sem tipo: deduz pelo nome. */
function inferir(nome: string): { tipo: Tipo; icone: Icone } | null {
  const n = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/mudan/.test(n)) return { tipo: "operacional", icone: "mudanca" };
  if (/reform|obra/.test(n)) return { tipo: "operacional", icone: "reforma" };
  if (/loca|short|hosped|temporar/.test(n)) return { tipo: "operacional", icone: "locacao" };
  if (/prestador|servico/.test(n)) return { tipo: "operacional", icone: "prestador" };
  if (/visit/.test(n)) return { tipo: "operacional", icone: "visitante" };
  return null;
}
const tipoDe = (r: Row | null): Tipo => (r?.["tipo"] === "operacional" || r?.["tipo"] === "social" ? (r["tipo"] as Tipo) : inferir(s(r?.["nome"]))?.tipo ?? "social");
const iconeDe = (r: Row | null): Icone => (s(r?.["icone"]) in ICONES ? (s(r?.["icone"]) as Icone) : inferir(s(r?.["nome"]))?.icone ?? "outro");

async function enviarFoto(original: File): Promise<string | null> {
  const file = await comprimirImagem(original, "chat");
  const path = `espacos/${crypto.randomUUID()}.${(original.name.split(".").pop() || "jpg").toLowerCase()}`;
  const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
  if (up.error) { toast.error(`Falha no envio da foto: ${up.error.message}`); return null; }
  return supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
}

/** Espaços & Reservas: cadastro das áreas comuns do condomínio (somente administração). */
export function EspacosPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const { data: rows = [], isLoading } = useCondRows("cond_espacos", "condominio_id", condominioId, "ordem");
  const salvar = useCondSalvar("cond_espacos");
  const [busca, setBusca] = useState("");
  const [editar, setEditar] = useState<Row | "novo" | null>(null);
  const [galeria, setGaleria] = useState<Foto[] | null>(null);
  const [aba, setAba] = useState<"todos" | Tipo>("todos");
  const contagem = useMemo(() => ({ todos: rows.length, social: rows.filter((r) => tipoDe(r) === "social").length, operacional: rows.filter((r) => tipoDe(r) === "operacional").length }), [rows]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return rows
      .filter((r) => (aba === "todos" || tipoDe(r) === aba) && (!t || s(r["nome"]).toLowerCase().includes(t)))
      .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0) || ordemNatural(s(a["nome"]), s(b["nome"])));
  }, [rows, busca, aba]);

  const excluir = async (r: Row) => {
    if (!(await confirmar({ title: "Excluir espaço", description: `Excluir "${s(r["nome"])}"? Prefira inativar se ele já tiver histórico.`, destructive: true }))) return;
    salvar.mutate({ id: s(r["id"]), excluir: true }, { onSuccess: () => toast.success("Espaço excluído.") });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar espaço..." className="pl-8" aria-label="Buscar espaço" />
        </div>
        {perms.canCreate && <Button onClick={() => setEditar("novo")}><Plus className="size-4" /> Novo cadastro</Button>}
      </div>

      <div role="tablist" aria-label="Tipo" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {([["todos", "Todos"], ["social", "Espaços sociais"], ["operacional", "Operacionais"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={cn("rounded-md px-3 py-1.5 text-sm transition-colors", aba === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {l} <span className="ml-1 text-xs text-muted-foreground">{contagem[k]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <Trees className="mx-auto mb-2 size-8 opacity-50" />
          {rows.length ? "Nenhum espaço encontrado." : "Cadastre as áreas comuns: salão de festas, churrasqueiras, academia, espaço pet..."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((r) => {
            const fotos = fotosDe(r);
            const ativo = r["ativo"] !== false;
            const tipo = tipoDe(r);
            const ic = ICONES[iconeDe(r)];
            return (
              <div key={s(r["id"])} className={cn("overflow-hidden rounded-lg border bg-card", !ativo && "opacity-60")}>
                <button type="button" className="relative block aspect-video w-full bg-muted" onClick={() => fotos.length && setGaleria(fotos)} aria-label="Ver fotos">
                  {fotos[0] ? <img src={fotos[0].url} alt={s(r["nome"])} loading="lazy" className="size-full object-cover" /> : tipo === "operacional"
                    ? <span className="absolute inset-0 flex flex-col items-center justify-center gap-2"><ic.Icon className={cn("size-12", ic.cor)} /><span className="text-xs text-muted-foreground">{ic.label}</span></span>
                    : <Trees className="absolute inset-0 m-auto size-10 text-muted-foreground opacity-40" />}
                  {fotos.length > 1 && <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-xs"><Images className="size-3" />{fotos.length}</span>}
                </button>
                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{s(r["nome"])}</h3>
                    <div className="flex shrink-0">
                      {perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEditar(r)}><Pencil className="size-4" /></AcaoIcone>}
                      {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={() => excluir(r)}><Trash2 className="size-4" /></AcaoIcone>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={ativo ? "default" : "secondary"}>{ativo ? "Ativo" : "Inativo"}</Badge>
                    <Badge variant="secondary">{tipo === "social" ? "Espaço social" : "Operacional"}</Badge>
                    <Badge variant="outline">{r["permite_agendamento"] !== false ? "Permite reserva" : "Uso livre"}</Badge>
                    {r["capacidade_pessoas"] ? <Badge variant="outline" className="gap-1"><Users className="size-3" />{s(r["capacidade_pessoas"])}</Badge> : null}
                  </div>
                  {s(r["descricao"]) && <p className="line-clamp-2 text-sm text-muted-foreground">{s(r["descricao"])}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editar && (
        <EspacoSheet
          registro={editar === "novo" ? null : editar}
          proximaOrdem={rows.length}
          onClose={() => setEditar(null)}
          onSalvar={(valores, id) =>
            salvar.mutate(id ? { id, valores } : { valores: { ...valores, condominio_id: condominioId } }, {
              onSuccess: () => { toast.success("Espaço salvo."); setEditar(null); },
            })
          }
          salvando={salvar.isPending}
        />
      )}

      <Dialog open={!!galeria} onOpenChange={(o) => !o && setGaleria(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Fotos do espaço</DialogTitle></DialogHeader>
          <div className="grid max-h-[70vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {galeria?.map((f) => <img key={f.url} src={f.url} alt={f.legenda || "Foto do espaço"} className="w-full rounded-md object-cover" />)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EspacoSheet({ registro, proximaOrdem, onClose, onSalvar, salvando }: {
  registro: Row | null; proximaOrdem: number; onClose: () => void; salvando: boolean;
  onSalvar: (valores: Row, id?: string) => void;
}) {
  const [nome, setNome] = useState(s(registro?.["nome"]));
  const [tipo, setTipo] = useState<Tipo>(tipoDe(registro));
  const [icone, setIcone] = useState<Icone>(iconeDe(registro));
  const [ativo, setAtivo] = useState(registro?.["ativo"] !== false);
  const [reserva, setReserva] = useState(registro?.["permite_agendamento"] !== false);
  const [capacidade, setCapacidade] = useState(s(registro?.["capacidade_pessoas"]));
  const [descricao, setDescricao] = useState(s(registro?.["descricao"]));
  const [fotos, setFotos] = useState<Foto[]>(fotosDe(registro));
  const [enviando, setEnviando] = useState(false);

  const adicionar = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    const novas: Foto[] = [];
    for (const f of Array.from(files)) { const url = await enviarFoto(f); if (url) novas.push({ url }); }
    setFotos((p) => [...p, ...novas]);
    setEnviando(false);
  };

  const gravar = () => {
    if (!nome.trim()) { toast.error("Informe o nome do espaço."); return; }
    const cap = capacidade.trim() ? Math.max(1, Math.round(Number(capacidade))) : null;
    onSalvar({
      nome: nome.trim(), tipo, icone: tipo === "operacional" ? icone : null, ativo, permite_agendamento: reserva,
      capacidade_pessoas: tipo === "social" && Number.isFinite(cap) ? cap : null,
      descricao: descricao.trim() || null, fotos, updated_at: new Date().toISOString(),
      ...(registro ? {} : { ordem: proximaOrdem }),
    }, registro ? s(registro["id"]) : undefined);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-full lg:w-[60vw] lg:max-w-[60vw]" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-4"><SheetTitle>{registro ? "Editar cadastro" : "Novo cadastro"}</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([["social", "Espaço social / lazer", "Salão, churrasqueira, academia, piscina...", Trees], ["operacional", "Operacional / serviços", "Mudança, reforma, locação temporária, visitantes...", Settings2]] as const).map(([k, t, d, I]) => (
                <button key={k} type="button" aria-pressed={tipo === k} onClick={() => setTipo(k)}
                  className={cn("flex items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors", tipo === k ? "border-primary bg-primary/5" : "hover:bg-muted")}>
                  <I className="mt-0.5 size-5 shrink-0" /><span><span className="font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
                </button>
              ))}
            </div>
          </div>
          {tipo === "operacional" && (
            <div className="space-y-1.5">
              <Label>Natureza</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ICONES) as Icone[]).sort((a, b) => ICONES[a].label.localeCompare(ICONES[b].label, "pt-BR")).map((k) => {
                  const it = ICONES[k];
                  return (
                    <button key={k} type="button" aria-pressed={icone === k} onClick={() => setIcone(k)}
                      className={cn("flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm", icone === k ? "border-primary bg-primary/5" : "hover:bg-muted")}>
                      <it.Icon className={cn("size-4", it.cor)} />{it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="esp-nome">Nome *</Label>
            <Input id="esp-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Salão de Festas, Churrasqueira 1" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span><span className="font-medium">Ativo</span><span className="block text-xs text-muted-foreground">Inativo some para os moradores.</span></span>
              <Switch checked={ativo} onCheckedChange={setAtivo} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span><span className="font-medium">Permite reserva</span><span className="block text-xs text-muted-foreground">Desligado = uso livre, sem agendamento.</span></span>
              <Switch checked={reserva} onCheckedChange={setReserva} />
            </label>
          </div>
          {tipo === "social" && <div className="space-y-1.5">
            <Label htmlFor="esp-cap">Capacidade (pessoas)</Label>
            <Input id="esp-cap" type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} placeholder="Opcional" className="max-w-40" />
          </div>}
          <div className="space-y-1.5">
            <Label htmlFor="esp-desc">Descrição / orientações</Label>
            <Textarea id="esp-desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: fica no térreo da Torre A, possui geladeira e 10 mesas." />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{tipo === "social" ? "Fotos do local" : "Imagens (opcional)"}</Label>
              <UploadInfo perfil="chat" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {fotos.map((f, i) => (
                <div key={f.url} className="group relative aspect-square overflow-hidden rounded-md border">
                  <img src={f.url} alt={`Foto ${i + 1}`} className="size-full object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">Capa</span>}
                  <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1">
                    {i > 0 && <Button type="button" size="icon" variant="secondary" className="size-7" title="Usar como capa" aria-label="Usar como capa" onClick={() => setFotos((p) => [p[i]!, ...p.filter((_, j) => j !== i)])}><Star className="size-3.5" /></Button>}
                    <Button type="button" size="icon" variant="destructive" className="size-7" title="Remover foto" aria-label="Remover foto" onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
              ))}
              <label className={cn("flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted", enviando && "pointer-events-none opacity-60")}>
                <Camera className="size-5" />{enviando ? "Enviando..." : "Adicionar fotos"}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void adicionar(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={gravar} disabled={salvando || enviando}>{salvando ? "Salvando..." : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
