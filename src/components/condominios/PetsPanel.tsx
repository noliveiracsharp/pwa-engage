import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, MessageCircle, PawPrint, Search, Siren } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { especieLabel, ESPECIES_PET, filtrarPets, linkAchei, mensagemAchei, type PetVitrine } from "@/lib/pets";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const PORTE: Record<string, string> = { pequeno: "Pequeno", medio: "Médio", grande: "Grande" };

/** Vitrine de Pets: moradores e gestão veem todos os pets e avisam o tutor pelo WhatsApp. */
export function PetsPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [especie, setEspecie] = useState("todas");
  const [perdidos, setPerdidos] = useState(false);
  const [achei, setAchei] = useState<PetVitrine | null>(null);
  const [sumiu, setSumiu] = useState<PetVitrine | null>(null);
  const chave = ["cond", "pets-vitrine", condominioId];
  const q = useQuery({
    queryKey: chave,
    queryFn: async (): Promise<PetVitrine[]> => {
      const r = await db.rpc("cond_pets_vitrine", { p_condominio: condominioId });
      if (r.error) throw r.error;
      return (r.data ?? []) as PetVitrine[];
    },
  });
  const todos = q.data ?? [];
  const lista = useMemo(() => filtrarPets(todos, { busca, especie, somentePerdidos: perdidos }), [todos, busca, especie, perdidos]);
  const nPerdidos = todos.filter((p) => p.desaparecido).length;
  const podeMarcar = (p: PetVitrine) => p.meu || perms.canUpdate;

  const desmarcar = async (p: PetVitrine) => {
    const r = await db.rpc("cond_pet_desaparecido", { p_id: p.id, p_flag: false, p_obs: null });
    if (r.error) return void toast.error(r.error.message);
    toast.success(`Que bom! ${p.nome} voltou para casa.`);
    void qc.invalidateQueries({ queryKey: chave });
  };

  return (
    <div className="space-y-4">
      {nPerdidos > 0 && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <Siren className="size-5 shrink-0 text-destructive" aria-hidden />
          <p className="flex-1"><strong>{nPerdidos === 1 ? "1 pet desaparecido" : `${nPerdidos} pets desaparecidos`}</strong> no condomínio. Se encontrar, toque em “Achei este pet”.</p>
          <Button size="sm" variant="outline" onClick={() => setPerdidos(true)}>Ver</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar pet" placeholder="Buscar por nome, raça, cor ou unidade…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>
        <div className="w-44">
          <SearchSelect value={especie} onChange={(v) => setEspecie(v || "todas")} options={[{ value: "todas", label: "Todas as espécies" }, ...ESPECIES_PET]} />
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={perdidos} onCheckedChange={setPerdidos} /> Só desaparecidos</label>
      </div>
      {q.error && <p className="text-sm text-destructive">Não foi possível carregar. Rode o script de Pets & Galeria no banco.</p>}
      {!q.isLoading && !q.error && !lista.length && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"><PawPrint className="mx-auto mb-2 size-8 opacity-60" aria-hidden />Nenhum pet encontrado. Os pets são cadastrados na ficha de cada unidade.</div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.map((p) => (
          <li key={p.id} className={cn("flex flex-col overflow-hidden rounded-lg border bg-card", p.desaparecido && "border-2 border-destructive")}>
            <div className="relative">
              {p.foto_url
                ? <img src={p.foto_url} alt={`Foto de ${p.nome}`} loading="lazy" className="h-44 w-full object-cover" />
                : <div className="flex h-44 items-center justify-center bg-muted"><PawPrint className="size-10 text-muted-foreground opacity-50" aria-hidden /></div>}
              {p.desaparecido && <Badge className="absolute left-2 top-2 bg-destructive text-destructive-foreground"><AlertTriangle className="mr-1 size-3" aria-hidden />Desaparecido</Badge>}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
              <p className="text-base font-semibold">{p.nome}</p>
              <p className="text-xs text-muted-foreground">{[especieLabel(p.especie), p.raca, p.porte ? PORTE[p.porte] : null, p.cor].filter(Boolean).join(" · ")}</p>
              <p className="text-xs">{[p.bloco, p.unidade ? `Unidade ${p.unidade}` : null].filter(Boolean).join(" · ")}{p.tutor ? ` · Tutor: ${p.tutor}` : ""}</p>
              {p.desaparecido && (
                <p className="rounded bg-destructive/10 p-1.5 text-xs">
                  Sumiu {p.desaparecido_em ? `em ${new Date(p.desaparecido_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}{p.desaparecido_obs ? ` — ${p.desaparecido_obs}` : ""}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                {!p.meu && <Button size="sm" variant={p.desaparecido ? "default" : "outline"} onClick={() => setAchei(p)}><MessageCircle className="mr-1 size-4" aria-hidden />Achei este pet</Button>}
                {podeMarcar(p) && (p.desaparecido
                  ? <Button size="sm" variant="outline" onClick={() => void desmarcar(p)}>Já voltou</Button>
                  : <Button size="sm" variant="ghost" onClick={() => setSumiu(p)}>Avisar que sumiu</Button>)}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {achei && <AcheiDialog pet={achei} onClose={() => setAchei(null)} />}
      {sumiu && <SumiuDialog pet={sumiu} onClose={() => setSumiu(null)} onOk={() => void qc.invalidateQueries({ queryKey: chave })} />}
    </div>
  );
}

function AcheiDialog({ pet, onClose }: { pet: PetVitrine; onClose: () => void }) {
  const [local, setLocal] = useState("");
  const msg = mensagemAchei(pet, local);
  const link = linkAchei(pet.telefone, msg);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Você encontrou {pet.nome}?</DialogTitle>
          <DialogDescription>Conte onde está e avisaremos o tutor pelo WhatsApp com uma mensagem pronta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pet-local">Onde você o encontrou?</Label>
          <Input id="pet-local" autoFocus placeholder="Ex.: hall do bloco A, rampa da garagem" value={local} onChange={(e) => setLocal(e.target.value)} />
          <p className="rounded bg-muted p-2 text-xs text-muted-foreground">{msg}</p>
          {!link && <p className="text-sm text-warning-foreground">O tutor não tem celular cadastrado. Avise a portaria.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!link || !local.trim()} onClick={() => { if (link) window.open(link, "_blank", "noopener"); onClose(); }}>
            <MessageCircle className="mr-1 size-4" aria-hidden />Avisar no WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SumiuDialog({ pet, onClose, onOk }: { pet: PetVitrine; onClose: () => void; onOk: () => void }) {
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avisar que {pet.nome} sumiu</DialogTitle>
          <DialogDescription>O pet aparece no topo da vitrine com destaque para todos os moradores.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pet-obs">Onde foi visto pela última vez? (opcional)</Label>
          <Textarea id="pet-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: saiu pelo portão da garagem às 18h, coleira azul" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" disabled={salvando} onClick={async () => {
            setSalvando(true);
            const r = await db.rpc("cond_pet_desaparecido", { p_id: pet.id, p_flag: true, p_obs: obs });
            setSalvando(false);
            if (r.error) return void toast.error(r.error.message);
            toast.success("Alerta publicado para o condomínio.");
            onOk(); onClose();
          }}>Publicar alerta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
