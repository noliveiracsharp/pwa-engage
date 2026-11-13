import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, Download, ExternalLink, LocateFixed, Pencil, Plus, Printer, ShieldAlert, Trash2, Trees, DoorOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import type { Row } from "@/lib/row";
import { s } from "./cond-data";
import { AcaoIcone } from "./AcaoIcone";
import { gerarFolhaA4Placas, gerarPlacaInterfone, imprimirFolhaPlacas } from "./placa-interfone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const TIPOS: Record<string, { l: string; d: string; i: typeof DoorOpen }> = {
  espaco: { l: "Espaço comum", d: "Churrasqueira, piscina, academia: chama portaria, administração e ramais.", i: Trees },
  portao: { l: "Portão / entrada", d: "Outro portão: também chama as unidades.", i: DoorOpen },
  sos: { l: "Emergência (SOS)", d: "Garagem, elevador: botão grande para a portaria.", i: ShieldAlert },
};
function codigo(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}
const VAZIO = { id: "", nome: "", tipo: "espaco", slug: "", mostrar_unidades: false, ativo: true, geo_ativo: false, geo_lat: null as number | null, geo_lng: null as number | null, geo_raio_m: 80 };

export function InterfonePontos({ condominioId, nomeCondominio, canUpdate }: { condominioId: string; nomeCondominio: string; canUpdate: boolean }) {
  const qc = useQueryClient();
  const chave = ["cond", "interfone_pontos", condominioId];
  const q = useQuery({ queryKey: chave, queryFn: async () => { const r = await db.from("cond_interfone_pontos").select("*").eq("condominio_id", condominioId).order("nome"); if (r.error) throw r.error; return (r.data ?? []) as Row[]; } });
  const [f, setF] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);
  const link = (slug: string) => `${window.location.origin}/interfone/${slug}`;
  const tipos = Object.entries(TIPOS).map(([value, t]) => ({ value, label: t.l })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const placa = async (r: Row) => {
    const qr = await QRCode.toDataURL(link(s(r["slug"])), { width: 900, margin: 1, errorCorrectionLevel: "H" });
    return gerarPlacaInterfone(`${nomeCondominio} · ${s(r["nome"])}`, qr);
  };
  const baixar = async (r: Row) => { const a = document.createElement("a"); a.href = await gerarFolhaA4Placas(await placa(r)); a.download = `placas-interfone-${s(r["slug"])}.png`; a.click(); };
  const imprimir = async (r: Row) => imprimirFolhaPlacas(await placa(r));

  const salvar = async () => {
    if (!f) return;
    if (f.nome.trim().length < 2) return toast.error("Informe o nome do ponto.");
    if (f.geo_ativo && (f.geo_lat == null || f.geo_lng == null)) return toast.error("Marque a localização do ponto antes de ligar a cerca virtual.");
    setSalvando(true);
    const { id, ...resto } = f;
    const dados = { ...resto, nome: f.nome.trim(), condominio_id: condominioId, slug: f.slug || codigo(), mostrar_unidades: f.tipo === "portao" ? f.mostrar_unidades : false };
    const { error } = id ? await db.from("cond_interfone_pontos").update(dados).eq("id", id) : await db.from("cond_interfone_pontos").insert(dados);
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Ponto salvo."); setF(null);
    void qc.invalidateQueries({ queryKey: chave });
  };
  const excluir = async (r: Row) => {
    if (!(await confirmar({ title: "Excluir ponto?", description: `O QR Code de "${s(r["nome"])}" para de funcionar.`, confirmText: "Excluir", destructive: true }))) return;
    const { error } = await db.from("cond_interfone_pontos").delete().eq("id", s(r["id"]));
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: chave });
  };
  const marcar = () => {
    if (!navigator.geolocation || !f) return toast.error("Este aparelho não informa localização.");
    navigator.geolocation.getCurrentPosition(
      (p) => { setF((x) => x && ({ ...x, geo_lat: p.coords.latitude, geo_lng: p.coords.longitude })); toast.success(`Local marcado (precisão de ${Math.round(p.coords.accuracy)} m).`); },
      () => toast.error("Não foi possível obter a localização."), { enableHighAccuracy: true, timeout: 15000 });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Espalhe QR Codes pelo condomínio. Cada ponto tem endereço próprio e mostra onde a pessoa está ao chamar.</p>
        {canUpdate && <Button onClick={() => setF({ ...VAZIO })}><Plus className="size-4" /> Novo ponto</Button>}
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(q.data ?? []).map((r) => {
          const t = TIPOS[s(r["tipo"])] ?? TIPOS["espaco"]!;
          const I = t.i;
          return (
            <li key={s(r["id"])} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2"><I className="mt-0.5 size-5 text-primary" aria-hidden /><div><p className="font-medium">{s(r["nome"])}</p><p className="text-xs text-muted-foreground">{t.l}{r["geo_ativo"] ? " · cerca virtual" : ""}</p></div></div>
                {r["ativo"] === false && <Badge variant="outline">Inativo</Badge>}
              </div>
              <div className="flex flex-wrap gap-1">
                <AcaoIcone titulo="Copiar link" onClick={() => { void navigator.clipboard.writeText(link(s(r["slug"]))); toast.success("Link copiado."); }}><Copy className="size-4" /></AcaoIcone>
                <AcaoIcone titulo="Baixar 4 placas (A4)" onClick={() => void baixar(r)}><Download className="size-4" /></AcaoIcone>
                <AcaoIcone titulo="Imprimir 4 placas (A4)" onClick={() => void imprimir(r)}><Printer className="size-4" /></AcaoIcone>
                <AcaoIcone titulo="Testar" onClick={() => window.open(link(s(r["slug"])), "_blank", "noopener")}><ExternalLink className="size-4" /></AcaoIcone>
                {canUpdate && <>
                  <AcaoIcone titulo="Editar ponto" onClick={() => setF({ id: s(r["id"]), nome: s(r["nome"]), tipo: s(r["tipo"]), slug: s(r["slug"]), mostrar_unidades: r["mostrar_unidades"] === true, ativo: r["ativo"] !== false, geo_ativo: r["geo_ativo"] === true, geo_lat: r["geo_lat"] == null ? null : Number(r["geo_lat"]), geo_lng: r["geo_lng"] == null ? null : Number(r["geo_lng"]), geo_raio_m: Number(r["geo_raio_m"] ?? 80) })}><Pencil className="size-4" /></AcaoIcone>
                  <AcaoIcone titulo="Excluir ponto" destrutivo onClick={() => void excluir(r)}><Trash2 className="size-4" /></AcaoIcone>
                </>}
              </div>
            </li>
          );
        })}
        {!q.data?.length && <li className="col-span-full rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{q.isLoading ? "Carregando…" : "Nenhum ponto extra. O QR Code do portão principal continua na aba Configuração."}</li>}
      </ul>

      <Dialog open={!!f} onOpenChange={(o) => !o && setF(null)}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{f?.id ? "Editar ponto" : "Novo ponto de QR Code"}</DialogTitle></DialogHeader>
          {f && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="pt-nome">Nome do local</Label><Input id="pt-nome" value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Churrasqueira 1" /></div>
              <div className="space-y-1.5"><Label htmlFor="pt-tipo">Tipo</Label><SearchSelect id="pt-tipo" allowClear={false} value={f.tipo} onChange={(v) => setF({ ...f, tipo: v || "espaco" })} options={tipos} /><p className="text-xs text-muted-foreground">{TIPOS[f.tipo]?.d}</p></div>
              {f.tipo === "portao" && <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>Permitir chamar unidades</span><Switch checked={f.mostrar_unidades} onCheckedChange={(c) => setF({ ...f, mostrar_unidades: c })} /></label>}
              <div className="space-y-3 rounded-md border p-3">
                <label className="flex items-center justify-between gap-3 text-sm"><span>Cerca virtual<span className="block text-xs text-muted-foreground">Só chama quem está perto deste QR Code.</span></span><Switch checked={f.geo_ativo} onCheckedChange={(c) => setF({ ...f, geo_ativo: c })} /></label>
                {f.geo_ativo && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                    <div className="space-y-1.5"><Button type="button" variant="outline" size="sm" onClick={marcar}><LocateFixed className="size-4" /> Usar minha localização</Button><p className="text-xs text-muted-foreground">{f.geo_lat != null ? "Local marcado." : "Fique ao lado do QR Code e toque no botão."}</p></div>
                    <div className="space-y-1.5"><Label htmlFor="pt-raio">Raio (m)</Label><Input id="pt-raio" type="number" min={30} max={2000} value={f.geo_raio_m} onChange={(e) => setF({ ...f, geo_raio_m: Math.min(2000, Math.max(30, Number(e.target.value) || 80)) })} /></div>
                  </div>
                )}
              </div>
              {f.id && <Button type="button" variant="ghost" size="sm" onClick={() => void confirmar({ title: "Gerar novo link?", description: "O QR Code impresso deste ponto deixa de funcionar ao salvar.", confirmText: "Gerar" }).then((ok) => ok && setF((x) => x && ({ ...x, slug: codigo() })))}>Gerar novo link</Button>}
              <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>Ativo</span><Switch checked={f.ativo} onCheckedChange={(c) => setF({ ...f, ativo: c })} /></label>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setF(null)}>Cancelar</Button><Button disabled={salvando} onClick={() => void salvar()}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
